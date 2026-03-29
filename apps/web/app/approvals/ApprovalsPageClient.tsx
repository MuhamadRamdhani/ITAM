"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../lib/api";
import { SkeletonTableRow, ErrorState } from "../lib/loadingComponents";

type ApprovalItem = {
  id: number | string;
  subject_type: string;
  subject_id: number | string;
  action_code: string;
  status_code: string;
  requested_at: string;
  payload?: any;
};

type ApprovalListData = {
  total: number;
  items: ApprovalItem[];
};

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function statusPill(status: string) {
  const s = (status ?? "").toUpperCase();
  if (s === "PENDING") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "REJECTED") return "rounded-full bg-red-50 px-2 py-1 text-xs text-red-800";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function buildApprovalsHref(params: {
  status: string;
  q: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();
  if (params.status) p.set("status", params.status);
  if (params.q) p.set("q", params.q);
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  if (params.page && params.page > 0) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/approvals?${qs}` : "/approvals";
}

function getErrorMessage(error: unknown, fallback = "Failed to load approvals") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function normalizeUiConfig(res: any): UiConfigNormalized {
  const raw = res?.data?.data ?? res?.data ?? {};
  const optionsRaw =
    raw?.page_size_options ??
    raw?.ui?.page_size?.options ??
    [];

  const pageSizeOptions = Array.isArray(optionsRaw)
    ? optionsRaw
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const safeOptions = pageSizeOptions.length > 0 ? pageSizeOptions : [10, 20, 50];

  const defaultRaw = Number(
    raw?.documents_page_size_default ??
      raw?.ui?.documents?.page_size?.default ??
      safeOptions[0]
  );

  const pageSizeDefault = safeOptions.includes(defaultRaw) ? defaultRaw : safeOptions[0];

  return { pageSizeOptions: safeOptions, pageSizeDefault };
}

function normalizeApprovalList(res: any): ApprovalListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    total: Number(raw?.total ?? 0),
    items: Array.isArray(raw?.items) ? raw.items : [],
  };
}

export default function ApprovalsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") || "PENDING").trim() || "PENDING";
  const q = (searchParams.get("q") || "").trim();
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);

  const currentReturnTo = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/approvals?${qs}` : "/approvals";
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([10, 20, 50]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [searchQ, setSearchQ] = useState(q);

  useEffect(() => {
    setSearchQ(q);
  }, [q]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const cfgRes = await apiGet<any>("/api/v1/config/ui", {
          loadingKey: "approvals_config",
        });
        const cfg = normalizeUiConfig(cfgRes);

        if (!active) return;

        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize = cfg.pageSizeOptions.includes(pageSizeFromUrl)
          ? pageSizeFromUrl
          : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const qs = new URLSearchParams();
        if (status) qs.set("status", status);
        if (q) qs.set("q", q);
        qs.set("page", String(pageFromUrl));
        qs.set("page_size", String(effectivePageSize));

        const res = await apiGet<any>(`/api/v1/approvals?${qs.toString()}`, {
          loadingKey: "approvals_list",
          loadingDelay: 300,
        });
        const data = normalizeApprovalList(res);

        if (!active) return;

        setItems(data.items);
        setTotal(data.total);
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setItems([]);
        setTotal(0);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [status, q, pageFromUrl, pageSizeFromUrl]);

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(
      buildApprovalsHref({
        status,
        q: searchQ.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  function onPageSizeChange(nextPageSize: number) {
    router.push(
      buildApprovalsHref({
        status,
        q,
        page: 1,
        pageSize: nextPageSize,
      })
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Approvals</h1>
            <p className="mt-1 text-sm text-gray-600">Queue approval (MVP1.3).</p>
          </div>

          <Link
            href="/"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm font-medium text-gray-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STATUSES.map((s) => (
                <Link
                  key={s}
                  href={buildApprovalsHref({ status: s, q, page: 1, pageSize })}
                  className={status === s ? "border-b-2 border-blue-600 pb-1 text-blue-700" : "pb-1 hover:text-gray-900"}
                >
                  {s}
                </Link>
              ))}
            </div>

            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-center lg:justify-end"
              onSubmit={onSearchSubmit}
            >
              <select
                value={String(pageSize)}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="rounded-md border px-3 py-2 text-sm"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} / page
                  </option>
                ))}
              </select>

              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search action/subject..."
                className="w-full rounded-md border px-3 py-2 text-sm sm:w-72"
              />

              <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

          {err ? (
            <div className="mt-4">
              <ErrorState
                error={err}
                onRetry={() => {
                  window.location.reload();
                }}
              />
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4">From → To</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Skeleton loading - 5 placeholder rows
                  <>
                    <SkeletonTableRow cols={6} />
                    <SkeletonTableRow cols={6} />
                    <SkeletonTableRow cols={6} />
                    <SkeletonTableRow cols={6} />
                    <SkeletonTableRow cols={6} />
                  </>
                ) : items.length === 0 ? (
                  <tr className="border-t">
                    <td colSpan={6} className="py-6 text-gray-600">
                      Tidak ada approvals.
                    </td>
                  </tr>
                ) : (
                  items.map((a) => {
                    const detailHref = `/approvals/${a.id}?returnTo=${encodeURIComponent(currentReturnTo)}`;

                    return (
                      <tr key={String(a.id)} className="border-t">
                        <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(a.requested_at)}</td>
                        <td className="py-2 pr-4">
                          <Link className="text-blue-700 hover:underline" href={detailHref}>
                            {a.action_code}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          {a.subject_type} #{a.subject_id}
                        </td>
                        <td className="py-2 pr-4">
                          {a.payload?.from_label ? `${a.payload.from_label} (${a.payload.from_code ?? "-"})` : "-"}
                          {" → "}
                          {a.payload?.to_label ? `${a.payload.to_label} (${a.payload.to_code ?? "-"})` : "-"}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={statusPill(a.status_code)}>{a.status_code}</span>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 text-right">
                          <Link className="text-blue-700 hover:underline" href={detailHref}>
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              Page {pageFromUrl} / {totalPages} (page_size: {pageSize})
            </div>

            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  href={buildApprovalsHref({ status, q, page: pageFromUrl - 1, pageSize })}
                >
                  Prev
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  Prev
                </span>
              )}

              {canNext ? (
                <Link
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  href={buildApprovalsHref({ status, q, page: pageFromUrl + 1, pageSize })}
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  Next
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Tip: approvals muncul otomatis saat lifecycle transition <b>Require approval: YES</b>.
          </div>
        </div>
      </div>
    </main>
  );
}
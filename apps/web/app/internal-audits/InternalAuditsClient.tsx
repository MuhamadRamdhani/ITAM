"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../lib/api";
import { ErrorState, SkeletonTableRow } from "../lib/loadingComponents";

type AuditStatus =
  | "DRAFT"
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | string;

type InternalAuditItem = {
  id: number | string;
  audit_code: string;
  title: string;
  audit_type: string;
  status: AuditStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  lead_auditor_name: string | null;
  checklist_count: number;
  finding_count: number;
};

type InternalAuditListData = {
  total: number;
  items: InternalAuditItem[];
};

type UiConfigData = {
  page_size_options?: unknown;
  documents_page_size_default?: unknown;
  ui?: {
    page_size?: {
      options?: unknown;
    };
    documents?: {
      page_size?: {
        default?: unknown;
      };
    };
  };
};

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

type ApiPayload<T> = T | { data?: T };

type InternalAuditListResponse = {
  total?: number | string;
  items?: unknown[];
};

const STATUSES = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

const AUDIT_TYPES = [
  { value: "ALL", label: "All" },
  { value: "INTERNAL", label: "Internal" },
  { value: "SUPPLIER", label: "Supplier" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "FOLLOW_UP", label: "Follow Up" },
] as const;

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function fmtPeriod(start?: string | null, end?: string | null) {
  if (!start && !end) return "-";
  if (start && end) return `${fmtDate(start)} to ${fmtDate(end)}`;
  if (start) return `From ${fmtDate(start)}`;
  return `Until ${fmtDate(end)}`;
}

function statusPill(status: string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "DRAFT") {
    return "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700";
  }
  if (s === "PLANNED") {
    return "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800";
  }
  if (s === "IN_PROGRESS") {
    return "rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800";
  }
  if (s === "COMPLETED") {
    return "rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800";
  }
  if (s === "CANCELLED") {
    return "rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800";
  }

  return "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700";
}

function getErrorMessage(error: unknown, fallback = "Failed to load internal audits") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as { error?: { message?: string }; message?: string };
  return e?.error?.message || e?.message || fallback;
}

function unwrapApiPayload<T>(payload: ApiPayload<T> | null | undefined): T | null {
  if (!payload) return null;

  if (typeof payload === "object" && "data" in payload) {
    const wrapped = payload as { data?: ApiPayload<T> };
    const inner = wrapped.data;
    if (!inner) return null;

    if (typeof inner === "object" && inner !== null && "data" in inner) {
      return (((inner as { data?: T }).data ?? null) as T | null);
    }

    return inner as T;
  }

  return payload as T;
}

function normalizeUiConfig(res: { data: ApiPayload<UiConfigData> }): UiConfigNormalized {
  const raw = unwrapApiPayload<UiConfigData>(res?.data) ?? {};

  const optionsRaw =
    raw?.page_size_options ??
    raw?.ui?.page_size?.options ??
    [];

  const pageSizeOptions = Array.isArray(optionsRaw)
    ? optionsRaw
        .map((x) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const preferred = [10, 50, 100];
  const safeOptions =
    pageSizeOptions.length > 0
      ? preferred.filter((n) => pageSizeOptions.includes(n))
      : preferred;

  const finalOptions = safeOptions.length > 0 ? safeOptions : preferred;

  const defaultRaw = Number(
    raw?.documents_page_size_default ??
      raw?.ui?.documents?.page_size?.default ??
      finalOptions[0]
  );

  const pageSizeDefault = finalOptions.includes(defaultRaw)
    ? defaultRaw
    : finalOptions[0];

  return { pageSizeOptions: finalOptions, pageSizeDefault };
}

function normalizeInternalAuditList(
  res: { data: ApiPayload<InternalAuditListResponse> }
): InternalAuditListData {
  const raw = unwrapApiPayload<InternalAuditListResponse>(res?.data);

  const items = Array.isArray(raw?.items)
    ? raw.items.map((item: any) => ({
        id: item?.id,
        audit_code: String(item?.audit_code ?? item?.code ?? "-"),
        title: String(item?.title ?? "-"),
        audit_type: String(item?.audit_type ?? item?.type ?? "-"),
        status: String(item?.status ?? "-"),
        planned_start_date: item?.planned_start_date ?? item?.planned_start ?? null,
        planned_end_date: item?.planned_end_date ?? item?.planned_end ?? null,
        lead_auditor_name: item?.lead_auditor_name ?? item?.lead_auditor ?? null,
        checklist_count: Number(item?.checklist_count ?? 0),
        finding_count: Number(item?.finding_count ?? 0),
      }))
    : [];

  return {
    total: Number(raw?.total ?? 0),
    items,
  };
}

function buildInternalAuditsHref(params: {
  q: string;
  status: string;
  auditType: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();

  if (params.q) p.set("q", params.q);
  if (params.status && params.status !== "ALL") p.set("status", params.status);
  if (params.auditType && params.auditType !== "ALL") {
    p.set("audit_type", params.auditType);
  }
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  if (params.page && params.page > 0) p.set("page", String(params.page));

  const qs = p.toString();
  return qs ? `/internal-audits?${qs}` : "/internal-audits";
}

export default function InternalAuditsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "ALL").trim() || "ALL";
  const auditType = (searchParams.get("audit_type") || "ALL").trim() || "ALL";
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<InternalAuditItem[]>([]);
  const [total, setTotal] = useState(0);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([10, 50, 100]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [searchQ, setSearchQ] = useState(q);
  const [searchStatus, setSearchStatus] = useState(status);
  const [searchAuditType, setSearchAuditType] = useState(auditType);

  useEffect(() => {
    setSearchQ(q);
    setSearchStatus(status);
    setSearchAuditType(auditType);
  }, [q, status, auditType]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const cfgRes = await apiGet<ApiPayload<UiConfigData>>("/api/v1/config/ui", {
          loadingKey: "internal_audits_config",
        });

        const cfg = normalizeUiConfig(cfgRes);
        if (!active) return;

        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize =
          pageSizeFromUrl > 0 && cfg.pageSizeOptions.includes(pageSizeFromUrl)
            ? pageSizeFromUrl
            : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const href = new URLSearchParams();
        if (q) href.set("q", q);
        if (status && status !== "ALL") href.set("status", status);
        if (auditType && auditType !== "ALL") href.set("audit_type", auditType);
        href.set("page", String(pageFromUrl));
        href.set("page_size", String(effectivePageSize));

        const listRes = await apiGet<ApiPayload<InternalAuditListResponse>>(
          `/api/v1/internal-audits?${href.toString()}`,
          { loadingKey: "internal_audits_list" }
        );

        if (!active) return;

        const normalized = normalizeInternalAuditList(listRes);
        setItems(normalized.items);
        setTotal(normalized.total);
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
  }, [q, status, auditType, pageFromUrl, pageSizeFromUrl]);

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const currentPage = Math.min(pageFromUrl, totalPages);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    router.push(
      buildInternalAuditsHref({
        q: searchQ.trim(),
        status: searchStatus,
        auditType: searchAuditType,
        page: 1,
        pageSize,
      })
    );
  }

  function onReset() {
    const nextPageSize = pageSizeOptions.includes(10) ? 10 : pageSizeOptions[0] || 10;
    setSearchQ("");
    setSearchStatus("ALL");
    setSearchAuditType("ALL");
    setPageSize(nextPageSize);

    router.push(
      buildInternalAuditsHref({
        q: "",
        status: "ALL",
        auditType: "ALL",
        page: 1,
        pageSize: nextPageSize,
      })
    );
  }

  function onChangePageSize(value: string) {
    const next = pickInt(value, pageSize);
    setPageSize(next);

    router.push(
      buildInternalAuditsHref({
        q: searchQ.trim(),
        status: searchStatus,
        auditType: searchAuditType,
        page: 1,
        pageSize: next,
      })
    );
  }

  return (
    <div className="space-y-8">
        <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Operational Workspace
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Internal Audits
              </h1>

              <p className="mt-3 text-sm leading-7 text-slate-600 md:text-base">
                {total} internal audits
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link href="/" className="itam-secondary-action">
                Back
              </Link>

              <Link href="/internal-audits/new" className="itam-primary-action">
                New Internal Audit
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <form
              className="grid grid-cols-1 gap-4 lg:grid-cols-6"
              onSubmit={onSubmit}
            >
              <div className="lg:col-span-3">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Search
                </label>
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search audit code or title"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={searchStatus}
                  onChange={(e) => setSearchStatus(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {STATUSES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Audit Type
                </label>
                <select
                  value={searchAuditType}
                  onChange={(e) => setSearchAuditType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {AUDIT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Page Size
                </label>
                <select
                  value={String(pageSize)}
                  onChange={(e) => onChangePageSize(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onReset}
                  className="itam-secondary-action"
                >
                  Reset
                </button>
                <button type="submit" className="itam-primary-action">
                  Apply Filter
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            {err ? (
              <div className="mb-4">
                <ErrorState
                  error={err}
                  onRetry={() => {
                    window.location.reload();
                  }}
                />
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Audit</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Planned Period</th>
                    <th className="px-5 py-3 font-medium">Lead Auditor</th>
                    <th className="px-5 py-3 font-medium">Counts</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <>
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                      <SkeletonTableRow cols={7} />
                    </>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No internal audits found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={String(item.id)} className="align-top">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {item.audit_code}
                          </div>
                          <div className="mt-1 text-slate-600">{item.title}</div>
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          {item.audit_type || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <span className={statusPill(item.status)}>
                            {String(item.status || "-").toUpperCase()}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          {fmtPeriod(item.planned_start_date, item.planned_end_date)}
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          {item.lead_auditor_name || "-"}
                        </td>

                        <td className="px-5 py-4 text-slate-700">
                          <div>Checklist: {item.checklist_count}</div>
                          <div>Findings: {item.finding_count}</div>
                        </td>

                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <Link
                            href={`/internal-audits/${item.id}`}
                            className="text-cyan-700 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Page {currentPage} / {totalPages} (page_size: {pageSize})
              </div>

              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Link
                    className="itam-secondary-action-sm"
                    href={buildInternalAuditsHref({
                      q,
                      status,
                      auditType,
                      page: currentPage - 1,
                      pageSize,
                    })}
                  >
                    Prev
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                    Prev
                  </span>
                )}

                {currentPage < totalPages ? (
                  <Link
                    className="itam-secondary-action-sm"
                    href={buildInternalAuditsHref({
                      q,
                      status,
                      auditType,
                      page: currentPage + 1,
                      pageSize,
                    })}
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                    Next
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

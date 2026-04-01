"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../lib/api";
import { SkeletonTableRow, ErrorState } from "../lib/loadingComponents";

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

type EvidenceFile = {
  id: number;
  tenant_id: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  uploaded_by_identity_id: number | null;
  created_at: string;
};

type EvidenceFilesList = {
  items: EvidenceFile[];
  total: number;
  page: number;
  page_size: number;
};

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtBytes(n?: number) {
  if (!Number.isFinite(Number(n))) return "-";
  const x = Number(n);
  if (x < 1024) return `${x} B`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  if (x < 1024 * 1024 * 1024) return `${(x / (1024 * 1024)).toFixed(1)} MB`;
  return `${(x / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function buildEvidenceHref(params: { q: string; page: number; pageSize: number }) {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  p.set("page", String(params.page));
  p.set("page_size", String(params.pageSize));
  return `/evidence?${p.toString()}`;
}

function getErrorMessage(error: unknown, fallback = "Failed to load evidence files") {
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

function normalizeEvidenceList(res: any): EvidenceFilesList {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
    page: Number(raw?.page ?? 1),
    page_size: Number(raw?.page_size ?? 10),
  };
}

export default function EvidencePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);

  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<EvidenceFile[]>([]);
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
          loadingKey: "evidence_config",
        });
        const cfg = normalizeUiConfig(cfgRes);

        if (!active) return;

        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize = cfg.pageSizeOptions.includes(pageSizeFromUrl)
          ? pageSizeFromUrl
          : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        qs.set("page", String(pageFromUrl));
        qs.set("page_size", String(effectivePageSize));

        const res = await apiGet<any>(`/api/v1/evidence/files?${qs.toString()}`, {
          loadingKey: "evidence_list",
          loadingDelay: 300,
        });
        const data = normalizeEvidenceList(res);

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
  }, [q, pageFromUrl, pageSizeFromUrl]);

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(
      buildEvidenceHref({
        q: searchQ.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  function onPageSizeChange(nextPageSize: number) {
    router.push(
      buildEvidenceHref({
        q,
        page: 1,
        pageSize: nextPageSize,
      })
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)] pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Operational Workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Evidence Library
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              MVP1.5 — upload files & attach to Asset/Document/Approval.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-4 flex justify-end">
            <Link
              href="/evidence/upload"
              className="itam-primary-action"
            >
              Upload
            </Link>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            onSubmit={onSearchSubmit}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={String(pageSize)}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
                placeholder="Search filename/mime/sha..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 sm:w-80"
              />

              <button className="itam-primary-action">
                Search
              </button>
            </div>

            <div className="text-sm text-slate-600">Total: {total}</div>
          </form>

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
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Mime</th>
                  <th className="py-3 pr-4">Size</th>
                  <th className="py-3 pr-4">SHA256</th>
                  <th className="py-3 pr-4">Download</th>
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
                  <tr className="border-t border-slate-100">
                    <td colSpan={6} className="py-8 text-slate-600">
                      Tidak ada evidence files.
                    </td>
                  </tr>
                ) : (
                  items.map((f) => (
                    <tr key={String(f.id)} className="border-t border-slate-100">
                      <td className="whitespace-nowrap py-4 pr-4 text-slate-700">{fmtDateTime(f.created_at)}</td>
                      <td className="py-4 pr-4 font-mono text-xs text-slate-500">{f.original_name}</td>
                      <td className="py-4 pr-4 text-slate-700">{f.mime_type}</td>
                      <td className="whitespace-nowrap py-4 pr-4 text-slate-700">{fmtBytes(f.size_bytes)}</td>
                      <td className="py-4 pr-4 font-mono text-xs text-slate-500">{f.sha256 ?? "-"}</td>
                      <td className="py-2 pr-4">
                        <a
                          className="text-cyan-700 hover:underline"
                          href={`${apiBase}/api/v1/evidence/files/${f.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Page {pageFromUrl} / {totalPages} (page_size: {pageSize})
            </div>

            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href={buildEvidenceHref({ q, page: pageFromUrl - 1, pageSize })}
                >
                  Prev
                </Link>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400">
                  Prev
                </span>
              )}

              {canNext ? (
                <Link
                  className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href={buildEvidenceHref({ q, page: pageFromUrl + 1, pageSize })}
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400">
                  Next
                </span>
              )}
            </div>
          </div>

          </div>
        </div>
      </div>
    </main>
  );
}

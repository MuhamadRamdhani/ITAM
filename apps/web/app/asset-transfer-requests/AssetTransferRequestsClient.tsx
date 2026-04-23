"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "@/app/lib/api";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type TransferRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED"
  | "CANCELLED"
  | string;

type TransferRequestListItem = {
  id: number;
  request_code: string;
  status: TransferRequestStatus;
  asset_id: number | null;
  asset_tag: string | null;
  asset_name: string | null;
  source_tenant_id: number | null;
  source_tenant_name: string | null;
  target_tenant_id: number | null;
  target_tenant_name: string | null;
  reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  executed_at: string | null;
};

type TransferRequestListResponse = {
  total: number;
  items: TransferRequestListItem[];
  page: number;
  page_size: number;
};

const TRANSFER_ALLOWED_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXECUTED", label: "Executed" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Failed to load asset transfer requests.";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
    case "APPROVED":
      return "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
    case "EXECUTED":
      return "bg-green-100 text-green-800 ring-1 ring-inset ring-green-200";
    case "FAILED":
      return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
    case "CANCELLED":
      return "bg-gray-200 text-gray-800 ring-1 ring-inset ring-gray-300";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
}

function pickInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function buildListHref(params: {
  q: string;
  status: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();

  if (params.q.trim()) qs.set("q", params.q.trim());
  if (params.status && params.status !== "ALL") qs.set("status", params.status);
  if (params.page && params.page > 0) qs.set("page", String(params.page));
  if (params.pageSize && params.pageSize > 0)
    qs.set("page_size", String(params.pageSize));

  const out = qs.toString();
  return out ? `/asset-transfer-requests?${out}` : "/asset-transfer-requests";
}

function normalizeListItem(raw: any): TransferRequestListItem {
  const asset = raw?.asset ?? {};
  const sourceTenant = raw?.source_tenant ?? raw?.tenant ?? {};
  const targetTenant = raw?.target_tenant ?? {};

  return {
    id: toNumber(raw?.id),
    request_code: toNullableString(raw?.request_code) ?? `TR-${raw?.id ?? "-"}`,
    status: toNullableString(raw?.status) ?? "DRAFT",

    asset_id: toNullableNumber(raw?.asset_id ?? asset?.id),
    asset_tag: toNullableString(raw?.asset_tag ?? asset?.asset_tag),
    asset_name: toNullableString(
      raw?.asset_name ??
        asset?.asset_name ??
        asset?.name ??
        asset?.display_name ??
        asset?.hostname,
    ),

    source_tenant_id: toNullableNumber(
      raw?.tenant_id ?? raw?.source_tenant_id ?? sourceTenant?.id,
    ),
    source_tenant_name: toNullableString(
      raw?.source_tenant_name ??
        sourceTenant?.tenant_name ??
        sourceTenant?.name,
    ),

    target_tenant_id: toNullableNumber(
      raw?.target_tenant_id ?? targetTenant?.id,
    ),
    target_tenant_name: toNullableString(
      raw?.target_tenant_name ??
        targetTenant?.tenant_name ??
        targetTenant?.name,
    ),

    reason: toNullableString(raw?.reason),
    created_at: toNullableString(raw?.created_at),
    updated_at: toNullableString(raw?.updated_at),
    submitted_at: toNullableString(raw?.submitted_at),
    executed_at: toNullableString(raw?.executed_at),
  };
}

function normalizeListResponse(
  payload: any,
  fallbackPage: number,
): TransferRequestListResponse {
  const data = payload?.data ?? payload ?? {};
  const rawItems =
    data?.items ??
    data?.rows ??
    data?.requests ??
    data?.transfer_requests ??
    [];

  const items = Array.isArray(rawItems)
    ? rawItems
        .map(normalizeListItem)
        .filter((item) => Number.isFinite(item.id) && item.id > 0)
    : [];

  return {
    total: toNumber(data?.total ?? items.length, items.length),
    items,
    page: toNumber(data?.page, fallbackPage),
    page_size: toNumber(data?.page_size, 10),
  };
}

export default function AssetTransferRequestsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meLoading, setMeLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);

  const [roles, setRoles] = useState<string[]>([]);
  const [data, setData] = useState<TransferRequestListResponse>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
  });

  const [qInput, setQInput] = useState("");
  const [statusInput, setStatusInput] = useState("ALL");
  const [err, setErr] = useState<string | null>(null);

  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "ALL";
  const page = pickInt(searchParams.get("page"), 1);
  const pageSize = pickInt(searchParams.get("page_size"), 10);

  const currentTransferListHref = useMemo(() => {
    return buildListHref({
      q,
      status,
      page,
      pageSize,
    });
  }, [q, status, page, pageSize]);

  const goToAssetsHref = useMemo(() => {
    return `/assets?return_to=${encodeURIComponent(currentTransferListHref)}`;
  }, [currentTransferListHref]);

  const canCreateTransfer = useMemo(() => {
    return roles.some((role) => TRANSFER_ALLOWED_ROLES.includes(role));
  }, [roles]);

  const total = Number(data.total ?? 0);
  const items = Array.isArray(data.items) ? data.items : [];
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = total === 0 ? 0 : (page - 1) * pageSize + items.length;

  useEffect(() => {
    setQInput(q);
    setStatusInput(status || "ALL");
  }, [q, status]);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        setMeLoading(true);
        setErr(null);

        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me = (res as any)?.data?.data ?? (res as any)?.data ?? null;

        if (!cancelled) {
          setRoles(Array.isArray(me?.roles) ? me.roles : []);
        }
      } catch (eAny: any) {
        if (!cancelled) {
          if (
            eAny?.code === "AUTH_REQUIRED" ||
            eAny?.code === "AUTH_UNAUTHORIZED" ||
            eAny?.http_status === 401
          ) {
            router.replace("/login");
            router.refresh();
            return;
          }

          setErr(
            eAny?.message || "Failed to initialize transfer requests page.",
          );
        }
      } finally {
        if (!cancelled) {
          setMeLoading(false);
        }
      }
    }

    void loadMe();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      if (meLoading) return;

      try {
        setListLoading(true);
        setErr(null);

        const qs = new URLSearchParams();
        if (q) qs.set("q", q);
        if (status && status !== "ALL") qs.set("status", status);
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));

        const payload = await apiGet(
          `/api/v1/asset-transfer-requests?${qs.toString()}`,
        );
        if (cancelled) return;

        setData(normalizeListResponse(payload, page));
      } catch (eAny: any) {
        if (cancelled) return;

        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setErr(extractErrorMessage(eAny));
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadList();

    return () => {
      cancelled = true;
    };
  }, [meLoading, q, status, page, pageSize, router]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();

    router.push(
      buildListHref({
        q: qInput,
        status: statusInput,
        page: 1,
        pageSize,
      }),
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              MVP 2.4A
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Asset Transfer Requests
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
              Track draft, submitted, approved, rejected, and executed asset
              transfer requests.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-white bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap justify-end gap-3">
            <Link
              href={goToAssetsHref}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Go to Assets
            </Link>

            {canCreateTransfer ? (
              <Link
                href="/asset-transfer-requests/new"
                className="itam-primary-action"
              >
                New Transfer Request
              </Link>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <form
              className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
              onSubmit={onSearchSubmit}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Search request code, asset tag, asset name..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100 sm:w-80"
                />

                <select
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button type="submit" className="itam-primary-action">
                  Search
                </button>
              </div>
            </form>

            <div className="mt-5 flex items-start justify-between gap-4">
              <div className="text-sm text-slate-600">
                Total: {total}{" "}
                <span className="ml-2">
                  {total === 0 ? "(0)" : `(showing ${startIdx}-${endIdx})`}
                </span>
              </div>

              <div className="text-xs text-slate-500">
                Tip: gunakan status untuk memisahkan request aktif dan yang
                sudah final.
              </div>
            </div>

            {err ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                {err}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1040px] w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">Request</th>
                    <th className="py-3 pr-4">Asset</th>
                    <th className="py-3 pr-4">Source</th>
                    <th className="py-3 pr-4">Target</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Created</th>
                    <th className="py-3 pr-4 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {listLoading ? (
                    <tr className="border-t border-slate-100">
                      <td colSpan={7} className="py-8 text-slate-500">
                        Loading transfer requests...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr className="border-t border-slate-100">
                      <td colSpan={7} className="py-8 text-slate-600">
                        No transfer requests found.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const assetDetailHref = item.asset_id
                        ? `/assets/${item.asset_id}?return_to=${encodeURIComponent(currentTransferListHref)}`
                        : "";

                      return (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="py-4 pr-4 align-top">
                            <div className="font-medium text-slate-900">
                              {item.request_code}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              ID: {item.id}
                            </div>
                          </td>

                          <td className="py-4 pr-4 align-top">
                            <div className="font-medium text-slate-900">
                              {item.asset_tag ?? "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.asset_name ?? "-"}
                            </div>
                          </td>

                          <td className="py-4 pr-4 align-top">
                            <div className="text-slate-900">
                              {item.source_tenant_name ?? "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Tenant ID: {item.source_tenant_id ?? "-"}
                            </div>
                          </td>

                          <td className="py-4 pr-4 align-top">
                            <div className="text-slate-900">
                              {item.target_tenant_name ?? "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Tenant ID: {item.target_tenant_id ?? "-"}
                            </div>
                          </td>

                          <td className="py-4 pr-4 align-top">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                                item.status,
                              )}`}
                            >
                              {item.status}
                            </span>
                          </td>

                          <td className="whitespace-nowrap py-4 pr-4 align-top text-slate-700">
                            {formatDateTime(item.created_at)}
                          </td>

                          <td className="whitespace-nowrap py-4 pr-4 text-right align-top">
                            <Link
                              href={`/asset-transfer-requests/${item.id}`}
                              className="text-cyan-700 hover:underline"
                            >
                              View
                            </Link>

                            {item.asset_id ? (
                              <>
                                <span className="mx-2 text-slate-300">|</span>
                                <Link
                                  href={assetDetailHref}
                                  className="text-cyan-700 hover:underline"
                                >
                                  Asset
                                </Link>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Page {page} / {totalPages}
              </div>

              <div className="flex gap-2">
                {canPrev ? (
                  <Link
                    href={buildListHref({
                      q,
                      status,
                      page: page - 1,
                      pageSize,
                    })}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
                    href={buildListHref({
                      q,
                      status,
                      page: page + 1,
                      pageSize,
                    })}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
    </div>
  );
}

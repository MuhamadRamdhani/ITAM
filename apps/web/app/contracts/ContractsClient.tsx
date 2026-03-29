"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPostJson } from "../lib/api";
import { SkeletonTableRow, ErrorState } from "../lib/loadingComponents";

type ContractItem = {
  id: number | string;
  tenant_id: number | string;
  vendor_id: number | string;
  contract_code: string;
  contract_name: string;
  contract_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  renewal_notice_days: number;
  owner_identity_id: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor_code?: string;
  vendor_name?: string;
  contract_health?: string;
  days_to_expiry?: number | null;
};

type VendorItem = {
  id: number | string;
  tenant_id: number | string;
  vendor_code: string;
  vendor_name: string;
  vendor_type: string;
  status: string;
};

type ContractsListData = {
  total: number;
  items: ContractItem[];
  page: number;
  page_size: number;
  total_pages: number;
};

type VendorsListData = {
  total: number;
  items: VendorItem[];
};

type CreateContractResponse = {
  ok: boolean;
  data?: ContractItem;
};

const STATUSES = ["ALL", "DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"] as const;
const HEALTHS = ["", "ACTIVE", "EXPIRING", "EXPIRED", "NO_END_DATE"] as const;
const CONTRACT_TYPES = [
  "SOFTWARE",
  "HARDWARE",
  "SERVICE",
  "CLOUD",
  "MAINTENANCE",
  "OTHER",
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

function statusPill(status: string) {
  const s = String(status ?? "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "ACTIVE") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "EXPIRED") return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  if (s === "TERMINATED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function healthPill(health: string) {
  const s = String(health ?? "").toUpperCase();
  if (s === "ACTIVE") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "EXPIRING") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "EXPIRED") return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  if (s === "NO_END_DATE") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function getErrorMessage(error: unknown, fallback = "Failed to load contracts") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function buildContractsHref(params: {
  status: string;
  health: string;
  q: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "ALL") p.set("status", params.status);
  if (params.health) p.set("health", params.health);
  if (params.q) p.set("q", params.q);
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  if (params.page && params.page > 0) p.set("page", String(params.page));
  const qs = p.toString();
  return qs ? `/contracts?${qs}` : "/contracts";
}

function normalizeContractsList(res: any): ContractsListData {
  const raw = res?.data?.data ?? res?.data ?? {};

  if (Array.isArray(raw?.items)) {
    return {
      total: Number(raw?.total ?? 0),
      items: raw.items,
      page: Number(raw?.page ?? 1),
      page_size: Number(raw?.page_size ?? 20),
      total_pages: Number(raw?.total_pages ?? 1),
    };
  }

  if (Array.isArray(res?.data) && res?.pagination) {
    return {
      total: Number(res?.pagination?.total ?? 0),
      items: res.data,
      page: Number(res?.pagination?.page ?? 1),
      page_size: Number(res?.pagination?.page_size ?? 20),
      total_pages: Number(res?.pagination?.total_pages ?? 1),
    };
  }

  return {
    total: 0,
    items: [],
    page: 1,
    page_size: 20,
    total_pages: 1,
  };
}

function normalizeVendorsList(res: any): VendorsListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    total: Number(raw?.total ?? 0),
    items: Array.isArray(raw?.items) ? raw.items : [],
  };
}

export default function ContractsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") || "ALL").trim() || "ALL";
  const health = (searchParams.get("health") || "").trim();
  const q = (searchParams.get("q") || "").trim();
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 20);

  const [loading, setLoading] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizeFromUrl);
  const [totalPages, setTotalPages] = useState(1);

  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [searchQ, setSearchQ] = useState(q);

  const [form, setForm] = useState({
    vendor_id: "",
    contract_code: "",
    contract_name: "",
    contract_type: "SOFTWARE",
    status: "DRAFT",
    start_date: "",
    end_date: "",
    renewal_notice_days: "30",
    owner_identity_id: "",
    notes: "",
  });

  useEffect(() => {
    setSearchQ(q);
  }, [q]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const qs = new URLSearchParams();
        if (status && status !== "ALL") qs.set("status", status);
        if (health) qs.set("health", health);
        if (q) qs.set("search", q);
        qs.set("page", String(pageFromUrl));
        qs.set("page_size", String(pageSizeFromUrl));

        const res = await apiGet<any>(`/api/v1/contracts?${qs.toString()}`, {
          loadingKey: "contracts_list",
          loadingDelay: 300,
        });

        const data = normalizeContractsList(res);

        if (!active) return;

        setItems(data.items);
        setTotal(data.total);
        setPageSize(data.page_size || pageSizeFromUrl);
        setTotalPages(data.total_pages || 1);
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setItems([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [status, health, q, pageFromUrl, pageSizeFromUrl]);

  useEffect(() => {
    let active = true;

    async function loadVendors() {
      setLoadingVendors(true);
      try {
        const res = await apiGet<any>("/api/v1/vendors?page=1&page_size=100&status=ACTIVE", {
          loadingKey: "contracts_vendors",
        });

        const data = normalizeVendorsList(res);
        if (!active) return;

        setVendors(data.items);
      } catch {
        if (!active) return;
        setVendors([]);
      } finally {
        if (active) setLoadingVendors(false);
      }
    }

    void loadVendors();

    return () => {
      active = false;
    };
  }, []);

  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;

  const startIdx = total === 0 ? 0 : (pageFromUrl - 1) * pageSize + 1;
  const endIdx = total === 0 ? 0 : (pageFromUrl - 1) * pageSize + items.length;

  const activeVendorOptions = useMemo(
    () => vendors.filter((v) => String(v.status).toUpperCase() === "ACTIVE"),
    [vendors]
  );

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(
      buildContractsHref({
        status,
        health,
        q: searchQ.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  async function onCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);

    try {
      const payload = {
        vendor_id: Number(form.vendor_id),
        contract_code: form.contract_code.trim(),
        contract_name: form.contract_name.trim(),
        contract_type: form.contract_type,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        renewal_notice_days: Number(form.renewal_notice_days || 0),
        owner_identity_id: form.owner_identity_id ? Number(form.owner_identity_id) : null,
        notes: form.notes.trim() || null,
      };

      const res = (await apiPostJson(
        "/api/v1/contracts",
        payload
      )) as CreateContractResponse;

      const createdId = res?.data?.id;

      setShowCreate(false);
      setForm({
        vendor_id: "",
        contract_code: "",
        contract_name: "",
        contract_type: "SOFTWARE",
        status: "DRAFT",
        start_date: "",
        end_date: "",
        renewal_notice_days: "30",
        owner_identity_id: "",
        notes: "",
      });

      if (createdId) {
        router.push(`/contracts/${createdId}`);
        return;
      }

      router.push(
        buildContractsHref({
          status,
          health,
          q,
          page: pageFromUrl,
          pageSize,
        })
      );
    } catch (error) {
      setErr(getErrorMessage(error, "Failed to create contract"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Contracts</h1>
            <p className="mt-1 text-sm text-gray-600">
              Registry kontrak tenant dengan vendor untuk monitoring masa berlaku dan pengelolaan operasional.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>

            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={submitting}
            >
              {showCreate ? "Close Form" : "New Contract"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {showCreate ? (
            <form className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onCreateSubmit}>
              <div className="md:col-span-2">
                <div className="mb-1 text-sm font-medium text-gray-700">Vendor</div>
                <select
                  value={form.vendor_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, vendor_id: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting || loadingVendors}
                  required
                >
                  <option value="">
                    {loadingVendors ? "Loading vendors..." : "Select vendor"}
                  </option>
                  {activeVendorOptions.map((v) => (
                    <option key={String(v.id)} value={String(v.id)}>
                      {v.vendor_code} - {v.vendor_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Contract Code</div>
                <input
                  value={form.contract_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, contract_code: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="MS-EA-2026"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Contract Name</div>
                <input
                  value={form.contract_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, contract_name: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Microsoft Enterprise Agreement 2026"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Contract Type</div>
                <select
                  value={form.contract_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, contract_type: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                >
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Status</div>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                >
                  {STATUSES.filter((s) => s !== "ALL").map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Start Date</div>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">End Date</div>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Renewal Notice Days</div>
                <input
                  type="number"
                  min={0}
                  value={form.renewal_notice_days}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, renewal_notice_days: e.target.value }))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>

              <div>
                <div className="mb-1 text-sm font-medium text-gray-700">Owner Identity ID (optional)</div>
                <input
                  type="number"
                  min={1}
                  value={form.owner_identity_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, owner_identity_id: e.target.value }))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-sm font-medium text-gray-700">Notes</div>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Contract"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap text-sm font-medium text-gray-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STATUSES.map((s) => (
                <Link
                  key={s}
                  href={buildContractsHref({ status: s, health, q, page: 1, pageSize })}
                  className={
                    status === s
                      ? "border-b-2 border-blue-600 pb-1 text-blue-700"
                      : "pb-1 hover:text-gray-900"
                  }
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
                value={health}
                onChange={(e) =>
                  router.push(
                    buildContractsHref({
                      status,
                      health: e.target.value,
                      q,
                      page: 1,
                      pageSize,
                    })
                  )
                }
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="">All Health</option>
                {HEALTHS.filter(Boolean).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>

              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search code, name, vendor..."
                className="w-full rounded-md border px-3 py-2 text-sm sm:w-64 lg:w-80"
              />

              <button className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                Search
              </button>
            </form>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Total: {total}{" "}
            <span className="ml-2">{total === 0 ? "(0)" : `(showing ${startIdx}–${endIdx})`}</span>
          </div>

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
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Vendor</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Health</th>
                  <th className="py-2 pr-4">End Date</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonTableRow cols={8} />
                    <SkeletonTableRow cols={8} />
                    <SkeletonTableRow cols={8} />
                    <SkeletonTableRow cols={8} />
                    <SkeletonTableRow cols={8} />
                  </>
                ) : items.length === 0 ? (
                  <tr className="border-t">
                    <td colSpan={8} className="py-6 text-gray-600">
                      Tidak ada contracts.
                    </td>
                  </tr>
                ) : (
                  items.map((c) => (
                    <tr key={String(c.id)} className="border-t">
                      <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">
                        {c.contract_code}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{c.contract_name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Start: {fmtDate(c.start_date)}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="text-gray-900">{c.vendor_name || "-"}</div>
                        <div className="mt-1 text-xs text-gray-500">{c.vendor_code || "-"}</div>
                      </td>
                      <td className="py-2 pr-4">{c.contract_type}</td>
                      <td className="py-2 pr-4">
                        <span className={statusPill(c.status)}>{c.status}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-1">
                          <span className={healthPill(c.contract_health || "")}>
                            {c.contract_health || "-"}
                          </span>
                          {typeof c.days_to_expiry === "number" ? (
                            <span className="text-xs text-gray-500">
                              {c.days_to_expiry} day(s)
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">{fmtDate(c.end_date)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-right">
                        <Link className="text-blue-700 hover:underline" href={`/contracts/${c.id}`}>
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
            <div className="text-xs text-gray-500">
              Page {pageFromUrl} / {totalPages} (page_size: {pageSize})
            </div>

            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  href={buildContractsHref({
                    status,
                    health,
                    q,
                    page: pageFromUrl - 1,
                    pageSize,
                  })}
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
                  href={buildContractsHref({
                    status,
                    health,
                    q,
                    page: pageFromUrl + 1,
                    pageSize,
                  })}
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
            Tip: gunakan <b>Health</b> untuk memantau kontrak yang akan segera habis masa berlakunya.
          </div>
        </div>
      </div>
    </main>
  );
}
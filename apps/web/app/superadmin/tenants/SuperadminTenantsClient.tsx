"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPostJson } from "../../lib/api";
import { SkeletonTableRow } from "../../lib/loadingComponents";
import { useGlobalLoadingAction } from "../../components/useGlobalLoadingAction";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
};

type TenantItem = {
  id: number;
  code: string;
  name: string;
  status_code: string;
  plan_code: string;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  subscription_notes?: string | null;
  contract_health?: string;
  days_to_expiry?: number | null;
  created_at: string;
  updated_at: string;
};

type TenantsSummary = {
  total: number;
  no_contract: number;
  active: number;
  expiring: number;
  expired: number;
};

type TenantsListData = {
  total: number;
  items: TenantItem[];
  page: number;
  page_size: number;
  summary?: TenantsSummary;
  filters?: {
    q?: string;
    status_code?: string | null;
    contract_health?: string | null;
    sort_by?: string | null;
    sort_dir?: string | null;
  };
};

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function fmtDateOnly(value?: string | null) {
  if (!value) return "-";
  return value;
}

function statusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") {
    return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  }
  if (s === "SUSPENDED") {
    return "rounded-full bg-red-50 px-2 py-1 text-xs text-red-800";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function contractHealthPill(health?: string | null) {
  const h = String(health || "").toUpperCase();

  if (h === "ACTIVE") {
    return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  }
  if (h === "EXPIRING") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  }
  if (h === "EXPIRED") {
    return "rounded-full bg-red-50 px-2 py-1 text-xs text-red-800";
  }

  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function contractHealthLabel(
  health?: string | null,
  daysToExpiry?: number | null
) {
  const h = String(health || "").toUpperCase();

  if (h === "EXPIRING" && typeof daysToExpiry === "number") {
    return `EXPIRING (${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"})`;
  }

  if (h === "NO_CONTRACT") return "NOT SET";
  if (!h) return "NOT SET";
  return h;
}

function monitoringRowClass(health?: string | null) {
  const h = String(health || "").toUpperCase();
  if (h === "EXPIRED") return "bg-red-50/40";
  if (h === "EXPIRING") return "bg-amber-50/40";
  if (h === "NO_CONTRACT") return "bg-gray-50";
  return "";
}

function summaryCardClass(kind: "total" | "active" | "expiring" | "expired" | "no_contract") {
  if (kind === "active") return "border-green-200 bg-green-50";
  if (kind === "expiring") return "border-amber-200 bg-amber-50";
  if (kind === "expired") return "border-red-200 bg-red-50";
  if (kind === "no_contract") return "border-gray-200 bg-gray-50";
  return "border-blue-200 bg-blue-50";
}

const STATUS_OPTIONS = ["", "ACTIVE", "SUSPENDED"] as const;
const CONTRACT_HEALTH_OPTIONS = ["", "NO_CONTRACT", "ACTIVE", "EXPIRING", "EXPIRED"] as const;
const PLAN_OPTIONS = ["FREE", "STANDARD", "ENTERPRISE"] as const;
const SORT_BY_OPTIONS = [
  { value: "CONTRACT_END_DATE", label: "Contract End" },
  { value: "CREATED_AT", label: "Created" },
  { value: "NAME", label: "Name" },
  { value: "ID", label: "ID" },
] as const;
const SORT_DIR_OPTIONS = [
  { value: "ASC", label: "ASC" },
  { value: "DESC", label: "DESC" },
] as const;

export default function SuperadminTenantsClient() {
  const router = useRouter();
  const { runWithLoading, hide } = useGlobalLoadingAction();
  const createInFlightRef = useRef(false);

  const [meLoading, setMeLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSize, setPageSize] = useState(10);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [contractHealthFilter, setContractHealthFilter] = useState("");
  const [sortBy, setSortBy] = useState("CONTRACT_END_DATE");
  const [sortDir, setSortDir] = useState("ASC");
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const [listLoading, setListLoading] = useState(true);
  const [data, setData] = useState<TenantsListData>({
    total: 0,
    items: [],
    page: 1,
    page_size: 10,
    summary: {
      total: 0,
      no_contract: 0,
      active: 0,
      expiring: 0,
      expired: 0,
    },
  });

  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createStatus, setCreateStatus] = useState("ACTIVE");
  const [createPlan, setCreatePlan] = useState("STANDARD");
  const [createContractStartDate, setCreateContractStartDate] = useState("");
  const [createContractEndDate, setCreateContractEndDate] = useState("");
  const [createSubscriptionNotes, setCreateSubscriptionNotes] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const total = Number(data.total ?? 0);
  const summary = data.summary ?? {
    total: total,
    no_contract: 0,
    active: 0,
    expiring: 0,
    expired: 0,
  };
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const isReady = useMemo(() => !meLoading && allowed, [meLoading, allowed]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setOk(null);
      setMeLoading(true);

      try {
        const meRes = await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;

        const roles = Array.isArray(meRes.data?.roles) ? meRes.data.roles : [];
        const isSuperadmin = roles.includes("SUPERADMIN");

        if (!isSuperadmin) {
          setAllowed(false);
          return;
        }

        setAllowed(true);

        const cfgRes = await apiGet<UiConfig>("/api/v1/config/ui");
        if (cancelled) return;

        const cfg = cfgRes.data;
        const optionsRaw = Array.isArray(cfg?.page_size_options)
          ? cfg.page_size_options
          : [];
        const options = optionsRaw
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0);

        const pageSizeDefault = Number(cfg?.documents_page_size_default);
        const nextPageSize =
          options.includes(pageSizeDefault) ? pageSizeDefault : options[0] || 10;

        setPageSizeOptions(options);
        setPageSize(nextPageSize);
      } catch (eAny: any) {
        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }
        setErr(eAny?.message || "Failed to initialize superadmin tenants page");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadTenants() {
      if (!isReady) return;
      if (!pageSize) return;

      setListLoading(true);
      setErr(null);

      try {
        const qs = new URLSearchParams();
        if (q.trim()) qs.set("q", q.trim());
        if (statusFilter) qs.set("status_code", statusFilter);
        if (contractHealthFilter) qs.set("contract_health", contractHealthFilter);
        qs.set("sort_by", sortBy);
        qs.set("sort_dir", sortDir);
        qs.set("page", String(page));
        qs.set("page_size", String(pageSize));

        const res = await apiGet<TenantsListData>(
          `/api/v1/superadmin/tenants?${qs.toString()}`
        );

        if (cancelled) return;

        const out = res.data ?? {
          total: 0,
          items: [],
          page: 1,
          page_size: pageSize,
          summary: {
            total: 0,
            no_contract: 0,
            active: 0,
            expiring: 0,
            expired: 0,
          },
        };

        setData({
          total: Number(out.total ?? 0),
          items: Array.isArray(out.items) ? out.items : [],
          page: Number(out.page ?? page),
          page_size: Number(out.page_size ?? pageSize),
          summary: out.summary ?? {
            total: Number(out.total ?? 0),
            no_contract: 0,
            active: 0,
            expiring: 0,
            expired: 0,
          },
          filters: out.filters,
        });
      } catch (eAny: any) {
        if (eAny?.code === "FORBIDDEN" || eAny?.http_status === 403) {
          setErr("Forbidden. Halaman ini hanya untuk SUPERADMIN.");
          return;
        }

        if (eAny?.code === "INVALID_PAGE_SIZE") {
          setErr("Page size tidak valid menurut config server.");
          return;
        }

        setErr(eAny?.message || "Failed to load tenants");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    loadTenants();
    return () => {
      cancelled = true;
    };
  }, [isReady, q, statusFilter, contractHealthFilter, sortBy, sortDir, page, pageSize, reloadTick]);

  async function onCreateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (createInFlightRef.current) return;
    createInFlightRef.current = true;

    setErr(null);
    setOk(null);

    const code = createCode.trim();
    const name = createName.trim();

    if (!code) {
      setErr("Code wajib diisi.");
      createInFlightRef.current = false;
      return;
    }

    if (!name) {
      setErr("Name wajib diisi.");
      createInFlightRef.current = false;
      return;
    }

    if (!createContractStartDate) {
      setErr("Contract Start wajib diisi.");
      createInFlightRef.current = false;
      return;
    }

    if (!createContractEndDate) {
      setErr("Contract End wajib diisi.");
      createInFlightRef.current = false;
      return;
    }

    setCreateLoading(true);

    try {
      await runWithLoading(
        async () => {
          await apiPostJson<{ tenant: TenantItem }>("/api/v1/superadmin/tenants", {
            code,
            name,
            status_code: createStatus,
            plan_code: createPlan,
            contract_start_date: createContractStartDate,
            contract_end_date: createContractEndDate,
            subscription_notes: createSubscriptionNotes.trim() || null,
          });
        },
        "Creating tenant..."
      );

      hide();

      setCreateCode("");
      setCreateName("");
      setCreateStatus("ACTIVE");
      setCreatePlan("STANDARD");
      setCreateContractStartDate("");
      setCreateContractEndDate("");
      setCreateSubscriptionNotes("");

      setOk("Tenant berhasil dibuat.");

      setQ("");
      setQInput("");
      setStatusFilter("");
      setContractHealthFilter("");
      setSortBy("CONTRACT_END_DATE");
      setSortDir("ASC");
      setPage(1);
      setReloadTick((v) => v + 1);
      router.refresh();
    } catch (eAny: any) {
      hide();

      if (
        eAny?.code === "AUTH_REQUIRED" ||
        eAny?.code === "AUTH_UNAUTHORIZED" ||
        eAny?.http_status === 401
      ) {
        router.replace("/login");
        router.refresh();
        return;
      }

      if (eAny?.code === "TENANT_CODE_TAKEN") {
        setErr("Tenant code sudah digunakan.");
      } else {
        setErr(eAny?.message || "Failed to create tenant");
      }
    } finally {
      createInFlightRef.current = false;
      setCreateLoading(false);
    }
  }

  if (meLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        Loading superadmin tenants...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">Forbidden</div>
        <div className="mt-1 text-sm text-gray-600">
          Halaman ini hanya bisa diakses oleh role SUPERADMIN.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(err || ok) && (
        <div className="space-y-2">
          {err ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          {ok ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {ok}
            </div>
          ) : null}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-base font-semibold text-gray-900">
            Create Tenant
          </div>
          <div className="mt-1 text-sm text-gray-600">
            Membuat tenant baru akan sekaligus seed roles baseline, UI settings, dan kontrak tenant.
          </div>
        </div>

        <form
          onSubmit={onCreateTenant}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">Code</label>
            <input
              value={createCode}
              onChange={(e) => setCreateCode(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              placeholder="acme"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              placeholder="ACME Corp"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={createStatus}
              onChange={(e) => setCreateStatus(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Plan</label>
            <select
              value={createPlan}
              onChange={(e) => setCreatePlan(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contract Start
            </label>
            <input
              type="date"
              value={createContractStartDate}
              onChange={(e) => setCreateContractStartDate(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contract End
            </label>
            <input
              type="date"
              value={createContractEndDate}
              onChange={(e) => setCreateContractEndDate(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              required
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700">
              Subscription Notes
            </label>
            <textarea
              rows={3}
              value={createSubscriptionNotes}
              onChange={(e) => setCreateSubscriptionNotes(e.target.value)}
              disabled={createLoading}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              placeholder="Catatan internal terkait kontrak tenant"
            />
          </div>

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={createLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {createLoading ? "Creating..." : "Create Tenant"}
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className={`rounded-lg border p-4 shadow-sm ${summaryCardClass("total")}`}>
          <div className="text-xs text-gray-600">Total</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.total}</div>
        </div>
        <div className={`rounded-lg border p-4 shadow-sm ${summaryCardClass("active")}`}>
          <div className="text-xs text-gray-600">Active</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.active}</div>
        </div>
        <div className={`rounded-lg border p-4 shadow-sm ${summaryCardClass("expiring")}`}>
          <div className="text-xs text-gray-600">Expiring</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.expiring}</div>
        </div>
        <div className={`rounded-lg border p-4 shadow-sm ${summaryCardClass("expired")}`}>
          <div className="text-xs text-gray-600">Expired</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.expired}</div>
        </div>
        <div className={`rounded-lg border p-4 shadow-sm ${summaryCardClass("no_contract")}`}>
          <div className="text-xs text-gray-600">No Contract</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.no_contract}</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQ(qInput.trim());
            }}
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n} / page
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "ALL"} value={s}>
                  {s || "All status"}
                </option>
              ))}
            </select>

            <select
              value={contractHealthFilter}
              onChange={(e) => {
                setPage(1);
                setContractHealthFilter(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {CONTRACT_HEALTH_OPTIONS.map((s) => (
                <option key={s || "ALL"} value={s}>
                  {s === ""
                    ? "All subscription"
                    : s === "NO_CONTRACT"
                    ? "No Contract"
                    : s}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => {
                setPage(1);
                setSortBy(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {SORT_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort by {opt.label}
                </option>
              ))}
            </select>

            <select
              value={sortDir}
              onChange={(e) => {
                setPage(1);
                setSortDir(e.target.value);
              }}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {SORT_DIR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search code/name..."
              className="w-full rounded-md border px-3 py-2 text-sm sm:w-72"
            />

            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              Search
            </button>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <div>Total rows: {total}</div>
          <div>Sort: {sortBy} / {sortDir}</div>
          {contractHealthFilter ? <div>Subscription filter: {contractHealthFilter}</div> : null}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Subscription</th>
                <th className="py-2 pr-4">Contract End</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                <>
                  <SkeletonTableRow cols={8} />
                  <SkeletonTableRow cols={8} />
                  <SkeletonTableRow cols={8} />
                  <SkeletonTableRow cols={8} />
                  <SkeletonTableRow cols={8} />
                </>
              ) : data.items.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={8} className="py-6 text-gray-600">
                    Tidak ada tenants.
                  </td>
                </tr>
              ) : (
                data.items.map((t) => (
                  <tr key={String(t.id)} className={`border-t ${monitoringRowClass(t.contract_health)}`}>
                    <td className="py-3 pr-4 font-mono text-xs">{t.code}</td>
                    <td className="py-3 pr-4">{t.name}</td>
                    <td className="py-3 pr-4">
                      <span className={statusPill(t.status_code)}>
                        {t.status_code}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{t.plan_code}</td>
                    <td className="py-3 pr-4">
                      <span className={contractHealthPill(t.contract_health)}>
                        {contractHealthLabel(
                          t.contract_health,
                          t.days_to_expiry
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {fmtDateOnly(t.contract_end_date)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {fmtDateTime(t.created_at)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-right">
                      <Link
                        className="text-blue-700 hover:underline"
                        href={`/superadmin/tenants/${t.id}`}
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
          <div className="text-xs text-gray-500">
            Page {page} / {totalPages} (page_size: {pageSize})
          </div>

          <div className="flex gap-2">
            {canPrev ? (
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Prev
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Prev
              </span>
            )}

            {canNext ? (
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Next
              </button>
            ) : (
              <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Next
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
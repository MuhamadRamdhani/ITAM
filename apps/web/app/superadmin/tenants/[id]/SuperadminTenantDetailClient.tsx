"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatchJson } from "../../../lib/api";
import { useGlobalLoadingAction } from "../../../components/useGlobalLoadingAction";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
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

type TenantSummaryData = {
  tenant: TenantItem;
  subscription: {
    contract_start_date: string | null;
    contract_end_date: string | null;
    subscription_notes: string | null;
    contract_health: string;
    days_to_expiry: number | null;
  };
  summary: {
    users_total: number;
    assets_total: number;
    documents_total: number;
    pending_approvals_total: number;
  };
};

const PLAN_OPTIONS = ["FREE", "STANDARD", "ENTERPRISE"] as const;
const STATUS_OPTIONS = ["ACTIVE", "SUSPENDED"] as const;

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

function contractHealthLabel(health?: string | null, daysToExpiry?: number | null) {
  const h = String(health || "").toUpperCase();

  if (h === "EXPIRING" && typeof daysToExpiry === "number") {
    return `EXPIRING (${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"})`;
  }

  if (h === "NO_CONTRACT") return "NOT SET";
  if (!h) return "NOT SET";
  return h;
}

export default function SuperadminTenantDetailClient({
  tenantId,
}: {
  tenantId: string;
}) {
  const router = useRouter();
  const { runWithLoading, hide } = useGlobalLoadingAction();
  const inFlightRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [data, setData] = useState<TenantSummaryData | null>(null);

  const [name, setName] = useState("");
  const [statusCode, setStatusCode] = useState("ACTIVE");
  const [planCode, setPlanCode] = useState("STANDARD");

  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const subscription = data?.subscription ?? null;

  const subscriptionHint = useMemo(() => {
    if (!subscription) return null;

    const health = String(subscription.contract_health || "").toUpperCase();
    const days = subscription.days_to_expiry;

    if (health === "EXPIRING" && typeof days === "number") {
      return `Tenant subscription akan berakhir dalam ${days} hari.`;
    }

    if (health === "EXPIRED") {
      return "Tenant subscription sudah expired. User tenant tidak akan bisa login sampai kontrak diperpanjang.";
    }

    if (health === "NO_CONTRACT") {
      return "Tanggal kontrak tenant belum di-set. Tenant tidak akan bisa login sampai kontrak diisi.";
    }

    return null;
  }, [subscription]);

  function syncFormFromData(out: TenantSummaryData) {
    setData(out);

    setName(out?.tenant?.name || "");
    setStatusCode(out?.tenant?.status_code || "ACTIVE");
    setPlanCode(out?.tenant?.plan_code || "STANDARD");

    setContractStartDate(out?.subscription?.contract_start_date || "");
    setContractEndDate(out?.subscription?.contract_end_date || "");
    setSubscriptionNotes(out?.subscription?.subscription_notes || "");
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setErr(null);
      setOk(null);
      setLoading(true);

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

        const res = await apiGet<TenantSummaryData>(
          `/api/v1/superadmin/tenants/${tenantId}/summary`
        );
        if (cancelled) return;

        syncFormFromData(res.data);
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
        setErr(eAny?.message || "Failed to load tenant detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [router, tenantId]);

  async function reloadDetail() {
    const res = await apiGet<TenantSummaryData>(
      `/api/v1/superadmin/tenants/${tenantId}/summary`
    );
    syncFormFromData(res.data);
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setErr(null);
    setOk(null);
    setSaving(true);

    try {
      await runWithLoading(async () => {
        await apiPatchJson<{ tenant: TenantItem }>(
          `/api/v1/superadmin/tenants/${tenantId}`,
          {
            name: name.trim(),
            status_code: statusCode,
            plan_code: planCode,
            contract_start_date: contractStartDate || null,
            contract_end_date: contractEndDate || null,
            subscription_notes: subscriptionNotes.trim() || null,
          }
        );
      }, "Saving tenant...");

      await reloadDetail();
      hide();
      setOk("Tenant berhasil diupdate.");
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

      setErr(eAny?.message || "Failed to update tenant");
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        Loading tenant detail...
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

  if (!data) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
        Tenant detail tidak ditemukan.
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              {data.tenant.name}
            </div>
            <div className="mt-1 text-sm text-gray-600">
              code: <span className="font-mono">{data.tenant.code}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={statusPill(data.tenant.status_code)}>
              {data.tenant.status_code}
            </span>
            <span className={contractHealthPill(subscription?.contract_health)}>
              {contractHealthLabel(
                subscription?.contract_health,
                subscription?.days_to_expiry
              )}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Users</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {data.summary.users_total}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Assets</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {data.summary.assets_total}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Documents</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {data.summary.documents_total}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Pending Approvals</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {data.summary.pending_approvals_total}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-2">
          <div>Created: {fmtDateTime(data.tenant.created_at)}</div>
          <div>Updated: {fmtDateTime(data.tenant.updated_at)}</div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              Subscription / Contract
            </div>
            <div className="mt-1 text-sm text-gray-600">
              Kontrak tenant yang dikelola oleh SUPERADMIN platform.
            </div>
          </div>

          <div>
            <span className={contractHealthPill(subscription?.contract_health)}>
              {contractHealthLabel(
                subscription?.contract_health,
                subscription?.days_to_expiry
              )}
            </span>
          </div>
        </div>

        {subscriptionHint ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {subscriptionHint}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Contract Start</div>
            <div className="mt-2 font-medium text-gray-900">
              {fmtDateOnly(subscription?.contract_start_date)}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Contract End</div>
            <div className="mt-2 font-medium text-gray-900">
              {fmtDateOnly(subscription?.contract_end_date)}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Days to Expiry</div>
            <div className="mt-2 font-medium text-gray-900">
              {typeof subscription?.days_to_expiry === "number"
                ? subscription.days_to_expiry
                : "-"}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs text-gray-500">Contract Health</div>
            <div className="mt-2">
              <span className={contractHealthPill(subscription?.contract_health)}>
                {contractHealthLabel(
                  subscription?.contract_health,
                  subscription?.days_to_expiry
                )}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 md:col-span-2">
            <div className="text-xs text-gray-500">Notes</div>
            <div className="mt-2 whitespace-pre-wrap text-gray-900">
              {subscription?.subscription_notes?.trim()
                ? subscription.subscription_notes
                : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="text-base font-semibold text-gray-900">Update Tenant</div>
        <div className="mt-1 text-sm text-gray-600">
          Update name, status, plan, dan kontrak tenant.
        </div>

        <form onSubmit={onSave} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Plan</label>
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:block" />

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contract Start
            </label>
            <input
              type="date"
              value={contractStartDate}
              onChange={(e) => setContractStartDate(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contract End
            </label>
            <input
              type="date"
              value={contractEndDate}
              onChange={(e) => setContractEndDate(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">
              Subscription Notes
            </label>
            <textarea
              rows={4}
              value={subscriptionNotes}
              onChange={(e) => setSubscriptionNotes(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-100"
              placeholder="Catatan internal terkait kontrak tenant"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="itam-primary-action"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
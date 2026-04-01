"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
  tenant?: {
    id: number;
    code: string;
    name: string;
    status_code: string;
    contract_start_date?: string | null;
    contract_end_date?: string | null;
    contract_health?: string | null;
    days_to_expiry?: number | null;
  };
};

function hasSuperadminRole(roles: string[]) {
  return Array.isArray(roles) && roles.includes("SUPERADMIN");
}

export default function TenantSubscriptionBanner() {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;
        setData(res.data ?? null);
      } catch {
        // biarkan silent, jangan ganggu homepage
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!data) return null;
  if (hasSuperadminRole(data.roles || [])) return null;

  const tenant = data.tenant;
  const contractHealth = String(tenant?.contract_health || "").toUpperCase();
  const daysToExpiry = tenant?.days_to_expiry;
  const contractEndDate = tenant?.contract_end_date ?? null;

  if (contractHealth !== "EXPIRING") return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-200/25 blur-3xl" />

      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
        Tenant Subscription Alert
      </div>

      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Kontrak tenant Anda perlu perhatian
      </div>

      <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
        {tenant?.name ? `${tenant.name} ` : ""}
        {typeof daysToExpiry === "number"
          ? `akan berakhir dalam ${daysToExpiry} hari`
          : "akan segera berakhir"}
        {contractEndDate ? `, dengan tanggal akhir ${contractEndDate}.` : "."}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
          Health: {contractHealth}
        </span>
        {typeof daysToExpiry === "number" ? (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            Days left: {daysToExpiry}
          </span>
        ) : null}
        {tenant?.code ? (
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
            Tenant: {tenant.code}
          </span>
        ) : null}
      </div>

      <div className="mt-4 text-sm font-semibold text-amber-700">
        Hubungi administrator platform untuk perpanjangan sebelum akses tenant terblokir.
      </div>
    </div>
  );
}

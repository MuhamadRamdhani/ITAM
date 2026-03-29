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
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
        Tenant Subscription Warning
      </div>

      <div className="mt-2 text-sm leading-6 text-amber-900">
        Kontrak tenant Anda akan berakhir
        {typeof daysToExpiry === "number" ? ` dalam ${daysToExpiry} hari` : ""}.
        {contractEndDate ? ` Tanggal akhir kontrak: ${contractEndDate}.` : ""}
      </div>

      <div className="mt-2 text-xs leading-5 text-amber-700">
        Hubungi administrator platform untuk proses perpanjangan sebelum akses tenant terblokir.
      </div>
    </div>
  );
}

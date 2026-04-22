"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

export default function SuperadminTenantsLauncher() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;

        const roles = Array.isArray(res.data?.roles) ? res.data.roles : [];
        setAllowed(roles.includes("SUPERADMIN"));
      } catch {
        setAllowed(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) return null;

  return (
    <Link
      href="/superadmin/tenants"
      className="group block rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_18px_60px_rgba(15,23,42,0.12)]"
    >
      <div className="text-lg font-semibold tracking-tight text-slate-900">Superadmin Tenants</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">
        Platform tenant management + summary
      </div>
      <div className="mt-5 text-sm font-semibold text-cyan-700 transition group-hover:text-cyan-800">
        Open -
      </div>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

const TRANSFER_ALLOWED_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

export default function AssetTransfersLauncher() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);

  const canSeeLauncher = useMemo(() => {
    return roles.some((role) => TRANSFER_ALLOWED_ROLES.includes(role));
  }, [roles]);

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      try {
        setLoading(true);

        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me =
          (res as any)?.data?.data ??
          (res as any)?.data ??
          null;

        if (!mounted) return;
        setRoles(Array.isArray(me?.roles) ? me.roles : []);
      } catch {
        if (!mounted) return;
        setRoles([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return null;
  if (!canSeeLauncher) return null;

  return (
    <Link
      href="/asset-transfer-requests"
      className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.10)] transition duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-[0_22px_70px_rgba(15,23,42,0.14)]"
    >
      <div className="text-lg font-semibold tracking-tight text-slate-900">
        Asset Transfers
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-700">
        Manage and track asset transfer requests
      </div>
      <div className="mt-5 text-sm font-semibold text-cyan-700 transition group-hover:text-cyan-800">
        Open →
      </div>
    </Link>
  );
}
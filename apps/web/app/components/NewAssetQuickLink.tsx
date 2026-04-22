"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { canCreateOrEditAsset } from "../lib/assetAccess";

type MeData = {
  roles: string[];
};

export default function NewAssetQuickLink() {
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");

        if (!mounted) return;
        setRoles(Array.isArray(res.data?.roles) ? res.data.roles : []);
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
  if (!canCreateOrEditAsset(roles)) return null;

  return (
    <Link
      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50 hover:text-slate-900"
      href="/assets/new"
    >
      + New Asset
    </Link>
  );
}

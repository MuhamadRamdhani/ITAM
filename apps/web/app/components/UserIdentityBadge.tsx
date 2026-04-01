"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";

type MeData = {
  email?: string | null;
  roles: string[];
};

const LAST_LOGIN_EMAIL_KEY = "itam:last_login_email";

function primaryRoleLabel(roles: string[]) {
  const normalized = Array.isArray(roles)
    ? roles.map((role) => String(role || "").toUpperCase())
    : [];

  if (normalized.includes("SUPERADMIN")) return "MASTER";
  if (normalized.includes("TENANT_ADMIN")) return "TENANT ADMIN";
  if (normalized.length > 0) return normalized[0];
  return "USER";
}

export default function UserIdentityBadge() {
  const [data, setData] = useState<MeData | null>(null);
  const [storedEmail, setStoredEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setStoredEmail(localStorage.getItem(LAST_LOGIN_EMAIL_KEY)?.trim() || null);
    } catch {
      setStoredEmail(null);
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;
        setData(res.data ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const roleLabel = useMemo(() => {
    return primaryRoleLabel(Array.isArray(data?.roles) ? data.roles : []);
  }, [data]);

  const email = data?.email?.trim() || storedEmail || null;

  if (loading) {
    return (
      <div className="inline-flex items-center gap-3 rounded-[1.15rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-[1.15rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-sm font-semibold text-cyan-800">
        {String(email || "U")
          .slice(0, 1)
          .toUpperCase()}
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-slate-900">
          {email || "-"}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700">
          {roleLabel}
        </span>
      </div>
    </div>
  );
}

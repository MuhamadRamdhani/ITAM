"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "../lib/api";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

const TRANSFER_ALLOWED_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

type Props = {
  children: ReactNode;
  redirectTo?: string;
};

export default function AssetTransfersAccessGuard({
  children,
  redirectTo = "/assets",
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canAccessTransfer = useMemo(() => {
    return roles.some((role) => TRANSFER_ALLOWED_ROLES.includes(role));
  }, [roles]);

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      try {
        setLoading(true);
        setError(null);

        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me =
          (res as any)?.data?.data ??
          (res as any)?.data ??
          null;

        if (!mounted) return;
        setRoles(Array.isArray(me?.roles) ? me.roles : []);
      } catch (eAny: any) {
        if (!mounted) return;

        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(eAny?.message || "Failed to verify transfer access.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (loading) return;
    if (error) return;
    if (canAccessTransfer) return;

    router.replace(redirectTo);
  }, [loading, error, canAccessTransfer, redirectTo, router]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm ring-1 ring-gray-200">
        Loading transfer access...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="text-sm font-semibold text-red-800">
          Failed to verify transfer access
        </div>
        <div className="mt-2 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!canAccessTransfer) {
    return null;
  }

  return <>{children}</>;
}
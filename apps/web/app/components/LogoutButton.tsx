"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiPostJson } from "../lib/api";
import { useGlobalLoading } from "./GlobalLoadingProvider";

export default function LogoutButton() {
  const router = useRouter();
  const { show, hide } = useGlobalLoading();
  const inFlightRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onLogout() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setErr(null);
    setLoading(true);
    show("Logging out...");

    try {
      await apiPostJson<{ ok: true }>("/api/v1/auth/logout", {});
      hide();
      router.replace("/login");
      router.refresh();
    } catch (error: unknown) {
      const eAny = error as { message?: string } | null;
      setErr(eAny?.message || "Logout failed");
      hide();
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onLogout}
        disabled={loading}
        className="rounded-full border border-cyan-200 bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,165,233,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(14,165,233,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Logging out..." : "Logout"}
      </button>
      {err ? <span className="text-xs text-rose-600">{err}</span> : null}
    </div>
  );
}

"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";
import { useGlobalLoading } from "../../components/GlobalLoadingProvider";

export default function ApprovalDecisionPanel(props: {
  approvalId: number;
  status: string;
  onDecisionApplied?: () => void;
}) {
  const router = useRouter();
  const { show, hide } = useGlobalLoading();
  const inFlightRef = useRef(false);

  const [reason, setReason] = useState("");
  const [loadingDecision, setLoadingDecision] = useState<
    "APPROVE" | "REJECT" | null
  >(null);
  const [err, setErr] = useState<string | null>(null);

  const statusUpper = useMemo(
    () => String(props.status ?? "").toUpperCase(),
    [props.status]
  );

  const canDecide = statusUpper === "PENDING";
  const loading = loadingDecision !== null;

  async function decide(decision: "APPROVE" | "REJECT") {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const ok = window.confirm(
      decision === "APPROVE"
        ? "Approve approval ini? Jika approved, perubahan akan diterapkan."
        : "Reject approval ini? Perubahan tidak akan diterapkan."
    );

    if (!ok) {
      inFlightRef.current = false;
      return;
    }

    setLoadingDecision(decision);
    setErr(null);
    show(decision === "APPROVE" ? "Approving..." : "Rejecting...");

    try {
      await apiPostJson(`/api/v1/approvals/${props.approvalId}/decide`, {
        decision,
        reason: reason.trim() ? reason.trim() : undefined,
      });

      props.onDecisionApplied?.();
      router.refresh();
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

      setErr(eAny?.message || "Failed");
    } finally {
      inFlightRef.current = false;
      setLoadingDecision(null);
      hide();
    }
  }

  const panelClass = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
  const textareaClass =
    "w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";
  const buttonClass =
    "rounded-full px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50";

  if (!canDecide) {
    return (
      <div className={panelClass}>
        <div className="text-sm font-semibold text-slate-900">Decision</div>
        <div className="mt-2 text-sm text-slate-600">
          Approval sudah diputuskan. Status:{" "}
          <span className="font-semibold">{statusUpper}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <div className="text-sm font-semibold text-slate-900">Decision</div>
      <div className="mt-2 text-sm text-slate-600">
        Approve / Reject approval ini.
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          className={textareaClass}
          rows={2}
          placeholder="Decision note (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
        />

        {err && <div className="text-sm text-red-700">{err}</div>}

        <div className="flex gap-2">
          <button
            type="button"
            className={`${buttonClass} bg-emerald-600 hover:bg-emerald-500`}
            disabled={loading}
            onClick={() => decide("APPROVE")}
          >
            {loadingDecision === "APPROVE"
              ? "Approving..."
              : loading
              ? "Processing..."
              : "Approve"}
          </button>

          <button
            type="button"
            className={`${buttonClass} bg-rose-600 hover:bg-rose-500`}
            disabled={loading}
            onClick={() => decide("REJECT")}
          >
            {loadingDecision === "REJECT"
              ? "Rejecting..."
              : loading
              ? "Processing..."
              : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

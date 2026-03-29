"use client";

import React, { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";
import { useGlobalLoading } from "../../components/GlobalLoadingProvider";

export default function ApprovalDecisionPanel(props: {
  approvalId: number;
  status: string;
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

    let shouldHideOverlay = true;

    try {
      await apiPostJson(`/api/v1/approvals/${props.approvalId}/decide`, {
        decision,
        reason: reason.trim() ? reason.trim() : undefined,
      });

      shouldHideOverlay = false;
      router.refresh();
    } catch (eAny: any) {
      if (
        eAny?.code === "AUTH_REQUIRED" ||
        eAny?.code === "AUTH_UNAUTHORIZED" ||
        eAny?.http_status === 401
      ) {
        shouldHideOverlay = false;
        router.replace("/login");
        router.refresh();
        return;
      }

      setErr(eAny?.message || "Failed");
    } finally {
      inFlightRef.current = false;
      setLoadingDecision(null);

      if (shouldHideOverlay) {
        hide();
      }
    }
  }

  if (!canDecide) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Decision</div>
        <div className="mt-2 text-sm text-gray-600">
          Approval sudah diputuskan. Status:{" "}
          <span className="font-semibold">{statusUpper}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">Decision</div>
      <div className="mt-2 text-sm text-gray-600">
        Approve / Reject approval ini.
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
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
            className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
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
            className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
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
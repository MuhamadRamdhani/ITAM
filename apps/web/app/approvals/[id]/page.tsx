"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/api";
import ApprovalDecisionPanel from "./ApprovalDecisionPanel";

type Approval = {
  id: number | string;
  status_code: string;
  action_code: string;
  subject_type: string;
  subject_id: number | string;
  requested_at: string;
  decided_at?: string | null;
  decision_reason?: string | null;
  payload?: any;
};

type ApprovalEvent = {
  id: number | string;
  event_type: string;
  note?: string | null;
  event_payload?: any;
  created_at: string;
};

type ApprovalDetailData = {
  approval: Approval;
  events: ApprovalEvent[];
};

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = (status ?? "").toUpperCase();
  if (s === "PENDING") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  }
  if (s === "APPROVED") {
    return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  }
  if (s === "REJECTED") {
    return "rounded-full bg-red-50 px-2 py-1 text-xs text-red-800";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

export default function ApprovalDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const approvalId = params?.id;
  const returnTo = searchParams?.get("returnTo")?.trim() || "";
  const backHref = returnTo || "/approvals";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApprovalDetailData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!approvalId) return;

      try {
        setLoading(true);
        setError(null);

        const res = await apiGet<any>(`/api/v1/approvals/${approvalId}`);
        const nextData: ApprovalDetailData =
          (res as any)?.data?.data ?? (res as any)?.data;

        if (!cancelled) {
          setData(nextData);
        }
      } catch (eAny: any) {
        if (cancelled) return;

        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(eAny?.message || "Failed to load approval detail");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [approvalId, router]);

  if (!approvalId) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Invalid route</div>
            <div className="mt-1 text-sm text-gray-600">
              Approval id tidak ditemukan dari URL.
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm text-sm text-gray-600">
            Loading approval detail...
          </div>
        </div>
      </main>
    );
  }

  if (error || !data?.approval) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Approval Detail</h1>
              <p className="mt-1 text-sm text-gray-600">Detail approval.</p>
            </div>

            <Link
              href={backHref}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>

          <div className="mt-6 rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-red-700">
              {error || "Approval detail tidak ditemukan."}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const approval = data.approval;
  const events = Array.isArray(data.events) ? data.events : [];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Approval #{approval.id}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {approval.action_code} — {approval.subject_type} #{approval.subject_id}
            </p>
          </div>

          <Link
            href={backHref}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className={statusPill(approval.status_code)}>
                {approval.status_code}
              </span>
              <div className="mt-2 text-gray-600">
                Requested: {fmtDateTime(approval.requested_at)}
              </div>
              {approval.decided_at && (
                <div className="mt-1 text-gray-600">
                  Decided: {fmtDateTime(approval.decided_at)}
                </div>
              )}
            </div>

            {approval.subject_type === "ASSET" && (
              <Link
                href={`/assets/${approval.subject_id}?tab=lifecycle`}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                Open Asset
              </Link>
            )}
          </div>

          <div className="mt-4 rounded-md border bg-gray-50 p-3 text-sm text-gray-800">
            <div className="mb-2 font-semibold">Transition</div>
            <div>
              {approval.payload?.from_label
                ? `${approval.payload.from_label} (${approval.payload.from_code ?? "-"})`
                : "-"}
              {"  →  "}
              {approval.payload?.to_label
                ? `${approval.payload.to_label} (${approval.payload.to_code ?? "-"})`
                : "-"}
            </div>
            <div className="mt-2">
              <span className="text-gray-600">Reason:</span>{" "}
              {approval.payload?.reason ?? "-"}
            </div>
          </div>

          <div className="mt-4">
            <ApprovalDecisionPanel
              approvalId={Number(approval.id)}
              status={approval.status_code}
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="text-base font-semibold">Approval events</div>
            <div className="text-sm text-gray-500">Append-only timeline</div>
          </div>

          <div className="p-4">
            {events.length === 0 ? (
              <div className="text-sm text-gray-600">No events.</div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div
                    key={String(e.id)}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{e.event_type}</div>
                      <div className="text-gray-500">
                        {fmtDateTime(e.created_at)}
                      </div>
                    </div>
                    {e.note && <div className="mt-1 text-gray-700">{e.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
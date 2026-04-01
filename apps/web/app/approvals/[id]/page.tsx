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
    return "rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200";
  }
  if (s === "APPROVED") {
    return "rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 ring-1 ring-inset ring-green-200";
  }
  if (s === "REJECTED") {
    return "rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-200";
  }
  return "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200";
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
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-red-100 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="text-lg font-semibold text-slate-900">Invalid route</div>
            <div className="mt-1 text-sm text-slate-600">
              Approval id tidak ditemukan dari URL.
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-white bg-white/80 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Loading approval detail...
          </div>
        </div>
      </main>
    );
  }

  if (error || !data?.approval) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Approvals
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                Approval Detail
              </h1>
              <p className="mt-3 text-sm text-slate-600">Detail approval.</p>
            </div>

            <Link
              href={backHref}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>

          <div className="mt-8 rounded-3xl border border-red-100 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
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
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />

      <div className="relative mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Approvals
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              Approval #{approval.id}
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {approval.action_code} - {approval.subject_type} #{approval.subject_id}
            </p>
          </div>

          <Link
            href={backHref}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className={statusPill(approval.status_code)}>
                {approval.status_code}
              </span>
              <div className="mt-3 text-slate-600">
                Requested: {fmtDateTime(approval.requested_at)}
              </div>
              {approval.decided_at && (
                <div className="mt-1 text-slate-600">
                  Decided: {fmtDateTime(approval.decided_at)}
                </div>
              )}
            </div>

            {approval.subject_type === "ASSET" && (
              <Link
                href={`/assets/${approval.subject_id}?tab=lifecycle`}
                className="itam-primary-action-sm"
              >
                Open Asset
              </Link>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Transition
            </div>
            <div>
              {approval.payload?.from_label
                ? `${approval.payload.from_label} (${approval.payload.from_code ?? "-"})`
                : "-"}
              {"  ->  "}
              {approval.payload?.to_label
                ? `${approval.payload.to_label} (${approval.payload.to_code ?? "-"})`
                : "-"}
            </div>
            <div className="mt-2">
              <span className="text-slate-600">Reason:</span>{" "}
              {approval.payload?.reason ?? "-"}
            </div>
          </div>

          <div className="mt-6">
            <ApprovalDecisionPanel
              approvalId={Number(approval.id)}
              status={approval.status_code}
            />
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="border-b border-slate-200 p-6">
            <div className="text-base font-semibold text-slate-900">Approval events</div>
            <div className="text-sm text-slate-500">Append-only timeline</div>
          </div>

          <div className="p-6">
            {events.length === 0 ? (
              <div className="text-sm text-slate-600">No events.</div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div
                    key={String(e.id)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{e.event_type}</div>
                      <div className="text-slate-500">
                        {fmtDateTime(e.created_at)}
                      </div>
                    </div>
                    {e.note && <div className="mt-1 text-slate-700">{e.note}</div>}
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

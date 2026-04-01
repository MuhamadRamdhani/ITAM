"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "../../lib/api";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type FilterStatus = ApprovalStatus | "ALL";

type ApprovalRow = {
  id: number;
  status: ApprovalStatus;
  action_code: string;
  requested_at?: string | null;
  created_at?: string | null;
  payload?: any;

  from_state_code?: string | null;
  from_state_display_name?: string | null;
  to_state_code?: string | null;
  to_state_display_name?: string | null;
};

function toNum(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return Number(v) || 0;
}

function normalizeStatus(v: any): ApprovalStatus {
  const s = String(v ?? "").toUpperCase().trim();
  if (s === "APPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  return "PENDING";
}

function fmtDate(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function badge(status: ApprovalStatus) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "PENDING") return `${base} bg-amber-100 text-amber-800`;
  if (status === "APPROVED") return `${base} bg-emerald-100 text-emerald-800`;
  return `${base} bg-rose-100 text-rose-800`;
}

function extractFromToReason(row: any) {
  const p = row?.payload || {};

  const fromLabel =
    row?.from_state_display_name ||
    p?.from_state_label ||
    p?.from_state_display_name ||
    null;

  const fromCode = row?.from_state_code || p?.from_state_code || null;

  const toLabel =
    row?.to_state_display_name ||
    p?.to_state_label ||
    p?.to_state_display_name ||
    null;

  const toCode = row?.to_state_code || p?.to_state_code || null;

  const from =
    fromLabel && fromCode
      ? `${fromLabel} (${fromCode})`
      : fromLabel
      ? fromLabel
      : p?.from_state_id != null
      ? `#${p.from_state_id}`
      : null;

  const to =
    toLabel && toCode
      ? `${toLabel} (${toCode})`
      : toLabel
      ? toLabel
      : p?.to_state_id != null
      ? `#${p.to_state_id}`
      : null;

  const reason =
    p?.reason || p?.notes || p?.comment || p?.approval_reason || null;

  return { from, to, reason };
}

function normalizeList(json: any): ApprovalRow[] {
  const raw = json?.items || json?.data?.items || json?.data || [];
  const arr = Array.isArray(raw) ? raw : [];

  return arr.map((r: any) => {
    const id = toNum(r.id ?? r.approval_id ?? r.approvalId);

    const status = normalizeStatus(
      r.status ?? r.approval_status ?? r.approvalStatus
    );

    const action_code =
      r.action_code ?? r.actionCode ?? r.action ?? "-";

    const requested_at =
      r.requested_at ??
      r.requestedAt ??
      r.created_at ??
      r.createdAt ??
      null;

    const created_at = r.created_at ?? r.createdAt ?? null;

    const payload = r.payload ?? r.context ?? r.meta ?? null;

    return {
      id,
      status,
      action_code: String(action_code),
      requested_at,
      created_at,
      payload,
    };
  });
}

export default function ApprovalsPanel({ assetId }: { assetId: number }) {
  const router = useRouter();

  const [status, setStatus] = useState<FilterStatus>("ALL");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ApprovalRow[]>([]);

  const path = useMemo(() => {
    const usp = new URLSearchParams();
    usp.set("subject_type", "ASSET");
    usp.set("subject_id", String(assetId));
    usp.set("page", "1");
    usp.set("page_size", "50");
    if (status !== "ALL") usp.set("status", status);
    return `/api/v1/approvals?${usp.toString()}`;
  }, [assetId, status]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await apiGet<any>(path);
        const list = normalizeList(res);

        list.sort((a, b) => {
          const da = new Date(a.requested_at || a.created_at || 0).getTime();
          const db = new Date(b.requested_at || b.created_at || 0).getTime();
          return db - da;
        });

        if (!cancelled) setItems(list);
      } catch (eAny: any) {
        if (!cancelled) {
          if (
            eAny?.code === "AUTH_REQUIRED" ||
            eAny?.code === "AUTH_UNAUTHORIZED" ||
            eAny?.http_status === 401
          ) {
            router.replace("/login");
            router.refresh();
            return;
          }
          setErr(eAny?.message || "Failed to load approvals");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [path, router]);

  const pendingCount = useMemo(
    () => items.filter((x) => x.status === "PENDING").length,
    [items]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Approvals terkait asset ini
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Approvals muncul saat lifecycle transition membutuhkan approval.
              Buka detail approval untuk Approve/Reject.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                status === "ALL"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setStatus("ALL")}
            >
              All
            </button>

            <button
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                status === "PENDING"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setStatus("PENDING")}
            >
              Pending{pendingCount ? ` (${pendingCount})` : ""}
            </button>

            <button
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                status === "APPROVED"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setStatus("APPROVED")}
            >
              Approved
            </button>

            <button
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                status === "REJECTED"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
              onClick={() => setStatus("REJECTED")}
            >
              Rejected
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200 p-6 text-sm font-semibold text-slate-900">
          Approval List
        </div>

        {loading && <div className="p-6 text-sm text-slate-600">Loading...</div>}

        {err && (
          <div className="p-6 text-sm text-rose-700">
            Error: {err}
            <div className="mt-2 text-xs text-slate-500">
              Endpoint: <span className="font-mono">{path}</span>
            </div>
          </div>
        )}

        {!loading && !err && items.length === 0 && (
          <div className="p-6 text-sm text-slate-600">
            Tidak ada approvals untuk asset ini.
          </div>
        )}

        {!loading && !err && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested At</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">From → To</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Link</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map((a) => {
                  const { from, to, reason } = extractFromToReason(a);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className={badge(a.status)}>{a.status}</span>
                      </td>

                        <td className="px-4 py-3 text-slate-700">
                        {fmtDate(a.requested_at || a.created_at)}
                      </td>

                        <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {a.action_code}
                      </td>

                        <td className="px-4 py-3 text-slate-700">
                        {from && to ? (
                          <span>
                            <span className="font-medium">{from}</span> →{" "}
                            <span className="font-medium">{to}</span>
                          </span>
                        ) : (
                            <span className="text-slate-400">-</span>
                        )}
                      </td>

                        <td className="px-4 py-3 text-slate-700">
                          {reason ? reason : <span className="text-slate-400">-</span>}
                        </td>

                      <td className="px-4 py-3">
                        <Link
                          href={`/approvals/${a.id}?returnTo=${encodeURIComponent(
                            `/assets/${assetId}?tab=approvals`
                          )}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
              Tip: buka detail untuk Approve/Reject agar konsisten dengan queue yang sudah ada.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

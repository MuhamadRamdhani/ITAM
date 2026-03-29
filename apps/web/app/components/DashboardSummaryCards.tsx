"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/api";

type DashboardSummaryData = {
  totals: {
    assets: number;
    pending_approvals: number;
    documents_in_review: number;
    evidence_files: number;
    active_scope_versions: number;
    open_context_entries: number;
    open_stakeholder_entries: number;
  };
  assets_by_state: Array<{
    state_code: string;
    state_label: string;
    total: number;
  }>;
  assets_by_type: Array<{
    asset_type_code: string;
    asset_type_label: string;
    total: number;
  }>;
};

type SummaryApiShape = {
  totals?: {
    assets?: unknown;
    pending_approvals?: unknown;
    documents_in_review?: unknown;
    evidence_files?: unknown;
    active_scope_versions?: unknown;
    open_context_entries?: unknown;
    open_stakeholder_entries?: unknown;
  };
  assets_by_state?: unknown;
  assets_by_type?: unknown;
};

function SummaryCard(props: {
  title: string;
  value: number | string;
  href?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  const toneClass =
    props.tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : props.tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : props.tone === "info"
      ? "border-cyan-200 bg-cyan-50"
      : "border-slate-200 bg-white";

  const inner = (
    <div className={`rounded-3xl border p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {props.title}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        {props.value}
      </div>
      {props.href ? (
        <div className="mt-4 text-sm font-semibold text-cyan-700">Open →</div>
      ) : null}
    </div>
  );

  if (props.href) {
    return (
      <Link href={props.href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}

function getErrorMessage(error: unknown) {
  const fallback = "Failed to load dashboard summary.";
  if (!error) return fallback;
  if (error instanceof Error && error.message) {
    if (error.message.toLowerCase() === "unauthorized") {
      return "Your session is missing or has expired. Please log in again.";
    }
    return error.message;
  }

  if (typeof error === "object" && error) {
    const e = error as { message?: string; code?: string; http_status?: number };
    const http = Number(e.http_status);
    const code = String(e.code || "").toUpperCase();
    const msg = String(e.message || "").trim();

    if (http === 401 || code === "AUTH_REQUIRED" || code === "AUTH_UNAUTHORIZED") {
      return "Your session is missing or has expired. Please log in again.";
    }
    if (http === 403 || code === "FORBIDDEN") {
      return "Access denied. You don't have permission to view this dashboard.";
    }
    return msg || fallback;
  }

  return fallback;
}

function normalizeSummary(res: unknown): DashboardSummaryData {
  const raw = extractSummaryPayload(res) as SummaryApiShape;

  return {
    totals: {
      assets: Number(raw?.totals?.assets ?? 0),
      pending_approvals: Number(raw?.totals?.pending_approvals ?? 0),
      documents_in_review: Number(raw?.totals?.documents_in_review ?? 0),
      evidence_files: Number(raw?.totals?.evidence_files ?? 0),
      active_scope_versions: Number(raw?.totals?.active_scope_versions ?? 0),
      open_context_entries: Number(raw?.totals?.open_context_entries ?? 0),
      open_stakeholder_entries: Number(raw?.totals?.open_stakeholder_entries ?? 0),
    },
    assets_by_state: Array.isArray(raw?.assets_by_state) ? raw.assets_by_state : [],
    assets_by_type: Array.isArray(raw?.assets_by_type) ? raw.assets_by_type : [],
  };
}

function extractSummaryPayload(res: unknown): unknown {
  if (!res || typeof res !== "object") return {};

  const response = res as { data?: unknown };
  const firstLayer = response.data;

  if (firstLayer && typeof firstLayer === "object" && "data" in firstLayer) {
    return (firstLayer as { data?: unknown }).data ?? {};
  }

  return response.data ?? {};
}

export default function DashboardSummaryCards() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardSummaryData | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await apiGet<unknown>("/api/v1/dashboard/summary");
        if (!active) return;

        setData(normalizeSummary(res));
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-slate-600">Loading dashboard summary...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-rose-700">{err}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-7">
        <SummaryCard title="Assets" value={data.totals.assets} href="/assets" />
        <SummaryCard
          title="Pending Approvals"
          value={data.totals.pending_approvals}
          href="/approvals?status=PENDING"
          tone="warning"
        />
        <SummaryCard
          title="Docs In Review"
          value={data.totals.documents_in_review}
          href="/documents?status=IN_REVIEW"
          tone="info"
        />
        <SummaryCard
          title="Evidence Files"
          value={data.totals.evidence_files}
          href="/evidence"
        />
        <SummaryCard
          title="Active Scope"
          value={data.totals.active_scope_versions}
          href="/governance/scope?status=ACTIVE"
          tone="success"
        />
        <SummaryCard
          title="Open Context"
          value={data.totals.open_context_entries}
          href="/governance/context?status=OPEN"
        />
        <SummaryCard
          title="Open Stakeholders"
          value={data.totals.open_stakeholder_entries}
          href="/governance/stakeholders?status=OPEN"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">Assets by State</div>
              <div className="mt-1 text-sm text-slate-700">
                Ringkasan status lifecycle aset.
              </div>
            </div>
            <Link href="/assets" className="text-sm font-medium text-cyan-700 hover:underline">
              Open Assets
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.assets_by_state.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={3} className="py-6 text-slate-600">
                      No asset state summary.
                    </td>
                  </tr>
                ) : (
                  data.assets_by_state.map((row) => (
                    <tr key={row.state_code} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{row.state_label}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                        {row.state_code}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-900">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">Assets by Type</div>
              <div className="mt-1 text-sm text-slate-700">
                Ringkasan aset berdasarkan asset type.
              </div>
            </div>
            <Link href="/assets" className="text-sm font-medium text-cyan-700 hover:underline">
              Open Assets
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.assets_by_type.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={3} className="py-6 text-slate-600">
                      No asset type summary.
                    </td>
                  </tr>
                ) : (
                  data.assets_by_type.map((row) => (
                    <tr key={row.asset_type_code} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{row.asset_type_label}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                        {row.asset_type_code}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-900">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

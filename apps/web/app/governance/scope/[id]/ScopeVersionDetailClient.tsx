"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiPostJson } from "../../../lib/api";

type ScopeVersion = {
  id: number | string;
  tenant_id: number | string;
  version_no: number;
  status: string;
  scope_json: any;
  note?: string | null;
  created_by_user_id?: number | string | null;
  updated_by_user_id?: number | string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  activated_at?: string | null;
  superseded_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ScopeEvent = {
  id: number | string;
  tenant_id: number | string;
  scope_version_id: number | string;
  event_type: string;
  actor_user_id?: number | string | null;
  note?: string | null;
  event_payload?: any;
  created_at: string;
};

type ScopeDetailData = {
  version: ScopeVersion;
  events: ScopeEvent[];
};

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "SUBMITTED") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "ACTIVE") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (s === "SUPERSEDED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function prettyJson(v: any) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v);
  }
}

function getErrorMessage(error: unknown, fallback = "Failed to load scope version") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function normalizeScopeDetail(res: any): ScopeDetailData | null {
  const raw = res?.data?.data ?? res?.data ?? null;
  if (!raw?.version) return null;

  return {
    version: raw.version,
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

export default function ScopeVersionDetailClient(props: { scopeVersionId: number }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ScopeDetailData | null>(null);

  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await apiGet<any>(`/api/v1/governance/scope/versions/${props.scopeVersionId}`);
      const normalized = normalizeScopeDetail(res);

      if (!normalized) {
        throw new Error("Scope version not found");
      }

      setData(normalized);
    } catch (error) {
      setErr(getErrorMessage(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [props.scopeVersionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const status = useMemo(() => {
    return String(data?.version?.status ?? "").toUpperCase();
  }, [data]);

  const canSubmit = status === "DRAFT";
  const canApprove = status === "SUBMITTED";
  const canActivate = status === "APPROVED";

  async function callAction(action: "submit" | "approve" | "activate") {
    setActing(true);
    setActionErr(null);

    try {
      await apiPostJson(`/api/v1/governance/scope/versions/${props.scopeVersionId}/${action}`, {
        note: actionNote.trim() || undefined,
      });

      setActionNote("");
      await loadDetail();
    } catch (error) {
      setActionErr(getErrorMessage(error, `Failed to ${action} scope version`));
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Loading scope version...
          </div>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/governance/scope"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>

          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/governance/scope"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Scope version not found.
          </div>
        </div>
      </main>
    );
  }

  const version = data.version;
  const events = data.events;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Scope Version v{Number(version.version_no)}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Scope Version #{version.id}
            </p>
          </div>

          <Link
            href="/governance/scope"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-500">Status</div>
                <div className="mt-2">
                  <span className={statusPill(version.status)}>{version.status}</span>
                </div>
              </div>

              <div className="text-right text-sm text-gray-600">
                <div>Created: {fmtDateTime(version.created_at)}</div>
                <div className="mt-1">Updated: {fmtDateTime(version.updated_at)}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">Submitted At</div>
                <div className="mt-1 text-gray-700">{fmtDateTime(version.submitted_at)}</div>
              </div>

              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">Approved At</div>
                <div className="mt-1 text-gray-700">{fmtDateTime(version.approved_at)}</div>
              </div>

              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">Activated At</div>
                <div className="mt-1 text-gray-700">{fmtDateTime(version.activated_at)}</div>
              </div>

              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <div className="font-medium text-gray-900">Superseded At</div>
                <div className="mt-1 text-gray-700">{fmtDateTime(version.superseded_at)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-md border bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">Note</div>
              <div className="mt-2 text-sm text-gray-700">{version.note || "-"}</div>
            </div>

            <div className="mt-4 rounded-md border bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">scope_json</div>
              <pre className="mt-2 max-h-[520px] overflow-auto rounded-md bg-white p-3 text-xs">
                {prettyJson(version.scope_json)}
              </pre>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-gray-900">Workflow Actions</div>
              <div className="mt-1 text-sm text-gray-600">
                Status sekarang: <b>{status || "-"}</b>
              </div>

              <textarea
                className="mt-4 w-full rounded-md border px-3 py-2 text-sm"
                rows={4}
                placeholder="Note (optional)"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                disabled={acting}
              />

              {actionErr ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {actionErr}
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => callAction("submit")}
                  disabled={!canSubmit || acting}
                  className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Submit
                </button>

                <button
                  type="button"
                  onClick={() => callAction("approve")}
                  disabled={!canApprove || acting}
                  className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => callAction("activate")}
                  disabled={!canActivate || acting}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  Activate
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Rule: DRAFT → SUBMITTED → APPROVED → ACTIVE
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-base font-semibold text-gray-900">Event Timeline</div>

              {events.length === 0 ? (
                <div className="mt-3 text-sm text-gray-600">No events.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {events.map((e) => (
                    <div key={String(e.id)} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-gray-900">{e.event_type}</div>
                        <div className="text-xs text-gray-500">{fmtDateTime(e.created_at)}</div>
                      </div>

                      <div className="mt-2 text-gray-700">
                        Actor User: {e.actor_user_id ?? "-"}
                      </div>

                      <div className="mt-1 text-gray-700">
                        Note: {e.note || "-"}
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-blue-700">
                          Event payload
                        </summary>
                        <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
                          {prettyJson(e.event_payload)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
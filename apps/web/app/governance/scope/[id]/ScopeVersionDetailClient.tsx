"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { canApproveActivateGovernance, canManageGovernance } from "../../../lib/governanceAccess";
import { apiDelete, apiGet, apiPostJson } from "../../../lib/api";

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

type ScopeSummary = {
  assetTypes: string[];
  departments: string[];
  locations: string[];
  environments: string[];
  notes: string;
  stakeholderSummary: string;
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

function parseJsonLike(v: any) {
  if (v && typeof v === "object") return v;
  if (typeof v !== "string") return {};

  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

function toTextArray(value: any): string[] {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function formatScopeLabel(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  if (raw.toUpperCase() === "SAAS") return "SaaS";
  if (raw.toUpperCase() === "ON_PREM") return "On Prem";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase())
    .replace(/\bVm\b/g, "VM")
    .replace(/\bId\b/g, "ID");
}

function normalizeLookupItems(res: any) {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items
    .map((row: any) => ({
      id: Number(row?.id),
      name: String(row?.name ?? row?.display_name ?? row?.label ?? "").trim(),
      code: row?.code ? String(row.code).trim() : undefined,
    }))
    .filter((row: { id: number; name: string }) => Number.isFinite(row.id) && row.id > 0 && row.name);
}

function resolveDepartmentLabel(value: string, labelMap: Map<number, string>) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return formatScopeLabel(raw);
  return labelMap.get(numeric) || "-";
}

function resolveLocationLabel(value: string, labelMap: Map<number, string>) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return formatScopeLabel(raw);
  return labelMap.get(numeric) || "-";
}

function normalizeScopeSummary(
  rawScopeJson: any,
  departmentLabelMap: Map<number, string>,
  locationLabelMap: Map<number, string>
): ScopeSummary {
  const source = parseJsonLike(rawScopeJson);
  return {
    assetTypes: toTextArray(source.asset_type_codes).map(formatScopeLabel),
    departments: toTextArray(source.department_ids).map((value) =>
      resolveDepartmentLabel(value, departmentLabelMap)
    ),
    locations: toTextArray(source.location_ids).map((value) =>
      resolveLocationLabel(value, locationLabelMap)
    ),
    environments: toTextArray(source.environments).map(formatScopeLabel),
    notes: String(source.notes ?? "").trim(),
    stakeholderSummary: String(source.stakeholder_summary ?? "").trim(),
  };
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ScopeDetailData | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canApproveActivate, setCanApproveActivate] = useState(false);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);

  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingScopeVersion, setDeletingScopeVersion] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [res, meRes, deptRes, locRes] = await Promise.all([
        apiGet<any>(`/api/v1/governance/scope/versions/${props.scopeVersionId}`),
        apiGet<any>("/api/v1/auth/me").catch(() => null),
        apiGet<any>("/api/v1/departments?page=1&page_size=500").catch(() => null),
        apiGet<any>("/api/v1/locations?page=1&page_size=500").catch(() => null),
      ]);
      const normalized = normalizeScopeDetail(res);

      if (!normalized) {
        throw new Error("Scope version not found");
      }

      setData(normalized);
      setDepartments(normalizeLookupItems(deptRes));
      setLocations(normalizeLookupItems(locRes));

      const meData = meRes?.data?.data ?? meRes?.data ?? {};
      const roles = Array.isArray(meData?.roles) ? meData.roles : [];
      setCanManage(canManageGovernance(roles));
      setCanApproveActivate(canApproveActivateGovernance(roles));
    } catch (error) {
      setErr(getErrorMessage(error));
      setData(null);
      setCanManage(false);
      setCanApproveActivate(false);
      setDepartments([]);
      setLocations([]);
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

  const departmentLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of departments) {
      map.set(Number(row.id), row.name);
    }
    return map;
  }, [departments]);

  const locationLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of locations) {
      map.set(Number(row.id), row.name);
    }
    return map;
  }, [locations]);

  const canSubmit = status === "DRAFT";
  const canApprove = status === "SUBMITTED";
  const canActivate = status === "APPROVED";
  const canDeleteDraft = canManage && status === "DRAFT";

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

  async function onDeleteDraft() {
    if (!data) return;

    setDeletingScopeVersion(true);
    setActionErr(null);

    try {
      await apiDelete(`/api/v1/governance/scope/versions/${props.scopeVersionId}`);
      setShowDeleteConfirm(false);
      window.location.assign("/governance/scope");
    } catch (error) {
      setActionErr(getErrorMessage(error, "Failed to delete scope version"));
    } finally {
      setDeletingScopeVersion(false);
    }
  }

  if (loading) {
    return (
      <main className="relative z-10">
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
      <main className="relative z-10">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/governance/scope"
              className="itam-secondary-action"
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
      <main className="relative z-10">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/governance/scope"
              className="itam-secondary-action"
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
  const scopeSummary = normalizeScopeSummary(version.scope_json, departmentLabelMap, locationLabelMap);

  return (
    <main className="relative z-10">
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
            className="itam-secondary-action"
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
              <div className="text-sm font-semibold text-gray-900">Scope Summary</div>
              <div className="mt-3 space-y-4 text-sm text-gray-700">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Asset Types
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {scopeSummary.assetTypes.length > 0 ? (
                      scopeSummary.assetTypes.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Departments
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {scopeSummary.departments.length > 0 ? (
                      scopeSummary.departments.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Locations
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {scopeSummary.locations.length > 0 ? (
                      scopeSummary.locations.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-700"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Environments
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {scopeSummary.environments.length > 0 ? (
                      scopeSummary.environments.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Notes
                  </div>
                  <div className="mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                    {scopeSummary.notes || "-"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Stakeholder Summary
                  </div>
                  <div className="mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                    {scopeSummary.stakeholderSummary || "-"}
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-md border bg-white px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-gray-900">
                  Advanced: raw scope_json
                </summary>
                <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
                  {prettyJson(version.scope_json)}
                </pre>
              </details>
            </div>
          </div>

          <div className="space-y-4">
            {canManage ? (
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
                {canDeleteDraft ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={acting || deletingScopeVersion}
                    className="itam-secondary-action-sm border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Delete Draft
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => callAction("submit")}
                  disabled={!canSubmit || acting}
                  className="itam-primary-action-sm disabled:opacity-50"
                >
                  Submit
                </button>

                <button
                  type="button"
                  onClick={() => callAction("approve")}
                  disabled={!canApprove || !canApproveActivate || acting}
                  className="itam-primary-action-sm disabled:opacity-50"
                >
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => callAction("activate")}
                  disabled={!canActivate || !canApproveActivate || acting}
                  className="itam-primary-action-sm disabled:opacity-50"
                >
                  Activate
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Rule: DRAFT → SUBMITTED → APPROVED → ACTIVE
              </div>
            </div>

            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="text-base font-semibold text-gray-900">Workflow Actions</div>
                <div className="mt-2 text-sm text-gray-600">
                  Read only. Submit scope versions are restricted to SUPERADMIN,
                  TENANT_ADMIN, and ITAM_MANAGER. Approve and activate are restricted to
                  TENANT_ADMIN.
                </div>
              </div>
            )}

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

      {showDeleteConfirm && canDeleteDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white shadow-2xl">
            <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
              <div className="text-lg font-semibold text-rose-900">Delete Draft</div>
              <div className="mt-1 text-sm text-rose-800">
                Scope version draft ini akan dihapus permanen.
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                Aksi ini hanya tersedia untuk scope version dengan status DRAFT.
              </div>

              {actionErr ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {actionErr}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={deletingScopeVersion}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={deletingScopeVersion}
                  onClick={() => void onDeleteDraft()}
                >
                  {deletingScopeVersion ? "Deleting..." : "Delete Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

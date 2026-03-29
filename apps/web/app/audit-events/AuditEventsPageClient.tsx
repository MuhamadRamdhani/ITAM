"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../lib/api";
import { SkeletonTableRow, ErrorState } from "../lib/loadingComponents";

type AuditEventRow = {
  id: number | string;
  tenant_id: number | string;
  actor?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | string | null;
  payload?: unknown;
  created_at: string;
};

type AuditEventsListData = {
  items: AuditEventRow[];
  total: number;
  page: number;
  page_size: number;
};

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function prettyJson(v: unknown) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v);
  }
}

function toFriendlyErrorMessage(error: unknown) {
  const fallback = "Failed to load audit trail.";
  if (!error) return fallback;

  if (typeof error === "object" && error) {
    const e = error as {
      message?: string;
      code?: string;
      http_status?: number;
      details?: unknown;
    };

    const http = Number(e.http_status);
    const code = String(e.code || "").toUpperCase();

    if (http === 401 || code === "AUTH_REQUIRED") {
      return "Your session is missing or has expired. Please log in again.";
    }
    if (http === 403 || code === "FORBIDDEN") {
      return "Access denied. Audit Trail is restricted to SUPERADMIN, TENANT_ADMIN, ITAM_MANAGER, or AUDITOR.";
    }

    const raw = String(e.message || "").trim();
    if (raw.toLowerCase() === "unauthorized") {
      return "Your session is missing or has expired. Please log in again.";
    }

    return raw || fallback;
  }

  return fallback;
}

function normalizeUiConfig(res: unknown): UiConfigNormalized {
  const wrap = res as { data?: unknown };
  const raw =
    (wrap?.data as { data?: unknown })?.data ??
    (wrap?.data as unknown) ??
    {};
  const o = raw as {
    page_size_options?: unknown;
    ui?: { page_size?: { options?: unknown }; documents?: { page_size?: { default?: unknown } } };
    documents_page_size_default?: unknown;
  };
  const optionsRaw = o?.page_size_options ?? o?.ui?.page_size?.options ?? [];
  const pageSizeOptions = Array.isArray(optionsRaw)
    ? optionsRaw.map((x) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const safeOptions = pageSizeOptions.length > 0 ? pageSizeOptions : [10, 20, 50];
  const defaultRaw = Number(
    o?.documents_page_size_default ??
      o?.ui?.documents?.page_size?.default ??
      safeOptions[0]
  );
  const pageSizeDefault = safeOptions.includes(defaultRaw) ? defaultRaw : safeOptions[0];

  return { pageSizeOptions: safeOptions, pageSizeDefault };
}

function normalizeAuditEventsList(res: unknown): AuditEventsListData {
  const wrap = res as { data?: unknown };
  const raw = (wrap?.data as { data?: unknown })?.data ?? wrap?.data ?? {};
  const o = raw as { items?: unknown; total?: unknown; page?: unknown; page_size?: unknown };
  return {
    items: Array.isArray(o?.items) ? (o.items as AuditEventRow[]) : [],
    total: Number(o?.total ?? 0),
    page: Number(o?.page ?? 1),
    page_size: Number(o?.page_size ?? 10),
  };
}

function buildHref(params: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  dateFrom: string;
  dateTo: string;
  q: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();
  if (params.actor) p.set("actor", params.actor);
  if (params.action) p.set("action", params.action);
  if (params.entityType) p.set("entity_type", params.entityType);
  if (params.entityId) p.set("entity_id", params.entityId);
  if (params.dateFrom) p.set("date_from", params.dateFrom);
  if (params.dateTo) p.set("date_to", params.dateTo);
  if (params.q) p.set("q", params.q);
  if (params.page && params.page > 0) p.set("page", String(params.page));
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  const qs = p.toString();
  return qs ? `/audit-events?${qs}` : "/audit-events";
}

function buildExportUrl(params: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  dateFrom: string;
  dateTo: string;
  q: string;
}) {
  const baseRaw = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const base = String(baseRaw).replace(/\/+$/, "");
  if (!base) return "";

  const p = new URLSearchParams();
  p.set("format", "json");
  p.set("limit", "5000");
  p.set("offset", "0");

  if (params.actor) p.set("actor", params.actor);
  if (params.action) p.set("action", params.action);
  if (params.entityType) p.set("entity_type", params.entityType);
  if (params.entityId) p.set("entity_id", params.entityId);
  if (params.dateFrom) p.set("date_from", params.dateFrom);
  if (params.dateTo) p.set("date_to", params.dateTo);
  if (params.q) p.set("q", params.q);

  return `${base}/api/v1/audit-events/export?${p.toString()}`;
}

const ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: "Login success",
  AUTH_LOGIN_FAILED: "Login failed",
  AUTH_LOGOUT: "Logout",
  AUTH_REFRESH: "Session refreshed",

  ASSET_CREATED: "Asset created",
  ASSET_UPDATED: "Asset updated",
  ASSET_TRANSITION_REQUESTED: "Lifecycle transition requested",
  ASSET_TRANSITION_APPLIED: "Lifecycle transition applied",

  APPROVAL_CREATED: "Approval created",
  APPROVAL_DECIDED: "Approval decided",
  APPROVAL_APPLY_RESULT: "Approval apply result",

  DOCUMENT_CREATED: "Document created",
  DOCUMENT_VERSION_ADDED: "Document version added",
  DOCUMENT_SUBMITTED: "Document submitted",
  DOCUMENT_APPROVED: "Document approved",
  DOCUMENT_PUBLISHED: "Document published",
  DOCUMENT_ARCHIVED: "Document archived",

  EVIDENCE_FILE_UPLOADED: "Evidence uploaded",
  EVIDENCE_LINK_ATTACHED: "Evidence attached",

  SCOPE_VERSION_CREATED: "Scope version created",
  SCOPE_VERSION_SUBMITTED: "Scope version submitted",
  SCOPE_VERSION_APPROVED: "Scope version approved",
  SCOPE_VERSION_ACTIVATED: "Scope version activated",
  SCOPE_VERSION_SUPERSEDED: "Scope version superseded",

  CONTEXT_CREATED: "Context created",
  CONTEXT_UPDATED: "Context updated",

  STAKEHOLDER_CREATED: "Stakeholder created",
  STAKEHOLDER_UPDATED: "Stakeholder updated",
};

const ENTITY_LABELS: Record<string, string> = {
  USER: "User",
  ASSET: "Aset",
  APPROVAL: "Approval",
  DOCUMENT: "Dokumen",
  EVIDENCE_FILE: "Evidence File",
  EVIDENCE_LINK: "Evidence Link",
  SCOPE_VERSION: "Scope Version",
  CONTEXT: "Context",
  STAKEHOLDER: "Stakeholder",
};

function actionLabel(actionCode: string) {
  const key = String(actionCode || "").trim().toUpperCase();
  return ACTION_LABELS[key] || key || "-";
}

function entityLabel(entityType: string) {
  const key = String(entityType || "").trim().toUpperCase();
  return ENTITY_LABELS[key] || key || "-";
}

function actorLabel(actor: string | null | undefined) {
  const s = String(actor || "").trim();
  if (!s) return "-";
  if (s.startsWith("USER:")) return `User ${s.replace("USER:", "#")}`;
  if (s.startsWith("IDENTITY:")) return `Identity ${s.replace("IDENTITY:", "#")}`;
  return s;
}

function toIsoDate(d: Date) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, Math.floor(days)));
  return toIsoDate(d);
}

export default function AuditEventsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const actor = (searchParams.get("actor") || "").trim();
  const action = (searchParams.get("action") || "").trim().toUpperCase();
  const entityType = (searchParams.get("entity_type") || "").trim().toUpperCase();
  const entityId = (searchParams.get("entity_id") || "").trim();
  const dateFrom = (searchParams.get("date_from") || "").trim();
  const dateTo = (searchParams.get("date_to") || "").trim();
  const q = (searchParams.get("q") || "").trim();
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<unknown>(null);
  const [items, setItems] = useState<AuditEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([10, 20, 50]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [actorInput, setActorInput] = useState(actor);
  const [actionInput, setActionInput] = useState(action);
  const [entityTypeInput, setEntityTypeInput] = useState(entityType);
  const [entityIdInput, setEntityIdInput] = useState(entityId);
  const [dateFromInput, setDateFromInput] = useState(dateFrom);
  const [dateToInput, setDateToInput] = useState(dateTo);
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    setActorInput(actor);
    setActionInput(action);
    setEntityTypeInput(entityType);
    setEntityIdInput(entityId);
    setDateFromInput(dateFrom);
    setDateToInput(dateTo);
    setQInput(q);
  }, [actor, action, entityType, entityId, dateFrom, dateTo, q]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const cfgRes = await apiGet<unknown>("/api/v1/config/ui", {
          loadingKey: "audit_events_config",
        });
        const cfg = normalizeUiConfig(cfgRes);

        if (!active) return;

        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize = cfg.pageSizeOptions.includes(pageSizeFromUrl)
          ? pageSizeFromUrl
          : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const qs = new URLSearchParams();
        if (actor) qs.set("actor", actor);
        if (action) qs.set("action", action);
        if (entityType) qs.set("entity_type", entityType);
        if (entityId) qs.set("entity_id", entityId);
        if (dateFrom) qs.set("date_from", dateFrom);
        if (dateTo) qs.set("date_to", dateTo);
        if (q) qs.set("q", q);
        qs.set("page", String(pageFromUrl));
        qs.set("page_size", String(effectivePageSize));

        const res = await apiGet<unknown>(`/api/v1/audit-events?${qs.toString()}`, {
          loadingKey: "audit_events_list",
          loadingDelay: 300,
        });
        const data = normalizeAuditEventsList(res);

        if (!active) return;

        setItems(data.items);
        setTotal(data.total);
      } catch (error) {
        if (!active) return;
        setErr(error);
        setItems([]);
        setTotal(0);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [actor, action, entityType, entityId, dateFrom, dateTo, q, pageFromUrl, pageSizeFromUrl]);

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;
  const shownFrom = total === 0 ? 0 : (pageFromUrl - 1) * pageSize + 1;
  const shownTo = total === 0 ? 0 : Math.min(total, pageFromUrl * pageSize);

  function applyQuickFilter(next: {
    action?: string;
    entityType?: string;
    days?: number;
  }) {
    const df = next.days != null ? isoDaysAgo(next.days) : dateFromInput.trim();
    const dt = next.days != null ? toIsoDate(new Date()) : dateToInput.trim();

    const a = String(next.action ?? actionInput).trim().toUpperCase();
    const et = String(next.entityType ?? entityTypeInput).trim().toUpperCase();

    setActionInput(a);
    setEntityTypeInput(et);
    setDateFromInput(df);
    setDateToInput(dt);

    router.push(
      buildHref({
        actor: actorInput.trim(),
        action: a,
        entityType: et,
        entityId: entityIdInput.trim(),
        dateFrom: df,
        dateTo: dt,
        q: qInput.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  function onPageSizeChange(nextPageSize: number) {
    router.push(
      buildHref({
        actor,
        action,
        entityType,
        entityId,
        dateFrom,
        dateTo,
        q,
        page: 1,
        pageSize: nextPageSize,
      })
    );
  }

  function onSubmitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    router.push(
      buildHref({
        actor: actorInput.trim(),
        action: actionInput.trim().toUpperCase(),
        entityType: entityTypeInput.trim().toUpperCase(),
        entityId: entityIdInput.trim(),
        dateFrom: dateFromInput.trim(),
        dateTo: dateToInput.trim(),
        q: qInput.trim(),
        page: 1,
        pageSize,
      })
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Audit Trail</h1>
            <p className="mt-1 text-sm text-gray-600">
              Record of important system activity (e.g., login, assets, approvals, documents).
            </p>
          </div>

          <div className="flex items-center gap-2">
            {buildExportUrl({
              actor: actorInput.trim(),
              action: actionInput.trim().toUpperCase(),
              entityType: entityTypeInput.trim().toUpperCase(),
              entityId: entityIdInput.trim(),
              dateFrom: dateFromInput.trim(),
              dateTo: dateToInput.trim(),
              q: qInput.trim(),
            }) ? (
              <a
                href={buildExportUrl({
                  actor: actorInput.trim(),
                  action: actionInput.trim().toUpperCase(),
                  entityType: entityTypeInput.trim().toUpperCase(),
                  entityId: entityIdInput.trim(),
                  dateFrom: dateFromInput.trim(),
                  dateTo: dateToInput.trim(),
                  q: qInput.trim(),
                })}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Download JSON
              </a>
            ) : null}

            <Link
              href="/"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          <div className="font-semibold text-gray-900">Quick guide</div>
          <div className="mt-1 text-gray-600">
            Event = what happened, Object = what was affected, Details = extra information.
          </div>
          <div className="mt-1 text-gray-600">
            Note: this page is restricted to SUPERADMIN / TENANT_ADMIN / ITAM_MANAGER / AUDITOR.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickFilter({ action: "AUTH_LOGIN_SUCCESS", entityType: "USER", days: 7 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Login success (7 days)
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ action: "ASSET_CREATED", entityType: "ASSET", days: 7 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Asset created (7 days)
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ action: "APPROVAL_DECIDED", entityType: "APPROVAL", days: 7 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Approval decided (7 days)
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ action: "DOCUMENT_PUBLISHED", entityType: "DOCUMENT", days: 30 })}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Document published (30 days)
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-4" onSubmit={onSubmitSearch}>
            <input
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="Actor (e.g., USER:1 / IDENTITY:10)"
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="Event (e.g., ASSET_CREATED)"
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              value={entityTypeInput}
              onChange={(e) => setEntityTypeInput(e.target.value)}
              placeholder="Object type (e.g., USER / ASSET)"
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
              placeholder="Object ID (optional)"
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => setDateFromInput(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              type="date"
              value={dateToInput}
              onChange={(e) => setDateToInput(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
            />

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search actor/event/object/details..."
              className="rounded-md border px-3 py-2 text-sm lg:col-span-2"
            />

            <div className="flex gap-2 lg:col-span-4">
              <select
                value={String(pageSize)}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="rounded-md border px-3 py-2 text-sm"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} / page
                  </option>
                ))}
              </select>

              <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                Apply Filters
              </button>

              <Link
                href="/audit-events"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="mt-4 text-sm text-gray-500">
            Showing {shownFrom}–{shownTo} of {total}
          </div>

          {err ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {toFriendlyErrorMessage(err)}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Object</th>
                  <th className="py-2 pr-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonTableRow cols={5} />
                    <SkeletonTableRow cols={5} />
                    <SkeletonTableRow cols={5} />
                    <SkeletonTableRow cols={5} />
                    <SkeletonTableRow cols={5} />
                  </>
                ) : items.length === 0 ? (
                  <tr className="border-t">
                    <td colSpan={5} className="py-6 text-gray-600">
                      No data.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={String(row.id)} className="border-t align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(row.created_at)}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{actorLabel(row.actor)}</div>
                        {row.actor ? (
                          <div className="text-xs text-gray-500">{row.actor}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{actionLabel(row.action)}</div>
                        <div className="text-xs text-gray-500">{row.action}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-gray-900">{entityLabel(row.entity_type)}</div>
                        <div className="text-xs text-gray-500">{row.entity_type}</div>
                        <div className="text-xs text-gray-500">
                          ID: {row.entity_id ?? "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-blue-700">
                            View details
                          </summary>
                          <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
                            {prettyJson(row.payload)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-gray-500">
              Page {pageFromUrl} / {totalPages} (page size: {pageSize})
            </div>

            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  href={buildHref({
                    actor,
                    action,
                    entityType,
                    entityId,
                    dateFrom,
                    dateTo,
                    q,
                    page: pageFromUrl - 1,
                    pageSize,
                  })}
                >
                  Prev
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  Prev
                </span>
              )}

              {canNext ? (
                <Link
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  href={buildHref({
                    actor,
                    action,
                    entityType,
                    entityId,
                    dateFrom,
                    dateTo,
                    q,
                    page: pageFromUrl + 1,
                    pageSize,
                  })}
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  Next
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

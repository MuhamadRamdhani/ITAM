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

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatPayloadValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    const items = value
      .map((item) => formatPayloadValue(item, depth + 1))
      .filter((item) => item !== "-");
    if (items.length === 0) return "-";
    return items.join(", ");
  }

  const record = toObjectRecord(value);
  if (!record) return String(value);

  const entries = Object.entries(record);
  if (entries.length === 0) return "-";
  if (depth >= 1) {
    return `Object(${entries.length})`;
  }

  return entries
    .slice(0, 4)
    .map(([key, nestedValue]) => `${humanizeKey(key)}: ${formatPayloadValue(nestedValue, depth + 1)}`)
    .join("\n");
}

function buildPayloadSummary(value: unknown): Array<{ key: string; value: string }> {
  const record = toObjectRecord(value);
  if (!record) return [];

  return Object.entries(record)
    .map(([key, nestedValue]) => ({
      key: humanizeKey(key),
      value: formatPayloadValue(nestedValue),
    }))
    .filter((item) => item.value !== "-" && item.value.trim() !== "");
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
  format: "json" | "xlsx";
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
  p.set("format", params.format);
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

function actorEmailFromPayload(payload: unknown): string {
  const record = toObjectRecord(payload);
  if (!record) return "";

  const value =
    record.email ??
    record.actor_email ??
    record.user_email ??
    record.identity_email ??
    record.identityEmail ??
    record.userEmail ??
    null;

  return String(value || "").trim();
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
  const exportUrl = buildExportUrl({
    format: "json",
    actor: actorInput.trim(),
    action: actionInput.trim().toUpperCase(),
    entityType: entityTypeInput.trim().toUpperCase(),
    entityId: entityIdInput.trim(),
    dateFrom: dateFromInput.trim(),
    dateTo: dateToInput.trim(),
    q: qInput.trim(),
  });
  const exportXlsxUrl = buildExportUrl({
    format: "xlsx",
    actor: actorInput.trim(),
    action: actionInput.trim().toUpperCase(),
    entityType: entityTypeInput.trim().toUpperCase(),
    entityId: entityIdInput.trim(),
    dateFrom: dateFromInput.trim(),
    dateTo: dateToInput.trim(),
    q: qInput.trim(),
  });

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
    <main className="relative z-10">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Audit Trail
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Audit Trail
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                Record of important system activity (e.g., login, assets, approvals, documents).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:self-end">
              {exportXlsxUrl ? (
                <a
                  href={exportXlsxUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-100"
                >
                  Download Excel
                </a>
              ) : null}

              {exportUrl ? (
                <a
                  href={exportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Download JSON
                </a>
              ) : null}

              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back
              </Link>
            </div>

          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="font-semibold text-slate-900">Quick guide</div>
          <div className="mt-1 text-slate-600">
            Event = what happened, Object = what was affected, Details = extra information.
          </div>
          <div className="mt-1 text-slate-600">
            Note: this page is restricted to SUPERADMIN / TENANT_ADMIN / ITAM_MANAGER / AUDITOR.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyQuickFilter({ action: "AUTH_LOGIN_SUCCESS", entityType: "USER", days: 7 })}
                className="itam-secondary-action-sm"
              >
                Login success (7 days)
              </button>
              <button
                type="button"
                onClick={() => applyQuickFilter({ action: "ASSET_CREATED", entityType: "ASSET", days: 7 })}
                className="itam-secondary-action-sm"
              >
                Asset created (7 days)
              </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ action: "APPROVAL_DECIDED", entityType: "APPROVAL", days: 7 })}
              className="itam-secondary-action-sm"
            >
              Approval decided (7 days)
            </button>
              <button
                type="button"
                onClick={() => applyQuickFilter({ action: "DOCUMENT_PUBLISHED", entityType: "DOCUMENT", days: 30 })}
                className="itam-secondary-action-sm"
              >
                Document published (30 days)
              </button>
          </div>
        </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <form className="grid grid-cols-1 gap-3 lg:grid-cols-4" onSubmit={onSubmitSearch}>
            <input
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="Actor (e.g., USER:1 / IDENTITY:10)"
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder="Event (e.g., ASSET_CREATED)"
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              value={entityTypeInput}
              onChange={(e) => setEntityTypeInput(e.target.value)}
              placeholder="Object type (e.g., USER / ASSET)"
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
              placeholder="Object ID (optional)"
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => setDateFromInput(e.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              type="date"
              value={dateToInput}
              onChange={(e) => setDateToInput(e.target.value)}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search actor/event/object/details..."
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none lg:col-span-2 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
            />

            <div className="flex gap-2 lg:col-span-4">
              <select
                value={String(pageSize)}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} / page
                  </option>
                ))}
              </select>

              <button className="itam-primary-action-sm">
                Apply Filters
              </button>

              <Link
                href="/audit-events"
                className="itam-secondary-action"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="mt-4 text-sm text-slate-500">
            Showing {shownFrom}–{shownTo} of {total}
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {toFriendlyErrorMessage(err)}
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-[13px] leading-6">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-4 py-4 pr-6">Time</th>
                  <th className="px-4 py-4 pr-6">Actor</th>
                  <th className="px-4 py-4 pr-6">Event</th>
                  <th className="px-4 py-4 pr-6">Object</th>
                  <th className="px-4 py-4 pr-6">Details</th>
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
                  <tr className="border-t border-slate-100">
                    <td colSpan={5} className="px-4 py-8 text-slate-600">
                      No data.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={String(row.id)} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-4 py-4 pr-6 align-top">{fmtDateTime(row.created_at)}</td>
                      <td className="px-4 py-4 pr-6 align-top">
                        <div className="font-medium text-slate-900">
                          {actorLabel(row.actor)}
                        </div>
                        {actorEmailFromPayload(row.payload) ? (
                          <div className="mt-1 text-xs text-cyan-700">
                            {actorEmailFromPayload(row.payload)}
                          </div>
                        ) : null}
                        {row.actor ? (
                          <div className="mt-1 text-xs text-slate-500">{row.actor}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 pr-6 align-top">
                        <div className="font-medium text-slate-900">{actionLabel(row.action)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.action}</div>
                      </td>
                      <td className="px-4 py-4 pr-6 align-top">
                        <div className="font-medium text-slate-900">{entityLabel(row.entity_type)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.entity_type}</div>
                        <div className="text-xs text-slate-500">
                          ID: {row.entity_id ?? "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4 pr-6 align-top">
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-cyan-700">
                            View details
                          </summary>
                          <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700 shadow-sm">
                            {buildPayloadSummary(row.payload).length > 0 ? (
                              <div className="space-y-3">
                                {buildPayloadSummary(row.payload).map((item) => (
                                  <div key={`${item.key}-${item.value}`} className="space-y-1">
                                    <div className="font-semibold text-slate-900">{item.key}</div>
                                    <div className="whitespace-pre-wrap break-words text-slate-700">
                                      {item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-slate-500">No details.</div>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              Page {pageFromUrl} / {totalPages} (page size: {pageSize})
            </div>

            <div className="flex gap-2">
              {canPrev ? (
                <Link
                  className="itam-secondary-action-sm"
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
                <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                  Prev
                </span>
              )}

              {canNext ? (
                <Link
                  className="itam-secondary-action-sm"
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
                <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                  Next
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </main>
  );
}

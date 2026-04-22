"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { canFinalizeDocuments, canManageDocuments } from "../../lib/documentAccess";
import DocumentActionsPanel from "./DocumentActionsPanel";
import AddVersionPanel from "./AddVersionPanel";
import DocumentEvidencePanel from "./DocumentEvidencePanel";

type Document = {
  id: number | string;
  tenant_id: number | string;
  doc_type_code: string;
  title: string;
  status_code: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};

type DocVersion = {
  id: number | string;
  version_no: number;
  content_json?: Record<string, unknown> | string | null;
  created_by_identity_id?: number | null;
  created_at: string;
};

type DocEvent = {
  id: number | string;
  event_type: string;
  actor_identity_id?: number | null;
  note?: string | null;
  event_payload?: Record<string, unknown> | null;
  created_at: string;
};

type DocumentBundle = {
  document: Document;
  latest_version: DocVersion | null;
  versions: DocVersion[];
  events: DocEvent[];
};

type MeData = {
  roles: string[];
};

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = (status ?? "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 ring-1 ring-inset ring-slate-200";
  if (s === "IN_REVIEW") return "rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 ring-1 ring-inset ring-green-200";
  if (s === "PUBLISHED") return "rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-200";
  if (s === "ARCHIVED") return "rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200";
  return "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200";
}

function extractTextContent(value: unknown): string {
  if (value === null || value === undefined) return "-";

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.text,
      record.body,
      record.content,
      record.value,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }

    return "-";
  }

  return String(value);
}

function getErrorMessage(error: unknown, fallback = "Failed to load document") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as { error?: { message?: string }; message?: string };
  return e?.error?.message || e?.message || fallback;
}

type DocumentBundleResponse = {
  document?: Document;
  latest_version?: DocVersion | null;
  versions?: DocVersion[];
  events?: DocEvent[];
};

function normalizeBundle(res: any): DocumentBundle | null {
  const raw = res?.data?.data ?? res?.data ?? null;
  if (!raw?.document) return null;

  return {
    document: raw.document,
    latest_version: raw.latest_version ?? null,
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

export default function DocumentDetailClient(props: { documentId: number }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [bundle, setBundle] = useState<DocumentBundle | null>(null);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function loadMe() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me = res?.data ?? null;

        if (!active) return;
        setRoles(Array.isArray(me?.roles) ? me.roles : []);
      } catch {
        if (!active) return;
        setRoles([]);
      }
    }

    void loadMe();

    return () => {
      active = false;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await apiGet<DocumentBundleResponse>(`/api/v1/documents/${props.documentId}`);
      const data = normalizeBundle(res);

      if (!data) {
        throw new Error("Document not found");
      }

      setBundle(data);
    } catch (error) {
      setErr(getErrorMessage(error));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [props.documentId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loading) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-white bg-white/80 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Loading document...
          </div>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="mb-4">
            <Link
              href="/documents"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>

          <div className="rounded-3xl border border-red-100 bg-white/80 p-4 text-sm text-red-700 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            {err}
          </div>
        </div>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="mb-4">
            <Link
              href="/documents"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>

          <div className="rounded-3xl border border-white bg-white/80 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Document not found.
          </div>
        </div>
      </main>
    );
  }

  const doc = bundle.document;
  const latest = bundle.latest_version;
  const versions = bundle.versions;
  const events = bundle.events;
  const status = String(doc.status_code ?? "").toUpperCase();
  const canManageDocs = canManageDocuments(roles);
  const canFinalizeDocs = canFinalizeDocuments(roles);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Documents
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
              {doc.title}
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {doc.doc_type_code} - Document #{doc.id}
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/documents"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className={statusPill(doc.status_code)}>{doc.status_code}</span>
                <div className="mt-3 text-slate-600">
                  Current version: <b>v{Number(doc.current_version ?? 1)}</b>
                </div>
                <div className="mt-1 text-slate-600">
                  Updated: {fmtDateTime(doc.updated_at)}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Latest content</div>
              <div className="mt-2 rounded-2xl bg-white p-4 text-sm leading-7 text-slate-800 shadow-sm whitespace-pre-wrap">
                {extractTextContent(latest?.content_json)}
              </div>
            </div>

            <div className="mt-6">
              <AddVersionPanel
                documentId={Number(doc.id)}
                status={status}
                canAddVersion={canManageDocs}
                onChanged={loadDetail}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <DocumentActionsPanel
              documentId={Number(doc.id)}
              status={status}
              canManageWorkflow={canManageDocs}
              canFinalizeWorkflow={canFinalizeDocs}
              onChanged={loadDetail}
            />
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-4">
            <div className="text-base font-semibold text-slate-900">Related Evidence</div>
            <div className="text-sm text-slate-500">Upload dan attach evidence untuk document ini.</div>
          </div>
          <DocumentEvidencePanel documentId={Number(doc.id)} roles={roles} />
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="border-b border-slate-200 p-6">
            <div className="text-base font-semibold text-slate-900">Versions</div>
            <div className="text-sm text-slate-500">Append-only</div>
          </div>

          <div className="overflow-x-auto p-6">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Created at</th>
                  <th className="py-2 pr-4">Created by</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={String(v.id)} className="border-t border-slate-200">
                    <td className="py-2 pr-4">v{Number(v.version_no)}</td>
                    <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(v.created_at)}</td>
                    <td className="py-2 pr-4">{v.created_by_identity_id ?? "-"}</td>
                  </tr>
                ))}
                {versions.length === 0 && (
                  <tr className="border-t border-slate-200">
                    <td colSpan={3} className="py-6 text-slate-600">
                      No versions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white bg-white/85 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="border-b border-slate-200 p-6">
            <div className="text-base font-semibold text-slate-900">Document events</div>
            <div className="text-sm text-slate-500">Append-only timeline</div>
          </div>

          <div className="p-6">
            {events.length === 0 ? (
              <div className="text-sm text-slate-600">No events.</div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div key={String(e.id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-900">{e.event_type}</div>
                      <div className="text-slate-500">{fmtDateTime(e.created_at)}</div>
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

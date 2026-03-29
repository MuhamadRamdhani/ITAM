"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import DocumentActionsPanel from "./DocumentActionsPanel";
import AddVersionPanel from "./AddVersionPanel";

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
  content_json?: any;
  created_by_identity_id?: number | null;
  created_at: string;
};

type DocEvent = {
  id: number | string;
  event_type: string;
  actor_identity_id?: number | null;
  note?: string | null;
  event_payload?: any;
  created_at: string;
};

type DocumentBundle = {
  document: Document;
  latest_version: DocVersion | null;
  versions: DocVersion[];
  events: DocEvent[];
};

function fmtDateTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = (status ?? "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "IN_REVIEW") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "PUBLISHED") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (s === "ARCHIVED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function prettyJson(v: any) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v);
  }
}

function getErrorMessage(error: unknown, fallback = "Failed to load document") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

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

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await apiGet<any>(`/api/v1/documents/${props.documentId}`);
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
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Loading document...
          </div>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/documents"
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

  if (!bundle) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-4">
            <Link
              href="/documents"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
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

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{doc.title}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {doc.doc_type_code} — Document #{doc.id}
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/documents"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className={statusPill(doc.status_code)}>{doc.status_code}</span>
                <div className="mt-2 text-gray-600">
                  Current version: <b>v{Number(doc.current_version ?? 1)}</b>
                </div>
                <div className="mt-1 text-gray-600">
                  Updated: {fmtDateTime(doc.updated_at)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-md border bg-gray-50 p-3">
              <div className="text-sm font-semibold text-gray-900">Latest content</div>
              <div className="mt-2">
                <pre className="max-h-[420px] overflow-auto rounded-md bg-white p-3 text-xs">
                  {prettyJson(latest?.content_json)}
                </pre>
              </div>
            </div>

            <div className="mt-4">
              <AddVersionPanel
                documentId={Number(doc.id)}
                status={status}
                onChanged={loadDetail}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <DocumentActionsPanel
              documentId={Number(doc.id)}
              status={status}
              onChanged={loadDetail}
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="text-base font-semibold">Versions</div>
            <div className="text-sm text-gray-500">Append-only</div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Created at</th>
                  <th className="py-2 pr-4">Created by</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={String(v.id)} className="border-t">
                    <td className="py-2 pr-4">v{Number(v.version_no)}</td>
                    <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(v.created_at)}</td>
                    <td className="py-2 pr-4">{v.created_by_identity_id ?? "-"}</td>
                  </tr>
                ))}
                {versions.length === 0 && (
                  <tr className="border-t">
                    <td colSpan={3} className="py-6 text-gray-600">
                      No versions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b p-4">
            <div className="text-base font-semibold">Document events</div>
            <div className="text-sm text-gray-500">Append-only timeline</div>
          </div>

          <div className="p-4">
            {events.length === 0 ? (
              <div className="text-sm text-gray-600">No events.</div>
            ) : (
              <div className="space-y-3">
                {events.map((e) => (
                  <div key={String(e.id)} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{e.event_type}</div>
                      <div className="text-gray-500">{fmtDateTime(e.created_at)}</div>
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
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";

const TYPES = ["POLICY", "SOP", "EVIDENCE", "CONTRACT", "OTHER"] as const;

function getErrorMessage(error: unknown, fallback = "Failed to create document") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

export default function NewDocumentForm() {
  const router = useRouter();

  const [docType, setDocType] = useState<(typeof TYPES)[number]>("POLICY");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("Hello. This is a draft.");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setErr(null);

    try {
      if (!title.trim()) throw new Error("Title wajib diisi.");

      const body = {
        doc_type_code: docType,
        title: title.trim(),
        content_json: { text: text.trim() },
      };

      const res = await apiPostJson<any>("/api/v1/documents", body);

      const payload = res?.data;
      const docId =
        payload?.document?.id ??
        payload?.data?.document?.id ??
        payload?.id ??
        null;

      if (!docId) {
        router.push("/documents");
        return;
      }

      router.push(`/documents/${docId}`);
    } catch (error) {
      setErr(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="text-sm font-medium text-slate-700">Type</div>
          <select
            className={inputClass}
            value={docType}
            onChange={(e) => setDocType(e.target.value as any)}
            disabled={loading}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <div className="text-sm font-medium text-slate-700">Title</div>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. ITAM Policy v1"
            disabled={loading}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Content</div>

        <textarea
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
          placeholder="Tulis isi dokumen di sini..."
        />

        <div className="mt-2 text-xs text-slate-500">
          MVP1.4: editor text disimpan ke version.
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="itam-primary-action"
        >
          {loading ? "Saving..." : "Create Document"}
        </button>
      </div>
    </div>
  );
}

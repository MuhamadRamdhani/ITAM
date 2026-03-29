"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";

const TYPES = ["POLICY", "SOP", "EVIDENCE", "CONTRACT", "OTHER"] as const;

function safeJsonParse(s: string) {
  try {
    const parsed = JSON.parse(s);
    return { ok: true as const, value: parsed };
  } catch (e: any) {
    return { ok: false as const, message: e?.message ?? "Invalid JSON" };
  }
}

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
  const [mode, setMode] = useState<"TEXT" | "JSON">("TEXT");
  const [text, setText] = useState("Hello. This is a draft.");
  const [jsonStr, setJsonStr] = useState(
    JSON.stringify({ text: "Hello. This is a draft." }, null, 2)
  );

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const contentJson = useMemo(() => {
    if (mode === "TEXT") return { text };
    const parsed = safeJsonParse(jsonStr);
    return parsed.ok ? parsed.value : null;
  }, [mode, text, jsonStr]);

  async function submit() {
    setLoading(true);
    setErr(null);

    try {
      if (!title.trim()) throw new Error("Title wajib diisi.");

      if (mode === "JSON") {
        const parsed = safeJsonParse(jsonStr);
        if (!parsed.ok) throw new Error(`Invalid JSON: ${parsed.message}`);
      }

      const body = {
        doc_type_code: docType,
        title: title.trim(),
        content_json: contentJson ?? {},
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="text-sm font-medium text-gray-700">Type</div>
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
          <div className="text-sm font-medium text-gray-700">Title</div>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. ITAM Policy v1"
            disabled={loading}
          />
        </div>
      </div>

      <div className="rounded-md border bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-900">Content</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-md border px-3 py-1 text-sm ${
                mode === "TEXT" ? "bg-gray-900 text-white" : "bg-white"
              }`}
              onClick={() => setMode("TEXT")}
              disabled={loading}
            >
              Text
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-1 text-sm ${
                mode === "JSON" ? "bg-gray-900 text-white" : "bg-white"
              }`}
              onClick={() => setMode("JSON")}
              disabled={loading}
            >
              JSON
            </button>
          </div>
        </div>

        {mode === "TEXT" ? (
          <textarea
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
          />
        ) : (
          <textarea
            className="mt-2 w-full rounded-md border px-3 py-2 font-mono text-xs"
            rows={10}
            value={jsonStr}
            onChange={(e) => setJsonStr(e.target.value)}
            disabled={loading}
          />
        )}

        <div className="mt-2 text-xs text-gray-500">
          MVP1.4: konten disimpan sebagai <span className="font-mono">content_json</span> di version.
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Create Document"}
        </button>
      </div>
    </div>
  );
}
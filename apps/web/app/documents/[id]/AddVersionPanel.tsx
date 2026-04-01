"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";

function getErrorMessage(error: unknown, fallback = "Failed to add version") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

export default function AddVersionPanel(props: {
  documentId: number;
  status: string;
  onChanged?: () => Promise<void> | void;
}) {
  const router = useRouter();

  const status = useMemo(
    () => String(props.status ?? "").toUpperCase(),
    [props.status]
  );

  const canAdd = status === "DRAFT" || status === "IN_REVIEW";

  const [note, setNote] = useState("");
  const [text, setText] = useState("Update...");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addVersion() {
    setLoading(true);
    setErr(null);

    try {
      if (!canAdd) {
        throw new Error(`Tidak bisa tambah version saat status = ${status}`);
      }

      await apiPostJson(`/api/v1/documents/${props.documentId}/versions`, {
        content_json: { text: text ?? "" },
        note: note.trim() ? note.trim() : undefined,
      });

      setNote("");
      setText("Update...");

      if (props.onChanged) {
        await props.onChanged();
      } else {
        router.refresh();
      }
    } catch (error) {
      setErr(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Add version</div>
          <div className="mt-1 text-xs text-gray-600">
            Allowed only when <b>DRAFT</b> / <b>IN_REVIEW</b>.
          </div>
        </div>

        <button
          className="itam-primary-action-sm disabled:opacity-50"
          disabled={!canAdd || loading}
          onClick={addVersion}
        >
          {loading ? "Saving..." : "Add Version"}
        </button>
      </div>

      {!canAdd && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Status sekarang <b>{status}</b>. Tidak bisa tambah version.
        </div>
      )}

      <div className="mt-3 space-y-2">
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canAdd || loading}
        />

        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
          rows={6}
          placeholder="Ketik bebas di sini..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canAdd || loading}
        />

        <div className="text-xs text-gray-500">
          Mode text akan disimpan otomatis sebagai konten version.
        </div>

        {err && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}

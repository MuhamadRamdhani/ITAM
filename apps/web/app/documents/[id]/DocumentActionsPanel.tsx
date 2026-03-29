"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPostJson } from "../../lib/api";

function getErrorMessage(error: unknown, fallback = "Failed to run document action") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

export default function DocumentActionsPanel(props: {
  documentId: number;
  status: string;
  onChanged?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = useMemo(() => String(props.status ?? "").toUpperCase(), [props.status]);

  const canSubmit = status === "DRAFT";
  const canApprove = status === "IN_REVIEW";
  const canPublish = status === "APPROVED";
  const canArchive = status !== "ARCHIVED";

  async function call(action: "submit" | "approve" | "publish" | "archive") {
    setLoading(true);
    setErr(null);

    try {
      await apiPostJson(`/api/v1/documents/${props.documentId}/${action}`, {
        note: note.trim() ? note.trim() : undefined,
      });

      setNote("");

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
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-900">Workflow actions</div>
      <div className="text-xs text-gray-600">
        Status sekarang: <b>{status}</b>
      </div>

      <textarea
        className="w-full rounded-md border px-3 py-2 text-sm"
        rows={3}
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={loading}
      />

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={!canSubmit || loading}
          onClick={() => call("submit")}
        >
          Submit for review
        </button>

        <button
          className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={!canApprove || loading}
          onClick={() => call("approve")}
        >
          Approve
        </button>

        <button
          className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={!canPublish || loading}
          onClick={() => call("publish")}
        >
          Publish
        </button>

        <button
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          disabled={!canArchive || loading}
          onClick={() => call("archive")}
        >
          Archive
        </button>
      </div>

      <div className="text-xs text-gray-500">
        Rule: add version hanya boleh saat <b>DRAFT</b> atau <b>IN_REVIEW</b>.
      </div>
    </div>
  );
}
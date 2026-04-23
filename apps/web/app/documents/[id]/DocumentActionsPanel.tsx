"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPostJson } from "../../lib/api";

function getErrorMessage(error: unknown, fallback = "Failed to run document action") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;

  const e = error as { error?: { message?: string }; message?: string };
  return e?.error?.message || e?.message || fallback;
}

export default function DocumentActionsPanel(props: {
  documentId: number;
  status: string;
  canManageWorkflow: boolean;
  canFinalizeWorkflow: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const status = useMemo(() => String(props.status ?? "").toUpperCase(), [props.status]);

  const canSubmit = status === "DRAFT" && props.canManageWorkflow;
  const canDeleteDraft = status === "DRAFT" && props.canManageWorkflow;
  const canApprove = status === "IN_REVIEW" && props.canFinalizeWorkflow;
  const canPublish = status === "APPROVED" && props.canFinalizeWorkflow;
  const canArchive = status !== "ARCHIVED" && props.canFinalizeWorkflow;
  const hasAnyAction = props.canManageWorkflow || props.canFinalizeWorkflow;

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

  async function deleteDraft() {
    setLoading(true);
    setErr(null);

    try {
      await apiDelete(`/api/v1/documents/${props.documentId}`);
      setShowDeleteConfirm(false);
      window.location.assign("/documents");
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

      {!hasAnyAction && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Read only. Workflow actions hanya tersedia untuk TENANT_ADMIN / ITAM_MANAGER.
        </div>
      )}

      {hasAnyAction ? (
        <>
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

            {props.canFinalizeWorkflow ? (
              <>
                <button
                  className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={!canApprove || loading}
                  onClick={() => call("approve")}
                >
                  Approve
                </button>

                <button
                  className="itam-primary-action-sm"
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
              </>
            ) : null}

            <button
              type="button"
              className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              disabled={!canDeleteDraft || loading}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Draft
            </button>
          </div>

          {err && !hasAnyAction && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}
        </>
      ) : null}

      <div className="text-xs text-gray-500">
        Rule: submit hanya untuk <b>TENANT_ADMIN</b> / <b>ITAM_MANAGER</b>. Approve/publish/archive hanya untuk <b>TENANT_ADMIN</b>.
      </div>

      {showDeleteConfirm && canDeleteDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white shadow-2xl">
            <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
              <div className="text-lg font-semibold text-rose-900">Delete Draft</div>
              <div className="mt-1 text-sm text-rose-800">
                Document draft ini akan dihapus permanen.
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                Aksi ini hanya tersedia untuk document dengan status DRAFT.
              </div>

              {err && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {err}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void deleteDraft()}
                >
                  {loading ? "Deleting..." : "Delete Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

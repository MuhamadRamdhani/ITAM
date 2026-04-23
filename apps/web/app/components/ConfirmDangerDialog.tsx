"use client";

type ConfirmDangerDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmDangerDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDangerDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="border-b border-rose-100 bg-rose-50 px-6 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
            Confirm Delete
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

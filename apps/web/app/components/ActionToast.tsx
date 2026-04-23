"use client";

type ActionToastProps = {
  open: boolean;
  type: "success" | "error";
  message: string;
  onClose: () => void;
};

export default function ActionToast({ open, type, message, onClose }: ActionToastProps) {
  if (!open) return null;

  const isError = type === "error";

  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-sm">
      <div
        className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${
          isError ? "border border-rose-200 bg-rose-50" : "border border-emerald-200 bg-emerald-50"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${isError ? "text-rose-800" : "text-emerald-800"}`}>
            {isError ? "Error" : "Success"}
          </div>
          <div className={`mt-1 text-sm leading-6 ${isError ? "text-rose-700" : "text-emerald-700"}`}>
            {message}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
            isError
              ? "text-rose-700 hover:bg-rose-100"
              : "text-emerald-700 hover:bg-emerald-100"
          }`}
          aria-label="Close toast"
        >
          Close
        </button>
      </div>
    </div>
  );
}

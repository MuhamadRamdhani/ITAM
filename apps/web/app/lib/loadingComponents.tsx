"use client";

/**
 * Minimal loading components untuk display loading states
 * Tidak ada hardcode data, hanya skeleton/spinner visuals
 */

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-200 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-3">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTableBody({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </tbody>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        <div className="h-4 bg-gray-200 rounded w-4/6"></div>
      </div>
    </div>
  );
}

export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
      <span className="text-sm text-gray-600">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "No data",
  description = "No items to display",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="text-center py-12">
      <p className="text-lg font-medium text-gray-900">{title}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
      <p className="font-medium">Error</p>
      <p className="text-sm">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded transition"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

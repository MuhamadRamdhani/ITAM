import Link from "next/link";
import NewDocumentForm from "./NewDocumentForm";

export default function NewDocumentPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">New Document</h1>
            <p className="mt-1 text-sm text-gray-600">
              Buat dokumen + Version 1 (append-only).
            </p>
          </div>

          <Link
            href="/documents"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <NewDocumentForm />
        </div>
      </div>
    </main>
  );
}
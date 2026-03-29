import Link from "next/link";
import UploadEvidenceForm from "./uploadEvidenceForm";

export default function EvidenceUploadPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Upload Evidence</h1>
            <p className="mt-1 text-sm text-gray-600">Upload file to evidence library (MVP1.5).</p>
          </div>
          <Link
            href="/evidence"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <UploadEvidenceForm />
        </div>
      </div>
    </main>
  );
}
import Link from "next/link";
import AdminDepartmentsClient from "./AdminDepartmentsClient";

export default function AdminDepartmentsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Departments</h1>
            <p className="mt-1 text-sm text-gray-600">
              MVP0.3 — tenant department master data.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6">
          <AdminDepartmentsClient />
        </div>
      </div>
    </main>
  );
}
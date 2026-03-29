import { Suspense } from "react";
import Link from "next/link";
import AssetsClient from "./AssetsClient";

export default function AssetsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Assets</h1>
            <p className="mt-1 text-sm text-gray-600">
              MVP1.0 — asset registry core.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>

            <Link
              href="/assets/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New Asset
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <Suspense>
            <AssetsClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

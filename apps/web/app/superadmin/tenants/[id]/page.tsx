import Link from "next/link";
import SuperadminTenantDetailClient from "./SuperadminTenantDetailClient";

export default async function SuperadminTenantDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Tenant Detail
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              MVP0.2 — tenant summary + update.
            </p>
          </div>

          <Link
            href="/superadmin/tenants"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6">
          <SuperadminTenantDetailClient tenantId={params.id} />
        </div>
      </div>
    </main>
  );
}
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/api";
import OwnershipPanel from "./OwnershipPanel";
import LifecyclePanel from "./LifecyclePanel";
import ApprovalsPanel from "./ApprovalsPanel";
import SoftwareInstallationsPanel from "./SoftwareInstallationsPanel";
import AssetEvidenceTab from "./_componets/AssetEvidenceTab";

type AssetType = { code: string; label: string };
type StateType = { code: string; label: string };

type AssetDetailResponse = {
  asset: {
    id: number;
    asset_tag: string;
    name: string;
    status: string | null;
    asset_type: AssetType;
    state: StateType;
    owner_department_id: number | null;
    current_custodian_identity_id: number | null;
    location_id: number | null;

    purchase_date: string | null;
    warranty_start_date: string | null;
    warranty_end_date: string | null;
    support_start_date: string | null;
    support_end_date: string | null;
    subscription_start_date: string | null;
    subscription_end_date: string | null;
  };
};

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function fmtPeriod(start?: string | null, end?: string | null) {
  if (!start && !end) return "-";
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

export default function AssetDetailClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const assetId = params?.id;
  const tab = searchParams.get("tab")?.trim() || "overview";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetDetailResponse["asset"] | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAsset() {
      if (!assetId) return;

      try {
        setLoading(true);
        setError(null);

        const res = await apiGet<AssetDetailResponse>(`/api/v1/assets/${assetId}`);

        const a = (res as any)?.data?.asset ?? (res as any)?.data?.data?.asset;

        if (!mounted) return;
        setAsset(a);
      } catch (eAny: any) {
        if (!mounted) return;

        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(eAny?.message || "Failed to load asset");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void loadAsset();

    return () => {
      mounted = false;
    };
  }, [assetId, router]);

  const tabClass = (key: string) =>
    tab === key
      ? "border-b-2 border-blue-600 pb-3 text-blue-700"
      : "pb-3 hover:text-gray-900";

  if (!assetId) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Loading route...
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
            Loading asset...
          </div>
        </div>
      </main>
    );
  }

  if (error || !asset) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Error</div>
            <div className="mt-1 text-sm text-red-700">{error || "Asset not found"}</div>
            <div className="mt-4">
              <Link
                href="/assets"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Assets
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const a = asset;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{a.asset_tag}</h1>

              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {a.asset_type.label} ({a.asset_type.code})
              </span>

              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                {a.state.label} ({a.state.code})
              </span>
            </div>

            <p className="mt-1 text-sm text-gray-600">{a.name}</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/assets"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </Link>

            <Link
              href={`/assets/${a.id}/edit`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
            <p className="mt-2 text-sm text-gray-900">{a.status ?? "-"}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">Owner Department</p>
            <p className="mt-2 text-sm text-gray-900">{a.owner_department_id ?? "-"}</p>
            <p className="mt-1 text-xs text-gray-500">(placeholder: resolve name later)</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">Custodian / Location</p>
            <p className="mt-2 text-sm text-gray-900">
              Custodian: {a.current_custodian_identity_id ?? "-"}
            </p>
            <p className="mt-1 text-sm text-gray-900">Location: {a.location_id ?? "-"}</p>
            <p className="mt-1 text-xs text-gray-500">(placeholder: resolve names later)</p>
          </div>
        </div>

        <div className="mt-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex flex-wrap gap-6 text-sm font-medium text-gray-600">
              <Link href={`/assets/${a.id}?tab=overview`} className={tabClass("overview")}>
                Overview
              </Link>

              <Link href={`/assets/${a.id}?tab=lifecycle`} className={tabClass("lifecycle")}>
                Lifecycle
              </Link>

              <Link href={`/assets/${a.id}?tab=ownership`} className={tabClass("ownership")}>
                Ownership
              </Link>

              <Link href={`/assets/${a.id}?tab=software`} className={tabClass("software")}>
                Software
              </Link>

              <Link href={`/assets/${a.id}?tab=evidence`} className={tabClass("evidence")}>
                Evidence
              </Link>

              <Link href={`/assets/${a.id}?tab=approvals`} className={tabClass("approvals")}>
                Approvals
              </Link>
            </nav>
          </div>

          {tab === "ownership" ? (
            <OwnershipPanel
              assetId={a.id}
              currentOwnerDepartmentId={a.owner_department_id}
              currentCustodianIdentityId={a.current_custodian_identity_id}
              currentLocationId={a.location_id}
            />
          ) : tab === "lifecycle" ? (
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
              <LifecyclePanel
                assetId={a.id}
                initialCurrentState={{
                  code: a.state?.code,
                  name: a.state?.label,
                }}
              />
            </div>
          ) : tab === "software" ? (
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
              <SoftwareInstallationsPanel assetId={a.id} />
            </div>
          ) : tab === "approvals" ? (
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
              <ApprovalsPanel assetId={a.id} />
            </div>
          ) : tab === "evidence" ? (
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
              <AssetEvidenceTab assetId={a.id} />
            </div>
          ) : (
            <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Purchase Date</p>
                  <p className="mt-2 text-sm text-gray-900">{fmtDate(a.purchase_date)}</p>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Warranty Period</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {fmtPeriod(a.warranty_start_date, a.warranty_end_date)}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Support Period</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {fmtPeriod(a.support_start_date, a.support_end_date)}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Subscription Period</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {fmtPeriod(a.subscription_start_date, a.subscription_end_date)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
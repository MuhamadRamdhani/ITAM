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
  return `${fmtDate(start)} -> ${fmtDate(end)}`;
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
      ? "border-b-2 border-cyan-500 pb-3 text-cyan-700"
      : "pb-3 text-slate-600 hover:text-slate-900";

  const shell = "relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900";
  const surface = "rounded-3xl border border-white bg-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl";

  if (!assetId) {
    return (
      <main className={shell}>
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-white bg-white/80 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Loading route...
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={shell}>
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-white bg-white/80 p-4 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Loading asset...
          </div>
        </div>
      </main>
    );
  }

  if (error || !asset) {
    return (
      <main className={shell}>
        <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
          <div className="rounded-3xl border border-red-100 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="text-lg font-semibold text-slate-900">Error</div>
            <div className="mt-1 text-sm text-red-700">{error || "Asset not found"}</div>
            <div className="mt-4">
              <Link
                href="/assets"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
    <main className={shell}>
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
        <div className={`${surface} flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between`}>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{a.asset_tag}</h1>

              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                {a.asset_type.label} ({a.asset_type.code})
              </span>

              <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-200">
                {a.state.label} ({a.state.code})
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-600">{a.name}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/assets"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back
            </Link>

            <Link
              href={`/asset-transfer-requests/new?asset_id=${a.id}`}
              className="inline-flex items-center justify-center itam-primary-action"
            >
              Transfer Asset
            </Link>

            <Link
              href={`/assets/${a.id}/edit`}
              className="inline-flex items-center justify-center itam-primary-action"
            >
              Edit
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={surface + " p-6"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{a.status ?? "-"}</p>
          </div>

          <div className={surface + " p-6"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Owner Department</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{a.owner_department_id ?? "-"}</p>
            <p className="mt-1 text-xs text-slate-500">(placeholder: resolve name later)</p>
          </div>

          <div className={surface + " p-6"}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Custodian / Location</p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              Custodian: {a.current_custodian_identity_id ?? "-"}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">Location: {a.location_id ?? "-"}</p>
            <p className="mt-1 text-xs text-slate-500">(placeholder: resolve names later)</p>
          </div>
        </div>

        <div className="mt-8">
          <div className="border-b border-slate-200">
            <nav className="-mb-px flex flex-wrap gap-6 text-sm font-medium">
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
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <OwnershipPanel
                assetId={a.id}
                currentOwnerDepartmentId={a.owner_department_id}
                currentCustodianIdentityId={a.current_custodian_identity_id}
                currentLocationId={a.location_id}
              />
            </div>
          ) : tab === "lifecycle" ? (
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <LifecyclePanel
                assetId={a.id}
                initialCurrentState={{
                  code: a.state?.code,
                  name: a.state?.label,
                }}
              />
            </div>
          ) : tab === "software" ? (
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <SoftwareInstallationsPanel assetId={a.id} />
            </div>
          ) : tab === "approvals" ? (
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <ApprovalsPanel assetId={a.id} />
            </div>
          ) : tab === "evidence" ? (
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <AssetEvidenceTab assetId={a.id} />
            </div>
          ) : (
            <div className="rounded-b-3xl border border-t-0 border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase Date</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{fmtDate(a.purchase_date)}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Warranty Period</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {fmtPeriod(a.warranty_start_date, a.warranty_end_date)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Support Period</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {fmtPeriod(a.support_start_date, a.support_end_date)}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subscription Period</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
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

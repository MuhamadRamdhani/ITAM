"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiDelete, apiGet } from "../../lib/api";
import {
  canCreateOrEditAsset,
  canManageAssetSoftware,
  canManageAssetOwnership,
  canTransitionAssetLifecycle,
} from "../../lib/assetAccess";
import { canCreateAssetTransfer } from "../../lib/assetTransferAccess";
import {
  parseActiveScopeJson,
  resolveLookupLabel,
  resolveScopedLookupLabel,
  lookupMatchesScope,
} from "../../lib/governanceScope";
import OwnershipPanel from "./OwnershipPanel";
import LifecyclePanel from "./LifecyclePanel";
import ApprovalsPanel from "./ApprovalsPanel";
import SoftwareInstallationsPanel from "./SoftwareInstallationsPanel";
import AssetEvidenceTab from "./_componets/AssetEvidenceTab";
import ConfirmDangerDialog from "@/app/components/ConfirmDangerDialog";
import ActionToast from "@/app/components/ActionToast";

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

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type ConfigListResponse = {
  items: LookupItem[];
};

type ScopeListResponse = {
  items: ActiveScopeVersionItem[];
};

type LookupItem = {
  id: number;
  name?: string;
  label?: string;
  display_name?: string;
  email?: string;
};

type ActiveScopeVersionItem = {
  version_no?: number | string | null;
  scope_json?: unknown;
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
  const rawReturnTo = searchParams.get("return_to")?.trim() || "";
  const safeReturnTo =
    rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const backHref = safeReturnTo || "/assets";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<AssetDetailResponse["asset"] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [deptOptions, setDeptOptions] = useState<LookupItem[]>([]);
  const [locOptions, setLocOptions] = useState<LookupItem[]>([]);
  const [idenOptions, setIdenOptions] = useState<LookupItem[]>([]);
  const [activeScopeDepartmentTokens, setActiveScopeDepartmentTokens] = useState<string[]>([]);
  const [activeScopeLocationTokens, setActiveScopeLocationTokens] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const canCreateAsset = useMemo(() => canCreateOrEditAsset(roles), [roles]);
  const canTransferAsset = useMemo(() => canCreateAssetTransfer(roles), [roles]);
  const canEditSoftware = useMemo(() => canManageAssetSoftware(roles), [roles]);
  const canEditOwnership = useMemo(() => canManageAssetOwnership(roles), [roles]);
  const canTransitionLifecycle = useMemo(
    () => canTransitionAssetLifecycle(roles),
    [roles]
  );

  useEffect(() => {
    let mounted = true;

    async function loadMe() {
      try {
        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me = res.data;

        if (!mounted) return;
        setRoles(Array.isArray(me?.roles) ? me.roles : []);
      } catch (eAny: unknown) {
        const e = eAny as { code?: string; http_status?: number };
        if (
          e?.code === "AUTH_REQUIRED" ||
          e?.code === "AUTH_UNAUTHORIZED" ||
          e?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }
        if (!mounted) return;
        setRoles([]);
      }
    }

    void loadMe();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function loadAsset() {
      if (!assetId) return;

      try {
        setLoading(true);
        setError(null);

        const res = await apiGet<AssetDetailResponse>(`/api/v1/assets/${assetId}`);
        const a = res.data?.asset ?? null;

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

  useEffect(() => {
    let mounted = true;

    async function loadReferences() {
      try {
        const [deptRes, locRes, idenRes, scopeRes] = await Promise.all([
          apiGet<ConfigListResponse>("/api/v1/departments?page=1&page_size=100"),
          apiGet<ConfigListResponse>("/api/v1/locations?page=1&page_size=100"),
          apiGet<ConfigListResponse>("/api/v1/identities?page=1&page_size=100"),
          apiGet<ScopeListResponse>("/api/v1/governance/scope/versions?status=ACTIVE&page=1&page_size=1"),
        ]);

        if (!mounted) return;

        const deptItems = deptRes.data?.items ?? [];
        const locItems = locRes.data?.items ?? [];
        const idenItems = idenRes.data?.items ?? [];
        const scopeItems = scopeRes.data?.items ?? [];

        setDeptOptions(Array.isArray(deptItems) ? deptItems : []);
        setLocOptions(Array.isArray(locItems) ? locItems : []);
        setIdenOptions(Array.isArray(idenItems) ? idenItems : []);

        const activeScope = Array.isArray(scopeItems) ? scopeItems[0] ?? null : null;
        const parsedScope = parseActiveScopeJson(
          activeScope?.scope_json,
          activeScope?.version_no ?? null
        );
        setActiveScopeDepartmentTokens(parsedScope.departmentTokens);
        setActiveScopeLocationTokens(parsedScope.locationTokens);
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

        setDeptOptions([]);
        setLocOptions([]);
        setIdenOptions([]);
        setActiveScopeDepartmentTokens([]);
        setActiveScopeLocationTokens([]);
      }
    }

    void loadReferences();

    return () => {
      mounted = false;
    };
  }, [router]);

  const ownerDepartmentLabel = useMemo(() => {
    if (!asset?.owner_department_id) return null;
    if (
      activeScopeDepartmentTokens.length > 0 &&
      !lookupMatchesScope(
        deptOptions.find((item) => Number(item.id) === Number(asset.owner_department_id)) ??
          { id: Number(asset.owner_department_id) },
        activeScopeDepartmentTokens
      )
    ) {
      return null;
    }
    return resolveScopedLookupLabel(
      deptOptions,
      asset.owner_department_id,
      activeScopeDepartmentTokens
    );
  }, [asset?.owner_department_id, activeScopeDepartmentTokens, deptOptions]);

  const custodianLabel = useMemo(() => {
    if (!asset?.current_custodian_identity_id) return null;
    return resolveLookupLabel(idenOptions, asset.current_custodian_identity_id);
  }, [asset?.current_custodian_identity_id, idenOptions]);

  const locationLabel = useMemo(() => {
    if (!asset?.location_id) return null;
    if (activeScopeLocationTokens.length > 0) {
      const item = locOptions.find((row) => Number(row.id) === Number(asset.location_id));
      if (item && !lookupMatchesScope(item, activeScopeLocationTokens)) {
        return null;
      }
    }
    return resolveScopedLookupLabel(locOptions, asset.location_id, activeScopeLocationTokens);
  }, [asset?.location_id, activeScopeLocationTokens, locOptions]);

  const shell =
    "relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900";

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
                href={backHref}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const a = asset;

  function buildDetailHref(nextTab?: string) {
    const qs = new URLSearchParams();

    if (nextTab && nextTab !== "overview") {
      qs.set("tab", nextTab);
    }

    if (safeReturnTo) {
      qs.set("return_to", safeReturnTo);
    }

    const out = qs.toString();
    return out ? `/assets/${a.id}?${out}` : `/assets/${a.id}`;
  }

  const currentDetailHref = buildDetailHref(tab);
  const transferFromDetailHref = `/asset-transfer-requests/new?asset_id=${a.id}&return_to=${encodeURIComponent(
    currentDetailHref
  )}`;

  const tabClass = (key: string) =>
    tab === key
      ? "border-b-2 border-cyan-500 pb-3 text-cyan-700"
      : "pb-3 text-slate-600 hover:text-slate-900";

  async function confirmDeleteAsset() {
    if (!a || deleteLoading) return;

    setDeleteLoading(true);

    try {
      await apiDelete(`/api/v1/assets/${a.id}`);
      setDeleteOpen(false);
      setToast({
        type: "success",
        message: `Asset ${a.asset_tag} deleted.`,
      });

      window.setTimeout(() => {
        router.push("/assets");
      }, 700);
    } catch (error) {
      const code = (error as any)?.code;
      if (code === "ASSET_IN_USE") {
        setToast({
          type: "error",
          message: "Asset masih dipakai oleh history, contract, installation, transfer, atau allocation.",
        });
      } else {
        setToast({
          type: "error",
          message: (error as any)?.message || "Gagal menghapus asset.",
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <main className={shell}>
      <ActionToast
        open={Boolean(toast)}
        type={toast?.type || "success"}
        message={toast?.message || ""}
        onClose={() => setToast(null)}
      />
      <ConfirmDangerDialog
        open={deleteOpen}
        title="Delete asset"
        description={`Asset ${a.asset_tag} akan dihapus permanen jika tidak sedang dipakai oleh history, contract, installation, transfer request, atau allocation.`}
        confirmLabel="Delete Asset"
        loading={deleteLoading}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDeleteAsset()}
      />
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex-row md:items-end md:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
              Asset Registry
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {a.asset_tag}
            </h1>

            <p className="mt-3 text-sm leading-7 text-slate-600 md:text-base">
              {a.name}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                {a.asset_type.label} ({a.asset_type.code})
              </span>

              <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-200">
                {a.state.label} ({a.state.code})
              </span>
            </div>
          </div>

          <Link
            href={backHref}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-white bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-4 flex flex-wrap justify-end gap-3">
            {canTransferAsset ? (
              <Link
                href={transferFromDetailHref}
                className="itam-primary-action"
              >
                Transfer Asset
              </Link>
            ) : null}

            {canCreateAsset ? (
              <Link
                href={`/assets/${a.id}/edit`}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Edit
              </Link>
            ) : null}

            {canCreateAsset ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deleteLoading}
              >
                Delete
              </button>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Status
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {a.status ?? "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Owner Department
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {ownerDepartmentLabel ?? "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  (limited by active governance scope)
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Custodian / Location
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  Custodian: {custodianLabel ?? "-"}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  Location: {locationLabel ?? "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  (location is limited by active governance scope)
                </p>
              </div>
            </div>

            <div className="mt-8 border-b border-slate-200">
              <nav className="-mb-px flex flex-wrap gap-6 text-sm font-medium">
                <Link href={buildDetailHref("overview")} className={tabClass("overview")}>
                  Overview
                </Link>

                <Link href={buildDetailHref("lifecycle")} className={tabClass("lifecycle")}>
                  Lifecycle
                </Link>

                <Link href={buildDetailHref("ownership")} className={tabClass("ownership")}>
                  Ownership
                </Link>

                <Link href={buildDetailHref("software")} className={tabClass("software")}>
                  Software
                </Link>

                <Link href={buildDetailHref("evidence")} className={tabClass("evidence")}>
                  Evidence
                </Link>

                <Link href={buildDetailHref("approvals")} className={tabClass("approvals")}>
                  Approvals
                </Link>
              </nav>
            </div>

            <div className="mt-6">
              {tab === "ownership" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <OwnershipPanel
                    assetId={a.id}
                    currentOwnerDepartmentId={a.owner_department_id}
                    currentCustodianIdentityId={a.current_custodian_identity_id}
                    currentLocationId={a.location_id}
                    canEdit={canEditOwnership}
                  />
                </div>
              ) : tab === "lifecycle" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <LifecyclePanel
                    assetId={a.id}
                    initialCurrentState={{
                      code: a.state?.code,
                      name: a.state?.label,
                    }}
                    canTransition={canTransitionLifecycle}
                  />
                </div>
              ) : tab === "software" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <SoftwareInstallationsPanel assetId={a.id} canEdit={canEditSoftware} />
                </div>
              ) : tab === "approvals" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <ApprovalsPanel assetId={a.id} />
                </div>
              ) : tab === "evidence" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <AssetEvidenceTab assetId={a.id} canEdit={canEditOwnership} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Purchase Date
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {fmtDate(a.purchase_date)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Warranty Period
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {fmtPeriod(a.warranty_start_date, a.warranty_end_date)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Support Period
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {fmtPeriod(a.support_start_date, a.support_end_date)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Subscription Period
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {fmtPeriod(a.subscription_start_date, a.subscription_end_date)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

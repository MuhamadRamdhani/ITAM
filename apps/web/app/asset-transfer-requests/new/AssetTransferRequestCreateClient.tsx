"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPostJson } from "@/app/lib/api";
import { canCreateAssetTransfer } from "@/app/lib/assetTransferAccess";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type AssetOption = {
  id: number;
  asset_tag: string | null;
  asset_name: string | null;
  status: string | null;
};

type TenantOption = {
  id: number;
  tenant_name: string;
  status: string | null;
};

type PreviewResult = {
  asset_id: number | null;
  asset_tag: string | null;
  asset_name: string | null;
  asset_status: string | null;
  source_tenant_id: number | null;
  target_tenant_id: number | null;
  target_tenant_name: string | null;
  target_tenant_status: string | null;
  can_transfer: boolean;
  blocked_reasons: string[];
  warnings: string[];
  remap_requirements: string[];
  relation_counts: Record<string, unknown>;
  active_request_id: number | null;
};

const FIELD_LABELS: Record<string, string> = {
  owner_department_id: "Owner Department",
  current_custodian_identity_id: "Current Custodian",
  location_id: "Location",
  contract_asset_links: "Contract Asset Links",
};

const MESSAGE_LABELS: Record<string, string> = {
  OWNER_DEPARTMENT_WILL_BE_RESET: "Owner department will be reset",
  CUSTODIAN_IDENTITY_WILL_BE_RESET: "Current custodian will be reset",
  LOCATION_WILL_BE_RESET: "Location will be reset",
  CONTRACT_ASSET_LINKS_WILL_BE_REMOVED: "Contract asset links will be removed",
  SAME_TENANT_NOT_ALLOWED: "Target tenant must be different from source tenant",
  TARGET_TENANT_NOT_ACTIVE: "Target tenant must be active",
  TARGET_TENANT_NOT_FOUND: "Target tenant was not found",
  ASSET_NOT_FOUND: "Asset was not found",
  ACTIVE_REQUEST_ALREADY_EXISTS: "There is already another active transfer request",
  RESET_TO_NULL: "Will be reset",
};

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? humanizeKey(field);
}

function humanizeMessage(value: string): string {
  if (MESSAGE_LABELS[value]) {
    return MESSAGE_LABELS[value];
  }

  const isSystemCode = value.toUpperCase() === value && value.includes("_");

  if (!isSystemCode) {
    return value;
  }

  const sentence = value
    .split("_")
    .map((part) => part.toLowerCase())
    .join(" ");

  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => toNullableString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => humanizeMessage(item));
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function normalizeRemapRequirements(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return uniqueStrings(
      value.flatMap((item) => normalizeRemapRequirements(item)).filter(Boolean)
    );
  }

  if (typeof value === "string") {
    return [humanizeMessage(value)];
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    return uniqueStrings(
      entries.map(([field, action]) => {
        const actionText =
          typeof action === "string" ? action : String(action ?? "");

        if (actionText === "RESET_TO_NULL") {
          return `${getFieldLabel(field)} will be reset`;
        }

        return `${getFieldLabel(field)}: ${humanizeMessage(actionText)}`;
      })
    );
  }

  return [];
}

function renderSimpleValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Request failed.";
}

function normalizeAssetOption(raw: any): AssetOption {
  return {
    id: Number(raw?.id),
    asset_tag: toNullableString(raw?.asset_tag),
    asset_name: toNullableString(
      raw?.asset_name ??
        raw?.name ??
        raw?.display_name ??
        raw?.hostname ??
        raw?.serial_number
    ),
    status: toNullableString(raw?.status ?? raw?.asset_status),
  };
}

function normalizeAssetOptions(payload: any): AssetOption[] {
  const data = payload?.data ?? payload ?? {};
  const rawItems =
    data?.items ??
    data?.assets ??
    data?.rows ??
    payload?.items ??
    [];

  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map(normalizeAssetOption)
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function normalizeAssetDetail(payload: any): AssetOption | null {
  const data = payload?.data ?? payload ?? {};
  const raw = data?.item ?? data?.asset ?? data ?? null;

  if (!raw || typeof raw !== "object") return null;

  const item = normalizeAssetOption(raw);
  if (!Number.isFinite(item.id) || item.id <= 0) return null;

  return item;
}

function normalizeTenantOptions(payload: any): TenantOption[] {
  const data = payload?.data ?? payload ?? {};
  const rawItems =
    data?.items ??
    data?.tenants ??
    payload?.items ??
    [];

  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((raw) => ({
      id: Number(raw?.id),
      tenant_name: String(raw?.tenant_name ?? raw?.name ?? "").trim(),
      status: toNullableString(raw?.status),
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.tenant_name);
}

function normalizePreview(payload: any): PreviewResult {
  const data = payload?.data ?? payload ?? {};
  const raw = data?.preview ?? data;

  const asset = raw?.asset ?? {};
  const targetTenant = raw?.target_tenant ?? {};
  const relationCounts =
    (raw?.relation_counts && typeof raw?.relation_counts === "object"
      ? raw.relation_counts
      : {}) ?? {};

  return {
    asset_id: toNullableNumber(raw?.asset_id ?? asset?.id),
    asset_tag: toNullableString(raw?.asset_tag ?? asset?.asset_tag),
    asset_name: toNullableString(
      raw?.asset_name ??
        asset?.asset_name ??
        asset?.name ??
        asset?.display_name ??
        asset?.hostname
    ),
    asset_status: toNullableString(raw?.asset_status ?? asset?.status),
    source_tenant_id: toNullableNumber(raw?.source_tenant_id ?? asset?.tenant_id),
    target_tenant_id: toNullableNumber(raw?.target_tenant_id ?? targetTenant?.id),
    target_tenant_name: toNullableString(
      raw?.target_tenant_name ??
        targetTenant?.tenant_name ??
        targetTenant?.name
    ),
    target_tenant_status: toNullableString(
      raw?.target_tenant_status ?? targetTenant?.status
    ),
    can_transfer: Boolean(raw?.can_transfer),
    blocked_reasons: uniqueStrings(normalizeStringList(raw?.blocked_reasons)),
    warnings: uniqueStrings(normalizeStringList(raw?.warnings)),
    remap_requirements: uniqueStrings(
      normalizeRemapRequirements(raw?.remap_requirements)
    ),
    relation_counts: relationCounts,
    active_request_id: toNullableNumber(raw?.active_request?.id),
  };
}

function extractCreatedRequestId(payload: any): number | null {
  return (
    toNullableNumber(payload?.data?.id) ??
    toNullableNumber(payload?.data?.request?.id) ??
    toNullableNumber(payload?.data?.transfer_request?.id) ??
    toNullableNumber(payload?.id) ??
    null
  );
}

function buildAssetOptionLabel(asset: AssetOption): string {
  const left = asset.asset_tag ?? `Asset #${asset.id}`;
  const right = asset.asset_name ? ` — ${asset.asset_name}` : "";
  const status = asset.status ? ` [${asset.status}]` : "";
  return `${left}${right}${status}`;
}

function buildTenantOptionLabel(tenant: TenantOption): string {
  const status = tenant.status ? ` [${tenant.status}]` : "";
  return `${tenant.tenant_name}${status}`;
}

export default function AssetTransferRequestCreateClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawPresetAssetId = useMemo(() => {
    return searchParams.get("asset_id")?.trim() ?? "";
  }, [searchParams]);

  const presetAssetId = useMemo(() => {
    if (!rawPresetAssetId) return "";
    return /^\d+$/.test(rawPresetAssetId) ? rawPresetAssetId : "";
  }, [rawPresetAssetId]);

  const rawReturnTo = useMemo(() => {
    return searchParams.get("return_to")?.trim() ?? "";
  }, [searchParams]);

  const safeReturnTo = useMemo(() => {
    if (!rawReturnTo) return "";
    return rawReturnTo.startsWith("/") ? rawReturnTo : "";
  }, [rawReturnTo]);

  const backHref = useMemo(() => {
    if (safeReturnTo) return safeReturnTo;
    if (presetAssetId) return `/assets/${presetAssetId}`;
    return "/asset-transfer-requests";
  }, [safeReturnTo, presetAssetId]);

  const assetDetailHref = useMemo(() => {
    if (!presetAssetId) return "/assets";
    if (safeReturnTo.startsWith(`/assets/${presetAssetId}`)) {
      return safeReturnTo;
    }
    return `/assets/${presetAssetId}`;
  }, [presetAssetId, safeReturnTo]);

  const hasPresetAssetQuery = rawPresetAssetId.length > 0;

  const [meLoading, setMeLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);

  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedTargetTenantId, setSelectedTargetTenantId] = useState("");
  const [reason, setReason] = useState("");

  const [assetSearch, setAssetSearch] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");

  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [presetAssetOption, setPresetAssetOption] = useState<AssetOption | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);

  const [assetsLoading, setAssetsLoading] = useState(false);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [presetAssetLoading, setPresetAssetLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCreateTransfer = useMemo(() => {
    return canCreateAssetTransfer(roles);
  }, [roles]);

  const combinedAssetOptions = useMemo(() => {
    const map = new Map<number, AssetOption>();

    if (presetAssetOption) {
      map.set(presetAssetOption.id, presetAssetOption);
    }

    for (const item of assetOptions) {
      map.set(item.id, item);
    }

    return Array.from(map.values());
  }, [assetOptions, presetAssetOption]);

  const selectedAsset = useMemo(() => {
    const id = Number(selectedAssetId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return combinedAssetOptions.find((item) => item.id === id) ?? null;
  }, [combinedAssetOptions, selectedAssetId]);

  const selectedTenant = useMemo(() => {
    const id = Number(selectedTargetTenantId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return tenantOptions.find((item) => item.id === id) ?? null;
  }, [tenantOptions, selectedTargetTenantId]);

  const assetId = toNullableNumber(selectedAssetId);
  const targetTenantId = toNullableNumber(selectedTargetTenantId);

  const previewKey = useMemo(() => {
    return `${preview?.asset_id ?? ""}:${preview?.target_tenant_id ?? ""}`;
  }, [preview]);

  const currentKey = useMemo(() => {
    return `${assetId ?? ""}:${targetTenantId ?? ""}`;
  }, [assetId, targetTenantId]);

  const isPreviewMatched = previewKey === currentKey;

  const canPreview =
    canCreateTransfer &&
    Boolean(assetId) &&
    Boolean(targetTenantId) &&
    !previewLoading &&
    !createLoading;

  const canCreateDraft =
    canCreateTransfer &&
    Boolean(preview) &&
    isPreviewMatched &&
    preview?.can_transfer === true &&
    !previewLoading &&
    !createLoading;

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        setMeLoading(true);
        setError(null);

        const meRes = await apiGet<MeData>("/api/v1/auth/me");
        if (cancelled) return;

        const me =
          (meRes as any)?.data?.data ??
          (meRes as any)?.data ??
          null;

        setRoles(Array.isArray(me?.roles) ? me.roles : []);
      } catch (eAny: any) {
        if (
          eAny?.code === "AUTH_REQUIRED" ||
          eAny?.code === "AUTH_UNAUTHORIZED" ||
          eAny?.http_status === 401
        ) {
          router.replace("/login");
          router.refresh();
          return;
        }

        setError(eAny?.message || "Failed to initialize transfer page.");
      } finally {
        if (!cancelled) {
          setMeLoading(false);
        }
      }
    }

    void loadMe();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (meLoading) return;
    if (canCreateTransfer) return;

    if (presetAssetId) {
      router.replace(`/assets/${presetAssetId}`);
      return;
    }

    router.replace("/assets");
  }, [meLoading, canCreateTransfer, presetAssetId, router]);

  useEffect(() => {
    if (!hasPresetAssetQuery) return;

    if (!presetAssetId) {
      setError("Invalid asset_id in query string.");
      return;
    }

    setSelectedAssetId(presetAssetId);
  }, [hasPresetAssetQuery, presetAssetId]);

  useEffect(() => {
    if (meLoading || !canCreateTransfer) return;

    let isMounted = true;

    const timeout = window.setTimeout(async () => {
      try {
        setAssetsLoading(true);

        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", "50");
        if (assetSearch.trim()) {
          params.set("q", assetSearch.trim());
        }

        const payload = await apiGet(`/api/v1/assets?${params.toString()}`);
        const items = normalizeAssetOptions(payload);

        if (!isMounted) return;
        setAssetOptions(items);
      } catch (err) {
        if (!isMounted) return;
        setError(extractErrorMessage(err));
      } finally {
        if (isMounted) {
          setAssetsLoading(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [assetSearch, meLoading, canCreateTransfer]);

  useEffect(() => {
    if (meLoading || !canCreateTransfer || !presetAssetId) return;

    let isMounted = true;

    const loadPresetAsset = async () => {
      try {
        setPresetAssetLoading(true);

        const payload = await apiGet(`/api/v1/assets/${presetAssetId}`);
        const item = normalizeAssetDetail(payload);

        if (!isMounted) return;

        if (!item) {
          setPresetAssetOption(null);
          setError("Asset from query parameter was not found or is not accessible in the current tenant.");
          return;
        }

        setPresetAssetOption(item);
      } catch {
        if (!isMounted) return;
        setPresetAssetOption(null);
        setError("Asset from query parameter was not found or is not accessible in the current tenant.");
      } finally {
        if (isMounted) {
          setPresetAssetLoading(false);
        }
      }
    };

    void loadPresetAsset();

    return () => {
      isMounted = false;
    };
  }, [presetAssetId, meLoading, canCreateTransfer]);

  useEffect(() => {
    if (meLoading || !canCreateTransfer) return;

    let isMounted = true;

    const timeout = window.setTimeout(async () => {
      try {
        setTenantsLoading(true);

        const params = new URLSearchParams();
        params.set("limit", "50");
        if (tenantSearch.trim()) {
          params.set("q", tenantSearch.trim());
        }

        const payload = await apiGet(
          `/api/v1/asset-transfer-requests/target-tenant-options?${params.toString()}`
        );
        const items = normalizeTenantOptions(payload);

        if (!isMounted) return;
        setTenantOptions(items);
      } catch (err) {
        if (!isMounted) return;
        setError(extractErrorMessage(err));
      } finally {
        if (isMounted) {
          setTenantsLoading(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [tenantSearch, meLoading, canCreateTransfer]);

  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [selectedAssetId, selectedTargetTenantId]);

  const handlePreview = async () => {
    if (!canCreateTransfer) {
      return;
    }

    if (!assetId) {
      setError("Please select an asset.");
      return;
    }

    if (!targetTenantId) {
      setError("Please select a target tenant.");
      return;
    }

    try {
      setPreviewLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("asset_id", String(assetId));
      params.set("target_tenant_id", String(targetTenantId));

      const payload = await apiGet(
        `/api/v1/asset-transfer-requests/preview?${params.toString()}`
      );

      setPreview(normalizePreview(payload));
    } catch (err) {
      setPreview(null);
      setError(extractErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!canCreateTransfer) {
      return;
    }

    if (!assetId) {
      setError("Please select an asset.");
      return;
    }

    if (!targetTenantId) {
      setError("Please select a target tenant.");
      return;
    }

    if (!preview || !isPreviewMatched || !preview.can_transfer) {
      setError("Please run a valid preview first before creating a draft.");
      return;
    }

    const confirmed = window.confirm("Create draft asset transfer request?");
    if (!confirmed) return;

    try {
      setCreateLoading(true);
      setError(null);

      const payload = await apiPostJson("/api/v1/asset-transfer-requests", {
        asset_id: assetId,
        target_tenant_id: targetTenantId,
        reason: reason.trim() || null,
      });

      const createdId = extractCreatedRequestId(payload);

      if (createdId) {
        router.push(`/asset-transfer-requests/${createdId}`);
        return;
      }

      router.push("/asset-transfer-requests");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreateLoading(false);
    }
  };

  if (meLoading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 text-sm text-gray-600">
        Loading transfer access...
      </div>
    );
  }

  if (!canCreateTransfer) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">MVP 2.4A</div>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">
              Create Asset Transfer Request
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Select asset and destination company, review preview impact, then create a draft transfer request.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center justify-center itam-secondary-action"
            >
              Back
            </Link>

            {presetAssetId ? (
              <Link
                href={assetDetailHref}
                className="inline-flex items-center justify-center itam-secondary-action"
              >
                Go to Asset Detail
              </Link>
            ) : (
              <Link
                href="/assets"
                className="inline-flex items-center justify-center itam-secondary-action"
              >
                Go to Assets
              </Link>
            )}
          </div>
        </div>

        {hasPresetAssetQuery ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {presetAssetLoading
              ? "Loading asset from Asset Detail..."
              : selectedAsset
              ? "Asset was preselected from Asset Detail. You can continue by choosing the target company and reviewing the preview."
              : "Asset was requested from Asset Detail. Please verify the selected asset before continuing."}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Transfer Request Form
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search Asset
              </label>
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Search asset tag or asset name"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              />
              <p className="mt-2 text-xs text-gray-500">
                {assetsLoading
                  ? "Loading asset options..."
                  : `${combinedAssetOptions.length} asset option(s) loaded`}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search Target Company
              </label>
              <input
                type="text"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search tenant/company name"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              />
              <p className="mt-2 text-xs text-gray-500">
                {tenantsLoading
                  ? "Loading company options..."
                  : `${tenantOptions.length} company option(s) loaded`}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Asset
              </label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              >
                <option value="">Select asset</option>
                {combinedAssetOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {buildAssetOptionLabel(item)}
                  </option>
                ))}
              </select>

              {selectedAsset ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-900">Selected asset:</span>{" "}
                    {selectedAsset.asset_tag ?? `Asset #${selectedAsset.id}`}
                  </div>
                  <div className="mt-1">
                    {selectedAsset.asset_name ?? "-"}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Target Company
              </label>
              <select
                value={selectedTargetTenantId}
                onChange={(e) => setSelectedTargetTenantId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-gray-400"
              >
                <option value="">Select target company</option>
                {tenantOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {buildTenantOptionLabel(item)}
                  </option>
                ))}
              </select>

              {selectedTenant ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-900">Selected company:</span>{" "}
                    {selectedTenant.tenant_name}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Reason
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Explain why this asset needs to be moved to another company"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-400"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={!canPreview}
              className="itam-primary-action"
            >
              {previewLoading ? "Previewing..." : "Preview Transfer"}
            </button>

            <button
              type="button"
              onClick={() => void handleCreateDraft()}
              disabled={!canCreateDraft}
              className="itam-primary-action"
            >
              {createLoading ? "Creating..." : "Create Draft Request"}
            </button>
          </div>

          {!isPreviewMatched && preview ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Selection changed after preview. Please run preview again before creating the draft.
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Flow</h2>

            <div className="mt-4 space-y-3 text-sm text-gray-600">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                1. Search and select asset
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                2. Search and select target company
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                3. Run preview transfer
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                4. Review warnings, blocked reasons, and reset impact
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                5. Create draft request
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Status</h2>

            <div className="mt-4">
              {preview ? (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    preview.can_transfer
                      ? "bg-green-100 text-green-800 ring-1 ring-inset ring-green-200"
                      : "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200"
                  }`}
                >
                  {preview.can_transfer ? "Preview OK" : "Transfer Blocked"}
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
                  Waiting Preview
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {preview ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900">Preview Summary</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Asset
                  </div>
                  <div className="mt-2 text-base font-semibold text-gray-900">
                    {preview.asset_tag ?? "-"}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {preview.asset_name ?? "-"}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Asset ID: {preview.asset_id ?? "-"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Status: {preview.asset_status ?? "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Target Company
                  </div>
                  <div className="mt-2 text-base font-semibold text-gray-900">
                    {preview.target_tenant_name ?? "-"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Tenant ID: {preview.target_tenant_id ?? "-"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Status: {preview.target_tenant_status ?? "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Source Tenant ID
                  </div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">
                    {preview.source_tenant_id ?? "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Existing Active Request
                  </div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">
                    {preview.active_request_id ?? "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Transfer Result</h2>

              <div className="mt-4">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    preview.can_transfer
                      ? "bg-green-100 text-green-800 ring-1 ring-inset ring-green-200"
                      : "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200"
                  }`}
                >
                  {preview.can_transfer ? "Can Transfer" : "Cannot Transfer"}
                </span>
              </div>

              <div className="mt-4 text-sm text-gray-600">
                Review warnings and reset impact before creating the draft request.
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Warnings</h2>

              {preview.warnings.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No warnings.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {preview.warnings.map((warning, idx) => (
                    <div
                      key={`${warning}-${idx}`}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Blocked Reasons</h2>

              {preview.blocked_reasons.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No blocked reasons.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {preview.blocked_reasons.map((reason, idx) => (
                    <div
                      key={`${reason}-${idx}`}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Remap / Reset Requirements
              </h2>

              {preview.remap_requirements.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  No remap/reset requirements.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {preview.remap_requirements.map((item, idx) => (
                    <div
                      key={`${item}-${idx}`}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Relation Counts</h2>

              {Object.keys(preview.relation_counts ?? {}).length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No relation counts.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {Object.entries(preview.relation_counts ?? {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
                    >
                      <div className="text-sm text-gray-600">{getFieldLabel(key)}</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {renderSimpleValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
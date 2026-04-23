"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPostJson } from "@/app/lib/api";
import {
  canDeleteAssetTransfer,
  canDecideAssetTransfer,
  canSubmitAssetTransfer,
  canViewAssetTransfer,
} from "@/app/lib/assetTransferAccess";
import ConfirmDangerDialog from "@/app/components/ConfirmDangerDialog";
import ActionToast from "@/app/components/ActionToast";

type MeData = {
  tenant_id: number;
  user_id: number;
  roles: string[];
  identity_id: number | null;
};

type TransferRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED"
  | "CANCELLED"
  | string;

type TransferRequestEvent = {
  id: number;
  event_type: string;
  event_payload_json: unknown;
  created_at: string | null;
  created_by_user_id: number | null;
  created_by_identity_id: number | null;
};

type TransferRequestDetail = {
  id: number;
  request_code: string;
  status: TransferRequestStatus;
  reason: string | null;
  decision_note: string | null;

  asset_id: number | null;
  asset_tag: string | null;
  asset_name: string | null;

  source_tenant_id: number | null;
  source_tenant_name: string | null;
  target_tenant_id: number | null;
  target_tenant_name: string | null;

  current_asset_tenant_id: number | null;

  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  executed_at: string | null;

  requested_by_user_id: number | null;
  requested_by_identity_id: number | null;
  decided_by_user_id: number | null;
  decided_by_identity_id: number | null;

  warnings: string[];
  blocked_reasons: string[];
  remap_requirements: string[];
  relation_counts: Record<string, unknown>;
  execution_result_json: Record<string, unknown> | null;
};

type DetailResponseNormalized = {
  request: TransferRequestDetail | null;
  events: TransferRequestEvent[];
};

const FIELD_LABELS: Record<string, string> = {
  owner_department_id: "Owner Department",
  current_custodian_identity_id: "Current Custodian",
  location_id: "Location",
  asset_id: "Asset",
  source_tenant_id: "Source Tenant",
  target_tenant_id: "Target Tenant",
  contract_asset_links: "Contract Asset Links",
  removed_contract_asset_links: "Removed Contract Asset Links",
};

const MESSAGE_LABELS: Record<string, string> = {
  OWNER_DEPARTMENT_WILL_BE_RESET: "Owner department will be reset",
  CUSTODIAN_IDENTITY_WILL_BE_RESET: "Custodian identity will be reset",
  LOCATION_WILL_BE_RESET: "Location will be reset",
  CONTRACT_ASSET_LINKS_WILL_BE_REMOVED: "Contract asset links will be removed",
  SAME_TENANT_NOT_ALLOWED: "Target tenant must be different from source tenant",
  TARGET_TENANT_NOT_ACTIVE: "Target tenant must be active",
  TARGET_TENANT_NOT_FOUND: "Target tenant was not found",
  ASSET_NOT_FOUND: "Asset was not found",
  ACTIVE_REQUEST_ALREADY_EXISTS: "There is already another active transfer request",
  RESET_TO_NULL: "Will be reset",
};

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
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

  return "Failed to load asset transfer request detail.";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-200";
    case "SUBMITTED":
      return "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
    case "APPROVED":
      return "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
    case "EXECUTED":
      return "bg-green-100 text-green-800 ring-1 ring-inset ring-green-200";
    case "FAILED":
      return "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200";
    case "CANCELLED":
      return "bg-gray-200 text-gray-800 ring-1 ring-inset ring-gray-300";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200";
  }
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

  const isSystemCode =
    value.toUpperCase() === value && value.includes("_");

  if (!isSystemCode) {
    return value;
  }

  const sentence = value
    .split("_")
    .map((part) => part.toLowerCase())
    .join(" ");

  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function renderSimpleValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toObjectRecord(value: unknown): Record<string, any> | null {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return null;
    }
  }

  return null;
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
      value
        .flatMap((item) => normalizeRemapRequirements(item))
        .filter(Boolean)
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
          typeof action === "string" ? action : renderSimpleValue(action);

        if (actionText === "RESET_TO_NULL") {
          return `${getFieldLabel(field)} will be reset`;
        }

        return `${getFieldLabel(field)}: ${humanizeMessage(actionText)}`;
      })
    );
  }

  return [];
}

function normalizeResetFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return uniqueStrings(
    value
      .map((item) => toNullableString(item))
      .filter((item): item is string => Boolean(item))
      .map((field) => `${getFieldLabel(field)} will be reset`)
  );
}

function getEventTitle(eventType: string): string {
  switch (eventType) {
    case "TRANSFER_REQUEST_CREATED":
      return "Transfer Request Created";
    case "TRANSFER_REQUEST_SUBMITTED":
      return "Transfer Request Submitted";
    case "TRANSFER_REQUEST_APPROVED":
      return "Transfer Request Approved";
    case "TRANSFER_REQUEST_REJECTED":
      return "Transfer Request Rejected";
    case "TRANSFER_EXECUTION_STARTED":
      return "Transfer Execution Started";
    case "TRANSFER_EXECUTION_COMPLETED":
      return "Transfer Execution Completed";
    case "TRANSFER_EXECUTION_FAILED":
      return "Transfer Execution Failed";
    case "TRANSFER_REQUEST_CANCELLED":
      return "Transfer Request Cancelled";
    default:
      return humanizeKey(eventType);
  }
}

function getEventDescription(eventType: string): string {
  switch (eventType) {
    case "TRANSFER_REQUEST_CREATED":
      return "Draft transfer request has been created.";
    case "TRANSFER_REQUEST_SUBMITTED":
      return "Transfer request has been submitted for approval.";
    case "TRANSFER_REQUEST_APPROVED":
      return "Transfer request has been approved.";
    case "TRANSFER_REQUEST_REJECTED":
      return "Transfer request has been rejected.";
    case "TRANSFER_EXECUTION_STARTED":
      return "Transfer execution has started.";
    case "TRANSFER_EXECUTION_COMPLETED":
      return "Transfer execution completed successfully.";
    case "TRANSFER_EXECUTION_FAILED":
      return "Transfer execution failed.";
    case "TRANSFER_REQUEST_CANCELLED":
      return "Transfer request has been cancelled.";
    default:
      return "Transfer request event recorded.";
  }
}

function normalizeEvent(raw: any): TransferRequestEvent {
  return {
    id: toNumber(raw?.id),
    event_type: toNullableString(raw?.event_type) ?? "UNKNOWN_EVENT",
    event_payload_json: raw?.event_payload_json ?? null,
    created_at: toNullableString(raw?.created_at),
    created_by_user_id: toNullableNumber(raw?.created_by_user_id),
    created_by_identity_id: toNullableNumber(raw?.created_by_identity_id),
  };
}

function normalizeDetailResponse(payload: any): DetailResponseNormalized {
  const data = payload?.data ?? payload ?? {};

  const rawRequest =
    data?.request ??
    data?.item ??
    data?.transfer_request ??
    data ??
    null;

  const rawEvents =
    data?.events ??
    rawRequest?.events ??
    payload?.events ??
    [];

  if (!rawRequest || typeof rawRequest !== "object") {
    return {
      request: null,
      events: [],
    };
  }

  const asset = rawRequest?.asset ?? {};
  const sourceTenant = rawRequest?.source_tenant ?? rawRequest?.tenant ?? {};
  const targetTenant = rawRequest?.target_tenant ?? {};
  const preview = rawRequest?.preview ?? rawRequest?.preview_result ?? {};

  const rawRelationCounts =
    (rawRequest?.relation_counts && typeof rawRequest?.relation_counts === "object"
      ? rawRequest?.relation_counts
      : preview?.relation_counts && typeof preview?.relation_counts === "object"
      ? preview?.relation_counts
      : {}) ?? {};

  const executionResultJson = toObjectRecord(rawRequest?.execution_result_json);

  const warnings = uniqueStrings([
    ...normalizeStringList(rawRequest?.warnings),
    ...normalizeStringList(preview?.warnings),
  ]);

  const blockedReasons = uniqueStrings([
    ...normalizeStringList(rawRequest?.blocked_reasons),
    ...normalizeStringList(preview?.blocked_reasons),
  ]);

  const remapRequirements = uniqueStrings([
    ...normalizeRemapRequirements(rawRequest?.remap_requirements),
    ...normalizeRemapRequirements(preview?.remap_requirements),
    ...normalizeResetFields(executionResultJson?.reset_fields),
  ]);

  const request: TransferRequestDetail = {
    id: toNumber(rawRequest?.id),
    request_code:
      toNullableString(rawRequest?.request_code) ?? `TR-${rawRequest?.id ?? "-"}`,
    status: toNullableString(rawRequest?.status) ?? "DRAFT",
    reason: toNullableString(rawRequest?.reason),
    decision_note: toNullableString(rawRequest?.decision_note),

    asset_id: toNullableNumber(rawRequest?.asset_id ?? asset?.id),
    asset_tag: toNullableString(rawRequest?.asset_tag ?? asset?.asset_tag),
    asset_name: toNullableString(
      rawRequest?.asset_name ??
        asset?.asset_name ??
        asset?.name ??
        asset?.display_name ??
        asset?.hostname
    ),

    source_tenant_id: toNullableNumber(
      rawRequest?.tenant_id ?? rawRequest?.source_tenant_id ?? sourceTenant?.id
    ),
    source_tenant_name: toNullableString(
      rawRequest?.source_tenant_name ??
        sourceTenant?.tenant_name ??
        sourceTenant?.name
    ),
    target_tenant_id: toNullableNumber(
      rawRequest?.target_tenant_id ?? targetTenant?.id
    ),
    target_tenant_name: toNullableString(
      rawRequest?.target_tenant_name ??
        targetTenant?.tenant_name ??
        targetTenant?.name
    ),

    current_asset_tenant_id: toNullableNumber(rawRequest?.current_asset_tenant_id),

    created_at: toNullableString(rawRequest?.created_at),
    updated_at: toNullableString(rawRequest?.updated_at),
    submitted_at: toNullableString(rawRequest?.submitted_at),
    decided_at: toNullableString(rawRequest?.decided_at),
    executed_at: toNullableString(rawRequest?.executed_at),

    requested_by_user_id: toNullableNumber(rawRequest?.requested_by_user_id),
    requested_by_identity_id: toNullableNumber(rawRequest?.requested_by_identity_id),
    decided_by_user_id: toNullableNumber(rawRequest?.decided_by_user_id),
    decided_by_identity_id: toNullableNumber(rawRequest?.decided_by_identity_id),

    warnings,
    blocked_reasons: blockedReasons,
    remap_requirements: remapRequirements,
    relation_counts: rawRelationCounts,
    execution_result_json: executionResultJson,
  };

  return {
    request,
    events: Array.isArray(rawEvents) ? rawEvents.map(normalizeEvent) : [],
  };
}

export default function AssetTransferRequestDetailClient({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();

  const [roles, setRoles] = useState<string[]>([]);
  const [accessLoading, setAccessLoading] = useState(true);

  const [request, setRequest] = useState<TransferRequestDetail | null>(null);
  const [events, setEvents] = useState<TransferRequestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const canViewTransfer = useMemo(() => {
    return canViewAssetTransfer(roles);
  }, [roles]);

  const canSubmitByRole = useMemo(() => {
    return canSubmitAssetTransfer(roles);
  }, [roles]);

  const canDecideByRole = useMemo(() => {
    return canDecideAssetTransfer(roles);
  }, [roles]);

  const canDeleteByRole = useMemo(() => {
    return canDeleteAssetTransfer(roles);
  }, [roles]);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = await apiGet(`/api/v1/asset-transfer-requests/${requestId}`);
      const normalized = normalizeDetailResponse(payload);

      setRequest(normalized.request);
      setEvents(normalized.events);
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

      setError(extractErrorMessage(eAny));
    } finally {
      setLoading(false);
    }
  }, [requestId, router]);

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      try {
        setAccessLoading(true);
        setError(null);

        const res = await apiGet<MeData>("/api/v1/auth/me");
        const me = (res as any)?.data?.data ?? (res as any)?.data ?? null;
        const nextRoles = Array.isArray(me?.roles) ? me.roles : [];

        if (!mounted) return;
        setRoles(nextRoles);
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

        setError(eAny?.message || "Failed to verify transfer access.");
      } finally {
        if (!mounted) return;
        setAccessLoading(false);
      }
    }

    void loadAccess();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (accessLoading) return;

    if (!canViewTransfer) {
      router.replace("/assets");
      return;
    }

    void loadDetail();
  }, [accessLoading, canViewTransfer, loadDetail, router]);

  const canSubmit = canSubmitByRole && request?.status === "DRAFT";
  const canDecide = canDecideByRole && request?.status === "SUBMITTED";
  const canDeleteDraft = canDeleteByRole && request?.status === "DRAFT";

  const executionResetFields = useMemo(() => {
    return normalizeResetFields(request?.execution_result_json?.reset_fields);
  }, [request?.execution_result_json]);

  const removedContractLinks = useMemo(() => {
    return toNullableNumber(
      request?.execution_result_json?.removed_contract_asset_links
    );
  }, [request?.execution_result_json]);

  const actionHint = useMemo(() => {
    if (!request) return null;

    if (request.status === "DRAFT" && !canSubmitByRole) {
      return "You can view this request, but only ITAM Manager or Tenant Admin can submit a draft transfer request.";
    }

    if (request.status === "SUBMITTED" && !canDecideByRole) {
      return "You can view this request, but only ITAM Manager or Tenant Admin can approve or reject a submitted transfer request.";
    }

    return null;
  }, [request, canSubmitByRole, canDecideByRole]);

  const handleSubmitRequest = useCallback(async () => {
    if (!request || !canSubmitByRole) return;

    const confirmed = window.confirm(
      `Submit transfer request ${request.request_code}?`
    );
    if (!confirmed) return;

    try {
      setSubmittingAction(true);
      setError(null);

      await apiPostJson(`/api/v1/asset-transfer-requests/${request.id}/submit`, {});
      await loadDetail();
    } catch (eAny: any) {
      setError(extractErrorMessage(eAny));
    } finally {
      setSubmittingAction(false);
    }
  }, [canSubmitByRole, loadDetail, request]);

  const handleDecide = useCallback(
    async (action: "APPROVE" | "REJECT") => {
      if (!request || !canDecideByRole) return;

      const confirmed = window.confirm(
        `${action === "APPROVE" ? "Approve" : "Reject"} transfer request ${
          request.request_code
        }?`
      );
      if (!confirmed) return;

      try {
        setSubmittingAction(true);
        setError(null);

        await apiPostJson(`/api/v1/asset-transfer-requests/${request.id}/decide`, {
          action,
          decision_note: decisionNote.trim() || null,
        });

        await loadDetail();
      } catch (eAny: any) {
        setError(extractErrorMessage(eAny));
      } finally {
        setSubmittingAction(false);
      }
    },
    [canDecideByRole, decisionNote, loadDetail, request]
  );

  const handleDeleteDraft = useCallback(async () => {
    if (!request || !canDeleteDraft || deleteLoading) return;

    try {
      setDeleteLoading(true);
      setError(null);
      setToast(null);

      await apiDelete(`/api/v1/asset-transfer-requests/${request.id}`);

      setDeleteOpen(false);
      setToast({
        type: "success",
        message: `Draft transfer request ${request.request_code} deleted.`,
      });

      window.setTimeout(() => {
        router.push("/asset-transfer-requests");
      }, 700);
    } catch (eAny: any) {
      if (eAny?.code === "ASSET_TRANSFER_NOT_DELETABLE") {
        setToast({
          type: "error",
          message: "Transfer request sudah bukan DRAFT.",
        });
      } else {
        setToast({
          type: "error",
          message: extractErrorMessage(eAny),
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [canDeleteDraft, deleteLoading, request, router]);

  if (accessLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
      </div>
    );
  }

  if (!canViewTransfer) {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-gray-200" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="text-sm font-semibold text-red-800">
          Failed to load transfer request detail
        </div>
        <p className="mt-2 text-sm text-red-700">{error}</p>

        <div className="mt-4">
          <Link
            href="/asset-transfer-requests"
            className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Back to Transfer Requests
          </Link>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        Transfer request not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ActionToast
        open={Boolean(toast)}
        type={toast?.type || "success"}
        message={toast?.message || ""}
        onClose={() => setToast(null)}
      />
      <ConfirmDangerDialog
        open={deleteOpen}
        title="Delete draft transfer request"
        description={`Draft transfer request ${request?.request_code || ""} akan dihapus permanen. Aksi ini hanya tersedia untuk status DRAFT.`}
        confirmLabel="Delete Draft"
        loading={deleteLoading}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void handleDeleteDraft()}
      />

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">
              Asset Transfer Request
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">
              {request.request_code}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                  request.status
                )}`}
              >
                {request.status}
              </span>

              <span className="text-sm text-gray-500">ID: {request.id}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/asset-transfer-requests"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to List
            </Link>

            <button
              type="button"
              onClick={() => void loadDetail()}
              disabled={submittingAction || deleteLoading}
              className="inline-flex items-center justify-center itam-primary-action"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

        <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">Request Summary</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Asset
              </div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {request.asset_tag ?? "-"}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {request.asset_name ?? "-"}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Asset ID: {request.asset_id ?? "-"}
              </div>

              {request.asset_id ? (
                <div className="mt-3">
                  <Link
                    href={`/assets/${request.asset_id}`}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    Open Asset Detail
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Reason
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {request.reason ?? "-"}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Source Tenant
              </div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {request.source_tenant_name ?? "-"}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Tenant ID: {request.source_tenant_id ?? "-"}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Target Tenant
              </div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {request.target_tenant_name ?? "-"}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Tenant ID: {request.target_tenant_id ?? "-"}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Current Asset Tenant
              </div>
              <div className="mt-2 text-base font-semibold text-gray-900">
                {request.current_asset_tenant_id ?? "-"}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Decision Note
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {request.decision_note ?? "-"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Created At
              </div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {formatDateTime(request.created_at)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Submitted At
              </div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {formatDateTime(request.submitted_at)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Executed At
              </div>
              <div className="mt-2 text-sm font-medium text-gray-900">
                {formatDateTime(request.executed_at)}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Actions</h2>

            <div className="mt-4 space-y-3">
              {canDeleteDraft ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  disabled={submittingAction || deleteLoading}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteLoading ? "Deleting..." : "Delete Draft"}
                </button>
              ) : null}

              {canSubmit ? (
                <button
                  type="button"
                  onClick={() => void handleSubmitRequest()}
                  disabled={submittingAction || deleteLoading}
                  className="itam-primary-action"
                >
                  {submittingAction ? "Submitting..." : "Submit Request"}
                </button>
              ) : null}

              {canDecide ? (
                <>
                  <textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    rows={4}
                    placeholder="Decision note (optional but recommended)"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-gray-400"
                  />

                  <button
                    type="button"
                    onClick={() => void handleDecide("APPROVE")}
                    disabled={submittingAction || deleteLoading}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingAction ? "Processing..." : "Approve Request"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDecide("REJECT")}
                    disabled={submittingAction || deleteLoading}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingAction ? "Processing..." : "Reject Request"}
                  </button>
                </>
              ) : null}

              {!canSubmit && !canDecide ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {actionHint ?? (
                    <>
                      No action available for status <strong>{request.status}</strong>.
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Warnings</h2>

            {request.warnings.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No warnings.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {request.warnings.map((warning, idx) => (
                  <li
                    key={`${warning}-${idx}`}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Blocked Reasons</h2>

            {request.blocked_reasons.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">No blocked reasons.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {request.blocked_reasons.map((reason, idx) => (
                  <li
                    key={`${reason}-${idx}`}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Remap / Reset Requirements
          </h2>

          {request.remap_requirements.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No remap/reset requirements.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {request.remap_requirements.map((item, idx) => (
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
          <h2 className="text-lg font-semibold text-gray-900">
            Execution Summary
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Asset ID
              </div>
              <div className="mt-2 text-xl font-semibold text-gray-900">
                {renderSimpleValue(
                  request.execution_result_json?.asset_id ?? request.asset_id ?? "-"
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Removed Contract Asset Links
              </div>
              <div className="mt-2 text-xl font-semibold text-gray-900">
                {renderSimpleValue(removedContractLinks ?? "-")}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Source Tenant ID
              </div>
              <div className="mt-2 text-xl font-semibold text-gray-900">
                {renderSimpleValue(
                  request.execution_result_json?.source_tenant_id ??
                    request.source_tenant_id ??
                    "-"
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Target Tenant ID
              </div>
              <div className="mt-2 text-xl font-semibold text-gray-900">
                {renderSimpleValue(
                  request.execution_result_json?.target_tenant_id ??
                    request.target_tenant_id ??
                    "-"
                )}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-gray-700">Reset Fields</div>

            {executionResetFields.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No reset fields.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {executionResetFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200"
                  >
                    {field}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="text-sm font-medium text-gray-700">Relation Counts</div>

            {Object.keys(request.relation_counts ?? {}).length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No relation counts.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {Object.entries(request.relation_counts ?? {}).map(([key, value]) => (
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
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Event Timeline</h2>

        {events.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No transfer events recorded.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {events.map((event) => {
              const payload = toObjectRecord(event.event_payload_json) ?? {};
              const preview = toObjectRecord(payload.preview) ?? {};
              const relationCounts =
                toObjectRecord(payload.relation_counts) ??
                toObjectRecord(preview.relation_counts) ??
                {};

              const warnings = uniqueStrings([
                ...normalizeStringList(payload.warnings),
                ...normalizeStringList(preview.warnings),
              ]);

              const blockedReasons = uniqueStrings([
                ...normalizeStringList(payload.blocked_reasons),
                ...normalizeStringList(preview.blocked_reasons),
              ]);

              const remapRequirements = uniqueStrings([
                ...normalizeRemapRequirements(payload.remap_requirements),
                ...normalizeRemapRequirements(preview.remap_requirements),
                ...normalizeResetFields(payload.reset_fields),
              ]);

              const sourceTenantId =
                payload.source_tenant_id ??
                preview.source_tenant_id ??
                request.source_tenant_id ??
                "-";

              const targetTenantId =
                payload.target_tenant_id ??
                preview.target_tenant_id ??
                request.target_tenant_id ??
                "-";

              const assetId =
                payload.asset_id ??
                preview.asset?.id ??
                request.asset_id ??
                "-";

              const removedLinks =
                payload.removed_contract_asset_links ??
                relationCounts.contract_asset_links ??
                "-";

              const eventDecisionNote = toNullableString(payload.decision_note);

              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-gray-200 p-5"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {getEventTitle(event.event_type)}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {getEventDescription(event.event_type)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Event ID: {event.id}
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      {formatDateTime(event.created_at)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Asset ID:{" "}
                      <span className="font-medium text-gray-900">
                        {renderSimpleValue(assetId)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Source Tenant ID:{" "}
                      <span className="font-medium text-gray-900">
                        {renderSimpleValue(sourceTenantId)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Target Tenant ID:{" "}
                      <span className="font-medium text-gray-900">
                        {renderSimpleValue(targetTenantId)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Created by user ID:{" "}
                      <span className="font-medium text-gray-900">
                        {event.created_by_user_id ?? "-"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Created by identity ID:{" "}
                      <span className="font-medium text-gray-900">
                        {event.created_by_identity_id ?? "-"}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      Removed Contract Asset Links:{" "}
                      <span className="font-medium text-gray-900">
                        {renderSimpleValue(removedLinks)}
                      </span>
                    </div>
                  </div>

                  {eventDecisionNote ? (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">Decision note:</span>{" "}
                      {eventDecisionNote}
                    </div>
                  ) : null}

                  {remapRequirements.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700">
                        Remap / Reset Requirements
                      </div>
                      <div className="mt-2 space-y-2">
                        {remapRequirements.map((item, idx) => (
                          <div
                            key={`${item}-${idx}`}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {warnings.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700">Warnings</div>
                      <div className="mt-2 space-y-2">
                        {warnings.map((warning, idx) => (
                          <div
                            key={`${warning}-${idx}`}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                          >
                            {warning}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {blockedReasons.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700">
                        Blocked Reasons
                      </div>
                      <div className="mt-2 space-y-2">
                        {blockedReasons.map((reason, idx) => (
                          <div
                            key={`${reason}-${idx}`}
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                          >
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {Object.keys(relationCounts).length > 0 ? (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-gray-700">
                        Relation Counts
                      </div>
                      <div className="mt-2 space-y-2">
                        {Object.entries(relationCounts).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
                          >
                            <div className="text-sm text-gray-600">
                              {getFieldLabel(key)}
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {renderSimpleValue(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

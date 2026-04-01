"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatchJson, apiPostJson } from "@/app/lib/api";

type AllocationBasis = "INSTALLATION" | "ASSIGNMENT" | "ASSET" | "MANUAL";
type AllocationStatus = "ACTIVE" | "RELEASED";

type EntitlementItem = {
  id: number;
  contract_id: number;
  software_product_id: number;
  entitlement_code: string;
  entitlement_name: string | null;
  licensing_metric: string;
  quantity_purchased: number;
  status: string;
  software_product_code: string;
  software_product_name: string;
};

type ContractAssetOption = {
  id: number;
  asset_tag: string;
  name: string;
  status: string | null;
};

type InstallationOption = {
  id: number;
  asset_id: number;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  installation_status: string;
  installed_version: string | null;
};

type AssignmentOption = {
  id: number;
  asset_id: number;
  software_installation_id: number;
  identity_id: number;
  identity_code: string | null;
  identity_display_name: string;
  assignment_role: string;
  assignment_status: string;
};

type AllocationItem = {
  id: number;
  tenant_id: number;
  software_entitlement_id: number;
  asset_id: number;
  software_installation_id: number | null;
  software_assignment_id: number | null;
  allocation_basis: AllocationBasis;
  allocated_quantity: number;
  status: AllocationStatus;
  allocated_at: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  contract_id: number;
  contract_code: string;
  contract_name: string;

  entitlement_code: string;
  entitlement_name: string | null;
  licensing_metric: string;
  quantity_purchased: number;
  entitlement_status: string;

  software_product_id: number;
  software_product_code: string;
  software_product_name: string;

  asset_tag: string;
  asset_name: string;

  software_installation_status: string | null;
  software_installation_version: string | null;

  assignment_role: string | null;
  assignment_status: string | null;
  identity_code: string | null;
  identity_display_name: string | null;
};

type AllocationSummary = {
  software_entitlement_id: number;
  entitlement_code: string;
  entitlement_name: string | null;
  quantity_purchased: number;
  allocated_quantity_active: number;
  remaining_quantity: number;
  entitlement_status: string;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  contract_id: number;
  contract_code: string;
  contract_name: string;
};

type Props = {
  contractId: number | string;
  entitlement: EntitlementItem | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

type FormState = {
  asset_id: string;
  allocation_basis: AllocationBasis;
  software_installation_id: string;
  software_assignment_id: string;
  allocated_quantity: string;
  allocated_at: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  asset_id: "",
  allocation_basis: "INSTALLATION",
  software_installation_id: "",
  software_assignment_id: "",
  allocated_quantity: "1",
  allocated_at: "",
  notes: "",
};

function unwrapData<T = any>(payload: any): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function extractItems<T = any>(payload: any): T[] {
  const root = unwrapData<any>(payload);
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  return [];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toNullableText(value: string): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return String(value).slice(0, 10) || "-";
}

function normalizeContractAsset(item: any): ContractAssetOption {
  const asset = item?.asset ?? item;
  return {
    id: Number(asset?.id ?? 0),
    asset_tag: String(asset?.asset_tag ?? ""),
    name: String(asset?.name ?? ""),
    status: asset?.status ? String(asset.status) : null,
  };
}

function normalizeInstallation(item: any): InstallationOption {
  return {
    id: Number(item?.id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    installation_status: String(item?.installation_status ?? ""),
    installed_version: item?.installed_version ? String(item.installed_version) : null,
  };
}

function normalizeAssignment(item: any): AssignmentOption {
  return {
    id: Number(item?.id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_installation_id: Number(item?.software_installation_id ?? 0),
    identity_id: Number(item?.identity_id ?? 0),
    identity_code: item?.identity_code ? String(item.identity_code) : null,
    identity_display_name: String(item?.identity_display_name ?? "-"),
    assignment_role: String(item?.assignment_role ?? ""),
    assignment_status: String(item?.assignment_status ?? ""),
  };
}

function normalizeAllocation(item: any): AllocationItem {
  return {
    id: Number(item?.id ?? 0),
    tenant_id: Number(item?.tenant_id ?? 0),
    software_entitlement_id: Number(item?.software_entitlement_id ?? 0),
    asset_id: Number(item?.asset_id ?? 0),
    software_installation_id:
      item?.software_installation_id == null
        ? null
        : Number(item.software_installation_id),
    software_assignment_id:
      item?.software_assignment_id == null
        ? null
        : Number(item.software_assignment_id),
    allocation_basis: String(item?.allocation_basis ?? "INSTALLATION").toUpperCase() as AllocationBasis,
    allocated_quantity: Number(item?.allocated_quantity ?? 0),
    status: String(item?.status ?? "ACTIVE").toUpperCase() as AllocationStatus,
    allocated_at: item?.allocated_at ? String(item.allocated_at) : null,
    released_at: item?.released_at ? String(item.released_at) : null,
    notes: item?.notes ? String(item.notes) : null,
    created_at: String(item?.created_at ?? ""),
    updated_at: String(item?.updated_at ?? ""),

    contract_id: Number(item?.contract_id ?? 0),
    contract_code: String(item?.contract_code ?? ""),
    contract_name: String(item?.contract_name ?? ""),

    entitlement_code: String(item?.entitlement_code ?? ""),
    entitlement_name: item?.entitlement_name ? String(item.entitlement_name) : null,
    licensing_metric: String(item?.licensing_metric ?? ""),
    quantity_purchased: Number(item?.quantity_purchased ?? 0),
    entitlement_status: String(item?.entitlement_status ?? ""),

    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),

    asset_tag: String(item?.asset_tag ?? ""),
    asset_name: String(item?.asset_name ?? ""),

    software_installation_status: item?.software_installation_status
      ? String(item.software_installation_status)
      : null,
    software_installation_version: item?.software_installation_version
      ? String(item.software_installation_version)
      : null,

    assignment_role: item?.assignment_role ? String(item.assignment_role) : null,
    assignment_status: item?.assignment_status ? String(item.assignment_status) : null,
    identity_code: item?.identity_code ? String(item.identity_code) : null,
    identity_display_name: item?.identity_display_name
      ? String(item.identity_display_name)
      : null,
  };
}

function isEntitlementActive(status: string | null | undefined): boolean {
  return String(status ?? "").toUpperCase() === "ACTIVE";
}

function isInstallationUsable(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toUpperCase();
  return normalized === "INSTALLED" || normalized === "DETECTED";
}

function allocationStatusClass(status: AllocationStatus | string): string {
  const s = String(status ?? "").toUpperCase();

  if (s === "ACTIVE") {
    return "inline-flex rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700";
  }

  if (s === "RELEASED") {
    return "inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700";
  }

  return "inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700";
}

export default function SoftwareEntitlementAllocationsModal({
  contractId,
  entitlement,
  isOpen,
  onClose,
  onChanged,
}: Props) {
  const [summary, setSummary] = useState<AllocationSummary | null>(null);
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [contractAssets, setContractAssets] = useState<ContractAssetOption[]>([]);
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    allocated_at: todayIsoDate(),
  });

  const normalizedContractId = useMemo(() => String(contractId), [contractId]);

  const filteredInstallations = useMemo(() => {
    if (!entitlement) return [];
    return installations.filter(
      (item) =>
        Number(item.software_product_id) === Number(entitlement.software_product_id) &&
        isInstallationUsable(item.installation_status)
    );
  }, [entitlement, installations]);

  const filteredAssignments = useMemo(() => {
    const activeAssignments = assignments.filter(
      (item) => String(item.assignment_status).toUpperCase() === "ACTIVE"
    );

    const validInstallationIds = new Set(
      filteredInstallations.map((item) => Number(item.id))
    );

    let rows = activeAssignments.filter((item) =>
      validInstallationIds.has(Number(item.software_installation_id))
    );

    if (form.software_installation_id) {
      rows = rows.filter(
        (item) =>
          Number(item.software_installation_id) === Number(form.software_installation_id)
      );
    }

    return rows;
  }, [assignments, filteredInstallations, form.software_installation_id]);

  const selectedAsset = useMemo(() => {
    return contractAssets.find((item) => Number(item.id) === Number(form.asset_id)) ?? null;
  }, [contractAssets, form.asset_id]);

  const selectedInstallation = useMemo(() => {
    return (
      filteredInstallations.find(
        (item) => Number(item.id) === Number(form.software_installation_id)
      ) ?? null
    );
  }, [filteredInstallations, form.software_installation_id]);

  const selectedAssignment = useMemo(() => {
    return (
      filteredAssignments.find(
        (item) => Number(item.id) === Number(form.software_assignment_id)
      ) ?? null
    );
  }, [filteredAssignments, form.software_assignment_id]);

  const remainingQuantity = Number(summary?.remaining_quantity ?? 0);
  const entitlementActive = isEntitlementActive(
    summary?.entitlement_status ?? entitlement?.status
  );

  const basisHelpText = useMemo(() => {
    if (form.allocation_basis === "ASSET") {
      return "Use this when the entitlement is allocated directly to the asset without linking to a specific installation or assignment.";
    }

    if (form.allocation_basis === "INSTALLATION") {
      return "Installation target must already exist and be active on the selected asset. Manage installations from Asset Detail > Software.";
    }

    if (form.allocation_basis === "ASSIGNMENT") {
      return "Assignment target must already exist and be ACTIVE on the selected asset installation. Manage assignments from Asset Detail > Software.";
    }

    return "Manual allocation still requires an asset context, but does not link to a specific installation or assignment.";
  }, [form.allocation_basis]);

  const createBlockedReason = useMemo(() => {
    const qty = Number(form.allocated_quantity);

    if (!summary) {
      return "Allocation summary is still loading.";
    }

    if (!entitlementActive) {
      return "Entitlement must be ACTIVE before creating allocation.";
    }

    if (remainingQuantity <= 0) {
      return "No remaining quantity is available for this entitlement.";
    }

    if (!form.asset_id) {
      return "Select an asset first.";
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      return "Allocated quantity must be a positive integer.";
    }

    if (qty > remainingQuantity) {
      return `Allocated quantity cannot exceed remaining quantity (${remainingQuantity}).`;
    }

    if (
      (form.allocation_basis === "INSTALLATION" ||
        form.allocation_basis === "ASSIGNMENT") &&
      filteredInstallations.length === 0
    ) {
      return "No active installation is available for this asset and software product. Create or activate the installation from Asset Detail first.";
    }

    if (
      form.allocation_basis === "INSTALLATION" &&
      !form.software_installation_id
    ) {
      return "Select a software installation first.";
    }

    if (
      form.allocation_basis === "ASSIGNMENT" &&
      filteredAssignments.length === 0
    ) {
      return "No ACTIVE software assignment is available for the selected installation. Create or activate the assignment from Asset Detail first.";
    }

    if (form.allocation_basis === "ASSIGNMENT" && !form.software_assignment_id) {
      return "Select a software assignment first.";
    }

    return null;
  }, [
    entitlementActive,
    filteredAssignments.length,
    filteredInstallations.length,
    form.allocation_basis,
    form.asset_id,
    form.allocated_quantity,
    form.software_assignment_id,
    form.software_installation_id,
    remainingQuantity,
    summary,
  ]);

  const canSubmit = !saving && !createBlockedReason;

  const loadAllocations = useCallback(async () => {
    if (!entitlement) return;

    setLoading(true);
    setErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/software-entitlements/${entitlement.id}/allocations`
      );
      const root = unwrapData<any>(payload);
      setSummary(root?.summary ?? null);
      setAllocations(extractItems(payload).map(normalizeAllocation));
    } catch (e: any) {
      setErr(e?.message || "Failed to load allocations.");
      setSummary(null);
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [entitlement]);

  const loadContractAssets = useCallback(async () => {
    const payload = await apiGet(
      `/api/v1/contracts/${encodeURIComponent(normalizedContractId)}/assets?page=1&page_size=100`
    );
    setContractAssets(extractItems(payload).map(normalizeContractAsset));
  }, [normalizedContractId]);

  const loadTargetsForAsset = useCallback(async (assetId: string) => {
    if (!assetId) {
      setInstallations([]);
      setAssignments([]);
      return;
    }

    setLoadingTargets(true);
    setErr(null);

    try {
      const [installationsRes, assignmentsRes] = await Promise.all([
        apiGet(`/api/v1/assets/${assetId}/software-installations`),
        apiGet(`/api/v1/assets/${assetId}/software-assignments`),
      ]);

      setInstallations(extractItems(installationsRes).map(normalizeInstallation));
      setAssignments(extractItems(assignmentsRes).map(normalizeAssignment));
    } catch (e: any) {
      setErr(e?.message || "Failed to load allocation targets.");
      setInstallations([]);
      setAssignments([]);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !entitlement) return;

    setErr(null);
    setSummary(null);
    setAllocations([]);
    setContractAssets([]);
    setInstallations([]);
    setAssignments([]);
    setForm({
      ...DEFAULT_FORM,
      allocated_at: todayIsoDate(),
    });

    void Promise.all([loadAllocations(), loadContractAssets()]);
  }, [entitlement, isOpen, loadAllocations, loadContractAssets]);

  useEffect(() => {
    if (!isOpen) return;

    if (!form.asset_id) {
      setInstallations([]);
      setAssignments([]);
      return;
    }

    void loadTargetsForAsset(form.asset_id);
  }, [form.asset_id, isOpen, loadTargetsForAsset]);

  useEffect(() => {
    if (!isOpen) return;

    if (!form.asset_id && contractAssets.length === 1) {
      setForm((prev) => ({
        ...prev,
        asset_id: String(contractAssets[0].id),
      }));
    }
  }, [contractAssets, form.asset_id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setForm((prev) => {
      if (
        prev.allocation_basis !== "INSTALLATION" &&
        prev.allocation_basis !== "ASSIGNMENT"
      ) {
        if (!prev.software_installation_id && !prev.software_assignment_id) {
          return prev;
        }

        return {
          ...prev,
          software_installation_id: "",
          software_assignment_id: "",
        };
      }

      const hasCurrentInstallation = filteredInstallations.some(
        (item) => Number(item.id) === Number(prev.software_installation_id)
      );

      const nextInstallationId = hasCurrentInstallation
        ? prev.software_installation_id
        : filteredInstallations.length === 1
        ? String(filteredInstallations[0].id)
        : "";

      const nextAssignmentId =
        prev.allocation_basis === "ASSIGNMENT" ? prev.software_assignment_id : "";

      if (
        nextInstallationId === prev.software_installation_id &&
        nextAssignmentId === prev.software_assignment_id
      ) {
        return prev;
      }

      return {
        ...prev,
        software_installation_id: nextInstallationId,
        software_assignment_id: nextAssignmentId,
      };
    });
  }, [filteredInstallations, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setForm((prev) => {
      if (prev.allocation_basis !== "ASSIGNMENT") {
        if (!prev.software_assignment_id) return prev;
        return {
          ...prev,
          software_assignment_id: "",
        };
      }

      const hasCurrentAssignment = filteredAssignments.some(
        (item) => Number(item.id) === Number(prev.software_assignment_id)
      );

      const nextAssignmentId = hasCurrentAssignment
        ? prev.software_assignment_id
        : filteredAssignments.length === 1
        ? String(filteredAssignments[0].id)
        : "";

      if (nextAssignmentId === prev.software_assignment_id) {
        return prev;
      }

      return {
        ...prev,
        software_assignment_id: nextAssignmentId,
      };
    });
  }, [filteredAssignments, isOpen]);

  useEffect(() => {
    if (
      !isOpen ||
      form.allocation_basis !== "ASSIGNMENT" ||
      !form.software_assignment_id
    ) {
      return;
    }

    const assignment =
      filteredAssignments.find(
        (item) => Number(item.id) === Number(form.software_assignment_id)
      ) ?? null;

    if (!assignment) return;

    if (
      Number(form.software_installation_id) !==
      Number(assignment.software_installation_id)
    ) {
      setForm((prev) => ({
        ...prev,
        software_installation_id: String(assignment.software_installation_id),
      }));
    }
  }, [
    filteredAssignments,
    form.allocation_basis,
    form.software_assignment_id,
    form.software_installation_id,
    isOpen,
  ]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleBasisChange = useCallback((basis: AllocationBasis) => {
    setForm((prev) => ({
      ...prev,
      allocation_basis: basis,
      software_installation_id: "",
      software_assignment_id: "",
    }));
  }, []);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!entitlement || !summary) return;

      setSaving(true);
      setErr(null);

      try {
        if (!entitlementActive) {
          throw new Error("Entitlement must be ACTIVE before creating allocation.");
        }

        if (!form.asset_id) {
          throw new Error("Asset is required.");
        }

        const qty = Number(form.allocated_quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error("Allocated quantity must be a positive integer.");
        }

        if (qty > remainingQuantity) {
          throw new Error(
            `Allocated quantity cannot exceed remaining quantity (${remainingQuantity}).`
          );
        }

        const body: any = {
          asset_id: Number(form.asset_id),
          allocation_basis: form.allocation_basis,
          allocated_quantity: qty,
          status: "ACTIVE",
          allocated_at: toNullableText(form.allocated_at),
          notes: toNullableText(form.notes),
        };

        if (form.allocation_basis === "INSTALLATION") {
          if (!form.software_installation_id) {
            throw new Error("Software installation is required.");
          }
          body.software_installation_id = Number(form.software_installation_id);
        }

        if (form.allocation_basis === "ASSIGNMENT") {
          if (!form.software_assignment_id) {
            throw new Error("Software assignment is required.");
          }

          const assignment = filteredAssignments.find(
            (item) => Number(item.id) === Number(form.software_assignment_id)
          );

          if (!assignment) {
            throw new Error("Selected software assignment is not valid.");
          }

          body.software_assignment_id = Number(assignment.id);
          body.software_installation_id = Number(assignment.software_installation_id);
        }

        await apiPostJson(
          `/api/v1/software-entitlements/${entitlement.id}/allocations`,
          body
        );

        setForm((prev) => ({
          ...DEFAULT_FORM,
          asset_id: prev.asset_id,
          allocation_basis: prev.allocation_basis,
          allocated_at: todayIsoDate(),
        }));

        await loadAllocations();
        await onChanged?.();
      } catch (e: any) {
        setErr(e?.message || "Failed to create allocation.");
      } finally {
        setSaving(false);
      }
    },
    [
      entitlement,
      entitlementActive,
      filteredAssignments,
      form,
      loadAllocations,
      onChanged,
      remainingQuantity,
      summary,
    ]
  );

  const handleRelease = useCallback(
    async (item: AllocationItem) => {
      setReleasingId(item.id);
      setErr(null);

      try {
        await apiPatchJson(
          `/api/v1/software-entitlements/${item.software_entitlement_id}/allocations/${item.id}`,
          {
            status: "RELEASED",
            released_at: todayIsoDate(),
            notes: item.notes || "Released from allocation",
          }
        );

        await loadAllocations();
        await onChanged?.();
      } catch (e: any) {
        setErr(e?.message || "Failed to release allocation.");
      } finally {
        setReleasingId(null);
      }
    },
    [loadAllocations, onChanged]
  );

  if (!isOpen || !entitlement) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="mx-auto my-8 w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Manage Entitlement Allocations
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {entitlement.entitlement_code} -{" "}
              {entitlement.entitlement_name || entitlement.software_product_name}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Product: {entitlement.software_product_code} -{" "}
              {entitlement.software_product_name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            disabled={saving || releasingId !== null}
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto">
          {summary ? (
            <div className="grid grid-cols-1 gap-4 border-b border-gray-200 px-6 py-4 md:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Purchased
                </div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {summary.quantity_purchased}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Allocated Active
                </div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {summary.allocated_quantity_active}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Remaining
                </div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {summary.remaining_quantity}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium uppercase text-gray-500">
                  Entitlement Status
                </div>
                <div className="mt-2 text-lg font-semibold text-gray-900">
                  {summary.entitlement_status}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 px-6 py-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Create Allocation
                  </h4>
                  <p className="mt-1 text-xs text-gray-500">
                    Allocate this entitlement to an asset, installation, or assignment.
                  </p>
                </div>

                <form onSubmit={handleCreate} className="space-y-4 p-4">
                  {err ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {err}
                    </div>
                  ) : null}

                  {!entitlementActive ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      This entitlement is not ACTIVE. Allocation creation is disabled
                      until the entitlement status becomes ACTIVE.
                    </div>
                  ) : null}

                  {summary && summary.remaining_quantity <= 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Remaining quantity is 0. Release an existing allocation or increase
                      purchased quantity before creating a new allocation.
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Asset
                    </label>
                    <select
                      value={form.asset_id}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          asset_id: e.target.value,
                          software_installation_id: "",
                          software_assignment_id: "",
                        }))
                      }
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    >
                      <option value="">
                        {contractAssets.length
                          ? "Select asset"
                          : "No related asset available"}
                      </option>
                      {contractAssets.map((asset) => (
                        <option key={asset.id} value={String(asset.id)}>
                          {asset.asset_tag} - {asset.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Asset targets are sourced from Contract Assets.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Allocation Basis
                    </label>
                    <select
                      value={form.allocation_basis}
                      onChange={(e) =>
                        handleBasisChange(e.target.value as AllocationBasis)
                      }
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    >
                      <option value="INSTALLATION">INSTALLATION</option>
                      <option value="ASSIGNMENT">ASSIGNMENT</option>
                      <option value="ASSET">ASSET</option>
                      <option value="MANUAL">MANUAL</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">{basisHelpText}</p>
                  </div>

                  {selectedAsset ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                      <div className="font-medium text-gray-800">
                        Selected Asset
                      </div>
                      <div className="mt-1">
                        {selectedAsset.asset_tag} - {selectedAsset.name}
                      </div>
                      <div className="mt-1">
                        Asset status: {selectedAsset.status || "-"}
                      </div>
                    </div>
                  ) : null}

                  {(form.allocation_basis === "INSTALLATION" ||
                    form.allocation_basis === "ASSIGNMENT") && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Software Installation
                      </label>
                      <select
                        value={form.software_installation_id}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            software_installation_id: e.target.value,
                            software_assignment_id:
                              prev.allocation_basis === "ASSIGNMENT" ? "" : prev.software_assignment_id,
                          }))
                        }
                        disabled={saving || loadingTargets || !form.asset_id}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                      >
                        <option value="">
                          {loadingTargets
                            ? "Loading installations..."
                            : filteredInstallations.length
                            ? filteredInstallations.length === 1
                              ? "Auto-selected installation available"
                              : "Select installation"
                            : "No active installation available"}
                        </option>
                        {filteredInstallations.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.software_product_code} - {item.software_product_name}
                            {item.installed_version ? ` (${item.installed_version})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Only active installations matching this entitlement product are listed.
                      </p>
                    </div>
                  )}

                  {form.allocation_basis === "ASSIGNMENT" && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Software Assignment
                      </label>
                      <select
                        value={form.software_assignment_id}
                        onChange={(e) => setField("software_assignment_id", e.target.value)}
                        disabled={saving || loadingTargets || !form.asset_id}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                      >
                        <option value="">
                          {loadingTargets
                            ? "Loading assignments..."
                            : filteredAssignments.length
                            ? filteredAssignments.length === 1
                              ? "Auto-selected assignment available"
                              : "Select assignment"
                            : "No ACTIVE assignment available"}
                        </option>
                        {filteredAssignments.map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            {item.identity_code ? `${item.identity_code} - ` : ""}
                            {item.identity_display_name} ({item.assignment_role})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Only ACTIVE assignments linked to the selected installation are listed.
                      </p>
                    </div>
                  )}

                  {selectedInstallation ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                      <div className="font-medium text-gray-800">
                        Selected Installation
                      </div>
                      <div className="mt-1">
                        {selectedInstallation.software_product_code} -{" "}
                        {selectedInstallation.software_product_name}
                        {selectedInstallation.installed_version
                          ? ` (${selectedInstallation.installed_version})`
                          : ""}
                      </div>
                      <div className="mt-1">
                        Installation status: {selectedInstallation.installation_status}
                      </div>
                    </div>
                  ) : null}

                  {selectedAssignment ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                      <div className="font-medium text-gray-800">
                        Selected Assignment
                      </div>
                      <div className="mt-1">
                        {selectedAssignment.identity_code
                          ? `${selectedAssignment.identity_code} - `
                          : ""}
                        {selectedAssignment.identity_display_name}
                      </div>
                      <div className="mt-1">
                        Role: {selectedAssignment.assignment_role}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Allocated Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.allocated_quantity}
                      onChange={(e) => setField("allocated_quantity", e.target.value)}
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                    {summary ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Remaining quantity available: {summary.remaining_quantity}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Allocated At
                    </label>
                    <input
                      type="date"
                      value={form.allocated_at}
                      onChange={(e) => setField("allocated_at", e.target.value)}
                      disabled={saving}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                      disabled={saving}
                      rows={4}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>

                  {createBlockedReason ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {createBlockedReason}
                    </div>
                  ) : null}

                  <div className="flex justify-end border-t border-gray-200 pt-4">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="itam-primary-action"
                    >
                      {saving ? "Saving..." : "Create Allocation"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Existing Allocations
                  </h4>
                  <p className="mt-1 text-xs text-gray-500">
                    Allocation history for this entitlement.
                  </p>
                </div>

                {loading ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    Loading allocations...
                  </div>
                ) : allocations.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-gray-500">
                    No allocation found for this entitlement.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                          <th className="px-4 py-3 font-medium">Asset / Target</th>
                          <th className="px-4 py-3 font-medium">Basis</th>
                          <th className="px-4 py-3 font-medium">Quantity</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Dates</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {allocations.map((item) => (
                          <tr key={item.id} className="align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {item.asset_tag} - {item.asset_name}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {item.software_assignment_id
                                  ? `${item.identity_display_name || "-"} (${item.assignment_role || "-"})`
                                  : item.software_installation_id
                                  ? `Installation ${item.software_installation_id}${
                                      item.software_installation_version
                                        ? ` • ${item.software_installation_version}`
                                        : ""
                                    }`
                                  : "Direct asset allocation"}
                              </div>
                            </td>

                            <td className="px-4 py-3 text-gray-700">
                              {item.allocation_basis}
                            </td>

                            <td className="px-4 py-3 text-gray-700">
                              {item.allocated_quantity}
                            </td>

                            <td className="px-4 py-3">
                              <span className={allocationStatusClass(item.status)}>
                                {item.status}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-gray-700">
                              <div>Allocated: {formatDate(item.allocated_at)}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                Released: {formatDate(item.released_at)}
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              {item.status !== "RELEASED" ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRelease(item)}
                                  disabled={releasingId === item.id}
                                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {releasingId === item.id ? "Processing..." : "Release"}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">No action</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatchJson, apiPostJson } from "@/app/lib/api";
import ConfirmDangerDialog from "@/app/components/ConfirmDangerDialog";
import ActionToast from "@/app/components/ActionToast";
import SoftwareEntitlementAllocationsModal from "./SoftwareEntitlementAllocationsModal";

type EntitlementStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

type LicensingMetric =
  | "SUBSCRIPTION"
  | "PER_USER"
  | "PER_DEVICE"
  | "PER_NAMED_USER"
  | "PER_CONCURRENT_USER"
  | "PER_CORE"
  | "PER_PROCESSOR"
  | "SITE"
  | "ENTERPRISE"
  | "OTHER";

type ComplianceRiskStatus =
  | "OK"
  | "FULLY_ALLOCATED"
  | "OVER_ALLOCATED"
  | "INACTIVE_ENTITLEMENT"
  | "EXPIRED_ENTITLEMENT";

type ConsumptionStatus =
  | "NO_ACTIVITY"
  | "UNDER_CONSUMED"
  | "BALANCED"
  | "POTENTIAL_OVERUSE"
  | "INACTIVE_ENTITLEMENT"
  | "EXPIRED_ENTITLEMENT";

type ConsumptionBasis = "ASSIGNMENT" | "INSTALLATION";

type SoftwareProductOption = {
  id: number;
  product_code: string;
  product_name: string;
  publisher_vendor_name: string | null;
  status?: string | null;
};

type SoftwareEntitlementItem = {
  id: number;
  tenant_id: number;
  contract_id: number;
  software_product_id: number;
  entitlement_code: string;
  entitlement_name: string | null;
  licensing_metric: LicensingMetric;
  quantity_purchased: number;
  start_date: string | null;
  end_date: string | null;
  status: EntitlementStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;

  contract_code?: string | null;
  contract_name?: string | null;
  contract_type?: string | null;
  contract_status?: string | null;

  software_product_code: string;
  software_product_name: string;
  software_product_category?: string | null;
  software_product_deployment_model?: string | null;
  software_product_default_licensing_metric?: string | null;
  software_product_status?: string | null;
  software_product_version_policy?: string | null;

  publisher_vendor_id?: number | null;
  publisher_vendor_code?: string | null;
  publisher_vendor_name?: string | null;
};

type ComplianceSummaryTotals = {
  entitlements_count: number;
  quantity_purchased: number;
  allocated_active: number;
  remaining_quantity: number;
  status_counts: Record<ComplianceRiskStatus, number>;
};

type ComplianceSummaryItem = {
  entitlement_id: number;
  contract_id: number;
  entitlement_code: string;
  entitlement_name: string | null;
  entitlement_status: string;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  licensing_metric: string | null;
  quantity_purchased: number;
  allocated_active: number;
  remaining_quantity: number;
  active_installation_count: number;
  active_assignment_count: number;
  risk_status: ComplianceRiskStatus;
  is_entitlement_active: boolean;
  is_entitlement_expired: boolean;
  start_date: string | null;
  end_date: string | null;
};

type ComplianceSummaryData = {
  contract: {
    id: number;
    contract_code: string;
    contract_name: string;
    contract_type: string | null;
    status: string | null;
    vendor_id: number | null;
    vendor_code: string | null;
    vendor_name: string | null;
  } | null;
  totals: ComplianceSummaryTotals;
  items: ComplianceSummaryItem[];
  total: number;
};

type ConsumptionSummaryTotals = {
  entitlements_count: number;
  quantity_purchased: number;
  allocated_active: number;
  consumed_quantity_usage: number;
  elp_by_allocation: number;
  elp_by_usage: number;
  status_counts: Record<ConsumptionStatus, number>;
};

type ConsumptionSummaryItem = {
  entitlement_id: number;
  contract_id: number;
  entitlement_code: string;
  entitlement_name: string | null;
  entitlement_status: string;
  software_product_id: number;
  software_product_code: string;
  software_product_name: string;
  licensing_metric: string | null;
  quantity_purchased: number;
  allocated_active: number;
  active_installation_count: number;
  active_assignment_count: number;
  consumption_basis: ConsumptionBasis;
  consumed_quantity_usage: number;
  elp_by_allocation: number;
  elp_by_usage: number;
  allocation_usage_variance: number;
  consumption_status: ConsumptionStatus;
  is_entitlement_active: boolean;
  is_entitlement_expired: boolean;
  start_date: string | null;
  end_date: string | null;
};

type ConsumptionSummaryData = {
  contract: {
    id: number;
    contract_code: string;
    contract_name: string;
    contract_type: string | null;
    status: string | null;
    vendor_id: number | null;
    vendor_code: string | null;
    vendor_name: string | null;
  } | null;
  totals: ConsumptionSummaryTotals;
  items: ConsumptionSummaryItem[];
  total: number;
};

type Props = {
  contractId: number | string;
  canEdit?: boolean;
};

type FormState = {
  software_product_id: string;
  entitlement_code: string;
  entitlement_name: string;
  licensing_metric: LicensingMetric;
  quantity_purchased: string;
  start_date: string;
  end_date: string;
  status: EntitlementStatus;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  software_product_id: "",
  entitlement_code: "",
  entitlement_name: "",
  licensing_metric: "PER_USER",
  quantity_purchased: "0",
  start_date: "",
  end_date: "",
  status: "ACTIVE",
  notes: "",
};

const LICENSING_METRIC_OPTIONS: LicensingMetric[] = [
  "SUBSCRIPTION",
  "PER_USER",
  "PER_DEVICE",
  "PER_NAMED_USER",
  "PER_CONCURRENT_USER",
  "PER_CORE",
  "PER_PROCESSOR",
  "SITE",
  "ENTERPRISE",
  "OTHER",
];

const STATUS_OPTIONS: EntitlementStatus[] = ["ACTIVE", "INACTIVE", "EXPIRED"];

function emptyComplianceSummary(): ComplianceSummaryData {
  return {
    contract: null,
    totals: {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      remaining_quantity: 0,
      status_counts: {
        OK: 0,
        FULLY_ALLOCATED: 0,
        OVER_ALLOCATED: 0,
        INACTIVE_ENTITLEMENT: 0,
        EXPIRED_ENTITLEMENT: 0,
      },
    },
    items: [],
    total: 0,
  };
}

function emptyConsumptionSummary(): ConsumptionSummaryData {
  return {
    contract: null,
    totals: {
      entitlements_count: 0,
      quantity_purchased: 0,
      allocated_active: 0,
      consumed_quantity_usage: 0,
      elp_by_allocation: 0,
      elp_by_usage: 0,
      status_counts: {
        NO_ACTIVITY: 0,
        UNDER_CONSUMED: 0,
        BALANCED: 0,
        POTENTIAL_OVERUSE: 0,
        INACTIVE_ENTITLEMENT: 0,
        EXPIRED_ENTITLEMENT: 0,
      },
    },
    items: [],
    total: 0,
  };
}

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

function toNullableText(value: string): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return String(value).slice(0, 10) || "-";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function formatInteger(value: number | null | undefined, fallback = "-"): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toLocaleString();
}

function normalizeProduct(item: any): SoftwareProductOption {
  return {
    id: Number(item?.id ?? 0),
    product_code: String(item?.product_code ?? ""),
    product_name: String(item?.product_name ?? ""),
    publisher_vendor_name: item?.publisher_vendor_name
      ? String(item.publisher_vendor_name)
      : null,
    status: item?.status ? String(item.status) : null,
  };
}

function normalizeEntitlement(item: any): SoftwareEntitlementItem {
  return {
    id: Number(item?.id ?? 0),
    tenant_id: Number(item?.tenant_id ?? 0),
    contract_id: Number(item?.contract_id ?? 0),
    software_product_id: Number(item?.software_product_id ?? 0),
    entitlement_code: String(item?.entitlement_code ?? ""),
    entitlement_name: item?.entitlement_name ? String(item.entitlement_name) : null,
    licensing_metric: String(
      item?.licensing_metric ?? "OTHER"
    ).toUpperCase() as LicensingMetric,
    quantity_purchased: Number(item?.quantity_purchased ?? 0),
    start_date: item?.start_date ? String(item.start_date) : null,
    end_date: item?.end_date ? String(item.end_date) : null,
    status: String(item?.status ?? "ACTIVE").toUpperCase() as EntitlementStatus,
    notes: item?.notes ? String(item.notes) : null,
    created_at: String(item?.created_at ?? ""),
    updated_at: String(item?.updated_at ?? ""),

    contract_code: item?.contract_code ? String(item.contract_code) : null,
    contract_name: item?.contract_name ? String(item.contract_name) : null,
    contract_type: item?.contract_type ? String(item.contract_type) : null,
    contract_status: item?.contract_status ? String(item.contract_status) : null,

    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    software_product_category: item?.software_product_category
      ? String(item.software_product_category)
      : null,
    software_product_deployment_model: item?.software_product_deployment_model
      ? String(item.software_product_deployment_model)
      : null,
    software_product_default_licensing_metric:
      item?.software_product_default_licensing_metric
        ? String(item.software_product_default_licensing_metric)
        : null,
    software_product_status: item?.software_product_status
      ? String(item.software_product_status)
      : null,
    software_product_version_policy: item?.software_product_version_policy
      ? String(item.software_product_version_policy)
      : null,

    publisher_vendor_id:
      item?.publisher_vendor_id == null ? null : Number(item.publisher_vendor_id),
    publisher_vendor_code: item?.publisher_vendor_code
      ? String(item.publisher_vendor_code)
      : null,
    publisher_vendor_name: item?.publisher_vendor_name
      ? String(item.publisher_vendor_name)
      : null,
  };
}

function normalizeComplianceSummaryItem(item: any): ComplianceSummaryItem {
  return {
    entitlement_id: Number(item?.entitlement_id ?? 0),
    contract_id: Number(item?.contract_id ?? 0),
    entitlement_code: String(item?.entitlement_code ?? ""),
    entitlement_name: item?.entitlement_name ? String(item.entitlement_name) : null,
    entitlement_status: String(item?.entitlement_status ?? ""),
    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    licensing_metric: item?.licensing_metric ? String(item.licensing_metric) : null,
    quantity_purchased: Number(item?.quantity_purchased ?? 0),
    allocated_active: Number(item?.allocated_active ?? 0),
    remaining_quantity: Number(item?.remaining_quantity ?? 0),
    active_installation_count: Number(item?.active_installation_count ?? 0),
    active_assignment_count: Number(item?.active_assignment_count ?? 0),
    risk_status: String(item?.risk_status ?? "OK").toUpperCase() as ComplianceRiskStatus,
    is_entitlement_active: Boolean(item?.is_entitlement_active),
    is_entitlement_expired: Boolean(item?.is_entitlement_expired),
    start_date: item?.start_date ? String(item.start_date) : null,
    end_date: item?.end_date ? String(item.end_date) : null,
  };
}

function normalizeConsumptionSummaryItem(item: any): ConsumptionSummaryItem {
  return {
    entitlement_id: Number(item?.entitlement_id ?? 0),
    contract_id: Number(item?.contract_id ?? 0),
    entitlement_code: String(item?.entitlement_code ?? ""),
    entitlement_name: item?.entitlement_name ? String(item.entitlement_name) : null,
    entitlement_status: String(item?.entitlement_status ?? ""),
    software_product_id: Number(item?.software_product_id ?? 0),
    software_product_code: String(item?.software_product_code ?? ""),
    software_product_name: String(item?.software_product_name ?? ""),
    licensing_metric: item?.licensing_metric ? String(item.licensing_metric) : null,
    quantity_purchased: Number(item?.quantity_purchased ?? 0),
    allocated_active: Number(item?.allocated_active ?? 0),
    active_installation_count: Number(item?.active_installation_count ?? 0),
    active_assignment_count: Number(item?.active_assignment_count ?? 0),
    consumption_basis: String(
      item?.consumption_basis ?? "INSTALLATION"
    ).toUpperCase() as ConsumptionBasis,
    consumed_quantity_usage: Number(item?.consumed_quantity_usage ?? 0),
    elp_by_allocation: Number(item?.elp_by_allocation ?? 0),
    elp_by_usage: Number(item?.elp_by_usage ?? 0),
    allocation_usage_variance: Number(item?.allocation_usage_variance ?? 0),
    consumption_status: String(
      item?.consumption_status ?? "NO_ACTIVITY"
    ).toUpperCase() as ConsumptionStatus,
    is_entitlement_active: Boolean(item?.is_entitlement_active),
    is_entitlement_expired: Boolean(item?.is_entitlement_expired),
    start_date: item?.start_date ? String(item.start_date) : null,
    end_date: item?.end_date ? String(item.end_date) : null,
  };
}

function normalizeComplianceSummary(payload: any): ComplianceSummaryData {
  const root = unwrapData<any>(payload) ?? {};
  const totals = root?.totals ?? {};
  const rawItems = Array.isArray(root?.items) ? root.items : [];
  const normalized = emptyComplianceSummary();

  normalized.contract = root?.contract
    ? {
        id: Number(root.contract.id ?? 0),
        contract_code: String(root.contract.contract_code ?? ""),
        contract_name: String(root.contract.contract_name ?? ""),
        contract_type: root.contract.contract_type
          ? String(root.contract.contract_type)
          : null,
        status: root.contract.status ? String(root.contract.status) : null,
        vendor_id:
          root.contract.vendor_id == null ? null : Number(root.contract.vendor_id),
        vendor_code: root.contract.vendor_code
          ? String(root.contract.vendor_code)
          : null,
        vendor_name: root.contract.vendor_name
          ? String(root.contract.vendor_name)
          : null,
      }
    : null;

  normalized.totals = {
    entitlements_count: Number(totals?.entitlements_count ?? 0),
    quantity_purchased: Number(totals?.quantity_purchased ?? 0),
    allocated_active: Number(totals?.allocated_active ?? 0),
    remaining_quantity: Number(totals?.remaining_quantity ?? 0),
    status_counts: {
      OK: Number(totals?.status_counts?.OK ?? 0),
      FULLY_ALLOCATED: Number(totals?.status_counts?.FULLY_ALLOCATED ?? 0),
      OVER_ALLOCATED: Number(totals?.status_counts?.OVER_ALLOCATED ?? 0),
      INACTIVE_ENTITLEMENT: Number(
        totals?.status_counts?.INACTIVE_ENTITLEMENT ?? 0
      ),
      EXPIRED_ENTITLEMENT: Number(
        totals?.status_counts?.EXPIRED_ENTITLEMENT ?? 0
      ),
    },
  };

  normalized.items = rawItems.map(normalizeComplianceSummaryItem);
  normalized.total = Number(root?.total ?? normalized.items.length);

  return normalized;
}

function normalizeConsumptionSummary(payload: any): ConsumptionSummaryData {
  const root = unwrapData<any>(payload) ?? {};
  const totals = root?.totals ?? {};
  const rawItems = Array.isArray(root?.items) ? root.items : [];
  const normalized = emptyConsumptionSummary();

  normalized.contract = root?.contract
    ? {
        id: Number(root.contract.id ?? 0),
        contract_code: String(root.contract.contract_code ?? ""),
        contract_name: String(root.contract.contract_name ?? ""),
        contract_type: root.contract.contract_type
          ? String(root.contract.contract_type)
          : null,
        status: root.contract.status ? String(root.contract.status) : null,
        vendor_id:
          root.contract.vendor_id == null ? null : Number(root.contract.vendor_id),
        vendor_code: root.contract.vendor_code
          ? String(root.contract.vendor_code)
          : null,
        vendor_name: root.contract.vendor_name
          ? String(root.contract.vendor_name)
          : null,
      }
    : null;

  normalized.totals = {
    entitlements_count: Number(totals?.entitlements_count ?? 0),
    quantity_purchased: Number(totals?.quantity_purchased ?? 0),
    allocated_active: Number(totals?.allocated_active ?? 0),
    consumed_quantity_usage: Number(totals?.consumed_quantity_usage ?? 0),
    elp_by_allocation: Number(totals?.elp_by_allocation ?? 0),
    elp_by_usage: Number(totals?.elp_by_usage ?? 0),
    status_counts: {
      NO_ACTIVITY: Number(totals?.status_counts?.NO_ACTIVITY ?? 0),
      UNDER_CONSUMED: Number(totals?.status_counts?.UNDER_CONSUMED ?? 0),
      BALANCED: Number(totals?.status_counts?.BALANCED ?? 0),
      POTENTIAL_OVERUSE: Number(totals?.status_counts?.POTENTIAL_OVERUSE ?? 0),
      INACTIVE_ENTITLEMENT: Number(
        totals?.status_counts?.INACTIVE_ENTITLEMENT ?? 0
      ),
      EXPIRED_ENTITLEMENT: Number(
        totals?.status_counts?.EXPIRED_ENTITLEMENT ?? 0
      ),
    },
  };

  normalized.items = rawItems.map(normalizeConsumptionSummaryItem);
  normalized.total = Number(root?.total ?? normalized.items.length);

  return normalized;
}

function entitlementStatusPillClass(status: string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "ACTIVE") {
    return "inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700";
  }
  if (s === "INACTIVE") {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
  }
  if (s === "EXPIRED") {
    return "inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700";
  }

  return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
}

function complianceRiskPillClass(status: ComplianceRiskStatus | string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "OK") {
    return "inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700";
  }
  if (s === "FULLY_ALLOCATED") {
    return "inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800";
  }
  if (s === "OVER_ALLOCATED") {
    return "inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700";
  }
  if (s === "INACTIVE_ENTITLEMENT") {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
  }
  if (s === "EXPIRED_ENTITLEMENT") {
    return "inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700";
  }

  return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
}

function complianceRiskLabel(status: ComplianceRiskStatus | string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "FULLY_ALLOCATED") return "Fully Allocated";
  if (s === "OVER_ALLOCATED") return "Over Allocated";
  if (s === "INACTIVE_ENTITLEMENT") return "Inactive Entitlement";
  if (s === "EXPIRED_ENTITLEMENT") return "Expired Entitlement";
  return "OK";
}

function consumptionStatusPillClass(status: ConsumptionStatus | string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "NO_ACTIVITY") {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
  }
  if (s === "UNDER_CONSUMED") {
    return "inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700";
  }
  if (s === "BALANCED") {
    return "inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700";
  }
  if (s === "POTENTIAL_OVERUSE") {
    return "inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700";
  }
  if (s === "INACTIVE_ENTITLEMENT") {
    return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
  }
  if (s === "EXPIRED_ENTITLEMENT") {
    return "inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700";
  }

  return "inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700";
}

function consumptionStatusLabel(status: ConsumptionStatus | string) {
  const s = String(status ?? "").toUpperCase();

  if (s === "NO_ACTIVITY") return "No Activity";
  if (s === "UNDER_CONSUMED") return "Under Consumed";
  if (s === "BALANCED") return "Balanced";
  if (s === "POTENTIAL_OVERUSE") return "Potential Overuse";
  if (s === "INACTIVE_ENTITLEMENT") return "Inactive Entitlement";
  if (s === "EXPIRED_ENTITLEMENT") return "Expired Entitlement";
  return "-";
}

function formatSignedInteger(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (n > 0) return `+${n.toLocaleString()}`;
  return n.toLocaleString();
}

export default function SoftwareEntitlementsPanel({
  contractId,
  canEdit = true,
}: Props) {
  const [items, setItems] = useState<SoftwareEntitlementItem[]>([]);
  const [products, setProducts] = useState<SoftwareProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<ComplianceSummaryData>(
    emptyComplianceSummary()
  );
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [consumption, setConsumption] = useState<ConsumptionSummaryData>(
    emptyConsumptionSummary()
  );
  const [consumptionLoading, setConsumptionLoading] = useState(true);
  const [consumptionErr, setConsumptionErr] = useState<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<SoftwareEntitlementItem | null>(
    null
  );
  const [selectedEntitlement, setSelectedEntitlement] =
    useState<SoftwareEntitlementItem | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SoftwareEntitlementItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const normalizedContractId = useMemo(() => String(contractId), [contractId]);

  const activeProducts = useMemo(() => {
    return products.filter((item) => {
      if (!item.status) return true;
      return String(item.status).toUpperCase() === "ACTIVE";
    });
  }, [products]);

  const summaryByEntitlementId = useMemo(() => {
    return new Map(
      (summary?.items ?? []).map((item) => [Number(item.entitlement_id), item])
    );
  }, [summary]);

  const consumptionByEntitlementId = useMemo(() => {
    return new Map(
      (consumption?.items ?? []).map((item) => [Number(item.entitlement_id), item])
    );
  }, [consumption]);

  const loadEntitlements = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/contracts/${encodeURIComponent(
          normalizedContractId
        )}/software-entitlements`
      );
      const rows = extractItems(payload).map(normalizeEntitlement);
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message || "Failed to load software entitlements.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedContractId]);

  const loadComplianceSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/contracts/${encodeURIComponent(
          normalizedContractId
        )}/software-compliance-summary`
      );
      setSummary(normalizeComplianceSummary(payload));
    } catch (e: any) {
      setSummary(emptyComplianceSummary());
      setSummaryErr(e?.message || "Failed to load software compliance summary.");
    } finally {
      setSummaryLoading(false);
    }
  }, [normalizedContractId]);

  const loadConsumptionSummary = useCallback(async () => {
    setConsumptionLoading(true);
    setConsumptionErr(null);

    try {
      const payload = await apiGet(
        `/api/v1/contracts/${encodeURIComponent(
          normalizedContractId
        )}/software-consumption-summary`
      );
      setConsumption(normalizeConsumptionSummary(payload));
    } catch (e: any) {
      setConsumption(emptyConsumptionSummary());
      setConsumptionErr(e?.message || "Failed to load software consumption summary.");
    } finally {
      setConsumptionLoading(false);
    }
  }, [normalizedContractId]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setModalErr(null);

    try {
      const payload = await apiGet(`/api/v1/software-products?page=1&page_size=100`);
      const rows = extractItems(payload).map(normalizeProduct);
      setProducts(rows);
    } catch (e: any) {
      setModalErr(e?.message || "Failed to load software products.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void loadEntitlements();
    void loadComplianceSummary();
    void loadConsumptionSummary();
  }, [loadComplianceSummary, loadConsumptionSummary, loadEntitlements]);

  const refreshPanel = useCallback(async () => {
    await Promise.all([
      loadEntitlements(),
      loadComplianceSummary(),
      loadConsumptionSummary(),
    ]);
  }, [loadComplianceSummary, loadConsumptionSummary, loadEntitlements]);

  const openDeleteConfirm = useCallback((item: SoftwareEntitlementItem) => {
    setDeleteTarget(item);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    if (deleteLoading) return;
    setDeleteTarget(null);
  }, [deleteLoading]);

  const confirmDeleteEntitlement = useCallback(async () => {
    if (!deleteTarget || deleteLoading) return;

    setDeleteLoading(true);
    setErr(null);
    setSummaryErr(null);
    setConsumptionErr(null);

    try {
      await apiDelete(
        `/api/v1/contracts/${encodeURIComponent(normalizedContractId)}/software-entitlements/${deleteTarget.id}`
      );
      setDeleteTarget(null);
      setToast({
        type: "success",
        message: "Software entitlement deleted.",
      });
      await refreshPanel();
    } catch (e: any) {
      if (e?.code === "SOFTWARE_ENTITLEMENT_IN_USE") {
        setToast({
          type: "error",
          message: "Software entitlement masih dipakai oleh allocation.",
        });
      } else {
        setToast({
          type: "error",
          message: e?.message || "Failed to delete software entitlement.",
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteLoading, deleteTarget, normalizedContractId, refreshPanel]);

  const openCreateModal = useCallback(async () => {
    setMode("create");
    setEditingItem(null);
    setForm({
      ...DEFAULT_FORM,
      quantity_purchased: "0",
      status: "ACTIVE",
      licensing_metric: "PER_USER",
    });
    setModalErr(null);
    setIsOpen(true);

    if (products.length === 0) {
      await loadProducts();
    }
  }, [loadProducts, products.length]);

  const openEditModal = useCallback(
    async (item: SoftwareEntitlementItem) => {
      setMode("edit");
      setEditingItem(item);
      setForm({
        software_product_id: String(item.software_product_id),
        entitlement_code: item.entitlement_code ?? "",
        entitlement_name: item.entitlement_name ?? "",
        licensing_metric: item.licensing_metric,
        quantity_purchased: String(item.quantity_purchased ?? 0),
        start_date: item.start_date ? String(item.start_date).slice(0, 10) : "",
        end_date: item.end_date ? String(item.end_date).slice(0, 10) : "",
        status: item.status,
        notes: item.notes ?? "",
      });
      setModalErr(null);
      setIsOpen(true);

      if (products.length === 0) {
        await loadProducts();
      }
    },
    [loadProducts, products.length]
  );

  const openAllocationsModal = useCallback((item: SoftwareEntitlementItem) => {
    setSelectedEntitlement(item);
    setAllocationModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setIsOpen(false);
    setEditingItem(null);
    setModalErr(null);
    setForm(DEFAULT_FORM);
  }, [saving]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setModalErr(null);

      try {
        if (!form.software_product_id) {
          throw new Error("Software product is required.");
        }

        const quantity = Number(form.quantity_purchased);
        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error("Quantity purchased must be a non-negative integer.");
        }

        const body = {
          software_product_id: Number(form.software_product_id),
          entitlement_code: String(form.entitlement_code || "").trim().toUpperCase(),
          entitlement_name: toNullableText(form.entitlement_name),
          licensing_metric: form.licensing_metric,
          quantity_purchased: quantity,
          start_date: toNullableText(form.start_date),
          end_date: toNullableText(form.end_date),
          status: form.status,
          notes: toNullableText(form.notes),
        };

        if (!body.entitlement_code) {
          throw new Error("Entitlement code is required.");
        }

        if (mode === "create") {
          await apiPostJson(
            `/api/v1/contracts/${encodeURIComponent(
              normalizedContractId
            )}/software-entitlements`,
            body
          );
        } else {
          if (!editingItem) {
            throw new Error("Entitlement data is missing.");
          }

          await apiPatchJson(
            `/api/v1/contracts/${encodeURIComponent(
              normalizedContractId
            )}/software-entitlements/${editingItem.id}`,
            body
          );
        }

        setIsOpen(false);
        setEditingItem(null);
        setForm(DEFAULT_FORM);
        await refreshPanel();
      } catch (e: any) {
        setModalErr(e?.message || "Failed to save software entitlement.");
      } finally {
        setSaving(false);
      }
    },
    [editingItem, form, mode, normalizedContractId, refreshPanel]
  );

  return (
  <>
    <ActionToast
      open={Boolean(toast)}
      type={toast?.type || "success"}
      message={toast?.message || ""}
      onClose={() => setToast(null)}
    />
    <ConfirmDangerDialog
      open={Boolean(deleteTarget)}
      title="Delete software entitlement"
      description={`Software entitlement ${deleteTarget?.entitlement_code || deleteTarget?.entitlement_name || ""} akan dihapus permanen jika tidak sedang dipakai oleh allocation.`}
      confirmLabel="Delete Entitlement"
      loading={deleteLoading}
      onCancel={closeDeleteConfirm}
      onConfirm={() => void confirmDeleteEntitlement()}
    />
    <section className="rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Software Entitlements
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            License ownership and entitlement lines recorded under this contract.
          </p>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={() => void openCreateModal()}
            className="itam-secondary-action"
            disabled={loading}
          >
            Add Entitlement
          </button>
        ) : null}
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {summaryErr ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {summaryErr}
        </div>
      ) : null}

      {consumptionErr ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {consumptionErr}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Entitlements
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.entitlements_count, "0")}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Purchased Quantity
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.quantity_purchased, "0")}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Allocated Active
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.allocated_active, "0")}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Remaining Quantity
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.remaining_quantity, "0")}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">
          Compliance Breakdown
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
            OK:{" "}
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.status_counts.OK, "0")}
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
            Fully Allocated:{" "}
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.status_counts.FULLY_ALLOCATED, "0")}
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
            Over Allocated:{" "}
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.status_counts.OVER_ALLOCATED, "0")}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
            Inactive:{" "}
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.status_counts.INACTIVE_ENTITLEMENT, "0")}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
            Expired:{" "}
            {summaryLoading
              ? "..."
              : formatInteger(summary.totals.status_counts.EXPIRED_ENTITLEMENT, "0")}
          </span>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Official compliance status is based on entitlement quantity versus active allocations.
          Installation and assignment counts are supporting indicators.
        </p>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-6">
        <h3 className="text-lg font-semibold text-slate-900">
          Consumption / ELP Snapshot
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Baseline operational usage and effective license position derived from
          installations or assignments based on licensing metric.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Consumed Usage
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.consumed_quantity_usage, "0")}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              ELP by Allocation
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.elp_by_allocation, "0")}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              ELP by Usage
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {consumptionLoading
                ? "..."
                : formatSignedInteger(consumption.totals.elp_by_usage)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Under Consumed
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.UNDER_CONSUMED, "0")}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Potential Overuse
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.POTENTIAL_OVERUSE, "0")}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">
            Consumption Breakdown
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              No Activity:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.NO_ACTIVITY, "0")}
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              Under Consumed:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.UNDER_CONSUMED, "0")}
            </span>
            <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
              Balanced:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.BALANCED, "0")}
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              Potential Overuse:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.POTENTIAL_OVERUSE, "0")}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              Inactive:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.INACTIVE_ENTITLEMENT, "0")}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700">
              Expired:{" "}
              {consumptionLoading
                ? "..."
                : formatInteger(consumption.totals.status_counts.EXPIRED_ENTITLEMENT, "0")}
            </span>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Consumption basis uses assignment counts for user-oriented metrics and installation
            counts for other metrics. This is a baseline ELP snapshot, not a vendor-specific
            licensing engine.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Loading software entitlements...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No software entitlements found for this contract.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Add the first entitlement line to start tracking software license rights.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Entitlement</th>
                <th className="px-4 py-3 font-medium">Software Product</th>
                <th className="px-4 py-3 font-medium">Publisher</th>
                <th className="px-4 py-3 font-medium">Metric</th>
                <th className="px-4 py-3 font-medium text-right">Purchased</th>
                <th className="px-4 py-3 font-medium text-right">Allocated</th>
                <th className="px-4 py-3 font-medium text-right">Remaining</th>
                <th className="px-4 py-3 font-medium text-right">Installations</th>
                <th className="px-4 py-3 font-medium text-right">Assignments</th>
                <th className="px-4 py-3 font-medium">Basis</th>
                <th className="px-4 py-3 font-medium text-right">Consumed Usage</th>
                <th className="px-4 py-3 font-medium text-right">ELP Allocation</th>
                <th className="px-4 py-3 font-medium text-right">ELP Usage</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Compliance</th>
                <th className="px-4 py-3 font-medium">Consumption</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => {
                const compliance = summary.items.find(
                  (row) => Number(row.entitlement_id) === Number(item.id)
                );
                const usage = consumption.items.find(
                  (row) => Number(row.entitlement_id) === Number(item.id)
                );

                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {item.entitlement_code}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.entitlement_name || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      <div>{item.software_product_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.software_product_code}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {item.publisher_vendor_name || "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {item.licensing_metric}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatInteger(item.quantity_purchased, "0")}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {summaryLoading
                        ? "..."
                        : compliance
                        ? formatInteger(compliance.allocated_active, "0")
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {summaryLoading
                        ? "..."
                        : compliance
                        ? formatInteger(compliance.remaining_quantity, "0")
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {summaryLoading
                        ? "..."
                        : compliance
                        ? formatInteger(compliance.active_installation_count, "0")
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {summaryLoading
                        ? "..."
                        : compliance
                        ? formatInteger(compliance.active_assignment_count, "0")
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {consumptionLoading ? "..." : usage?.consumption_basis || "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {consumptionLoading
                        ? "..."
                        : usage
                        ? formatInteger(usage.consumed_quantity_usage, "0")
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {consumptionLoading
                        ? "..."
                        : usage
                        ? formatSignedInteger(usage.elp_by_allocation)
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {consumptionLoading
                        ? "..."
                        : usage
                        ? formatSignedInteger(usage.elp_by_usage)
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      <div>Start: {formatDate(item.start_date)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        End: {formatDate(item.end_date)}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={entitlementStatusPillClass(item.status)}>
                        {item.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {summaryLoading ? (
                        <span className="text-xs text-slate-400">Loading...</span>
                      ) : compliance ? (
                        <span className={complianceRiskPillClass(compliance.risk_status)}>
                          {complianceRiskLabel(compliance.risk_status)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {consumptionLoading ? (
                        <span className="text-xs text-slate-400">Loading...</span>
                      ) : usage ? (
                        <span
                          className={consumptionStatusPillClass(
                            usage.consumption_status
                          )}
                        >
                          {consumptionStatusLabel(usage.consumption_status)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(item.updated_at)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => openAllocationsModal(item)}
                          className="itam-secondary-action-sm"
                        >
                          Manage Allocations
                        </button>

                        {canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void openEditModal(item)}
                              className="itam-secondary-action-sm"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => openDeleteConfirm(item)}
                              className="itam-secondary-action-sm border-rose-200 text-rose-700 hover:bg-rose-50"
                              disabled={deleteLoading && deleteTarget?.id === item.id}
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No action</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-white bg-white/95 shadow-[0_24px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {mode === "create"
                    ? "Add Software Entitlement"
                    : "Edit Software Entitlement"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {mode === "create"
                    ? "Create a software entitlement line for this contract."
                    : "Update the software entitlement line for this contract."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="itam-secondary-action-sm"
                disabled={saving}
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5">
              {modalErr ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalErr}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Software Product
                  </label>
                  <select
                    value={form.software_product_id}
                    onChange={(e) => setField("software_product_id", e.target.value)}
                    disabled={loadingProducts || saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  >
                    <option value="">
                      {loadingProducts
                        ? "Loading software products..."
                        : "Select software product"}
                    </option>
                    {activeProducts.map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {product.product_code} - {product.product_name}
                        {product.publisher_vendor_name
                          ? ` (${product.publisher_vendor_name})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Entitlement Code
                  </label>
                  <input
                    type="text"
                    value={form.entitlement_code}
                    onChange={(e) =>
                      setField("entitlement_code", e.target.value.toUpperCase())
                    }
                    disabled={saving}
                    placeholder="e.g. MS-EA-USER-2026"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Entitlement Name
                  </label>
                  <input
                    type="text"
                    value={form.entitlement_name}
                    onChange={(e) => setField("entitlement_name", e.target.value)}
                    disabled={saving}
                    placeholder="Descriptive entitlement name"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Licensing Metric
                  </label>
                  <select
                    value={form.licensing_metric}
                    onChange={(e) =>
                      setField("licensing_metric", e.target.value as LicensingMetric)
                    }
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  >
                    {LICENSING_METRIC_OPTIONS.map((metric) => (
                      <option key={metric} value={metric}>
                        {metric}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Quantity Purchased
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.quantity_purchased}
                    onChange={(e) => setField("quantity_purchased", e.target.value)}
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setField("start_date", e.target.value)}
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setField("end_date", e.target.value)}
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setField("status", e.target.value as EntitlementStatus)
                    }
                    disabled={saving}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Notes
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    disabled={saving}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="itam-secondary-action"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="itam-primary-action"
                  disabled={saving || !form.software_product_id || !form.entitlement_code}
                >
                  {saving
                    ? "Saving..."
                    : mode === "create"
                    ? "Create Entitlement"
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>

    <SoftwareEntitlementAllocationsModal
      contractId={normalizedContractId}
      entitlement={selectedEntitlement}
      isOpen={allocationModalOpen}
      onClose={() => {
        setAllocationModalOpen(false);
        setSelectedEntitlement(null);
      }}
      onChanged={async () => {
        await refreshPanel();
      }}
    />
  </>
);
}

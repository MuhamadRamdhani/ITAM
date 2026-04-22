"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/api";
import { ErrorState, SkeletonTableRow } from "../../lib/loadingComponents";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
  "http://localhost:3001";

type UiConfig = {
  page_size_options: number[];
  documents_page_size_default: number;
};

type IdNameItem = {
  id: string;
  name: string;
};

type AssetTypeItem = {
  code: string;
  label: string;
};

type LinkStatusFilter = "" | "LINKED" | "NO_LINK";

type ContractHealthRollup =
  | "NO_LINK"
  | "ACTIVE_ONLY"
  | "HAS_NO_END_DATE"
  | "HAS_EXPIRING"
  | "HAS_EXPIRED";

type CoverageKind = "WARRANTY" | "SUPPORT" | "SUBSCRIPTION" | "NONE";
type CoverageHealth =
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "NO_COVERAGE"
  | "NO_END_DATE";

type ContractPreviewItem = {
  id: number;
  code: string;
};

type VendorPreviewItem = {
  id: number;
  name: string;
};

type MappingRow = {
  asset_id: number;
  asset_tag: string;
  name: string;
  status: string | null;
  asset_type:
    | {
        code: string;
        label: string;
      }
    | null;
  state:
    | {
        code: string;
        label: string;
      }
    | null;
  department:
    | {
        id?: number | string;
        code?: string;
        label?: string;
      }
    | null;
  location:
    | {
        id?: number | string;
        code?: string;
        label?: string;
      }
    | null;
  owner_identity:
    | {
        id?: number | string;
        name?: string;
        email?: string;
      }
    | null;

  coverage_kind: CoverageKind;
  start_date: string | null;
  end_date: string | null;
  coverage_health: CoverageHealth;
  days_to_expiry: number | null;

  linked_contracts_count: number;
  linked_vendors_count: number;

  contract_health_rollup: ContractHealthRollup;

  contract_preview_items: ContractPreviewItem[];
  vendor_preview_items: VendorPreviewItem[];
};

type MappingListData = {
  items: MappingRow[];
  page: number;
  page_size: number;
  total: number;
};

type MappingSummaryData = {
  rows_with_department: number;
  rows_with_location: number;
  rows_with_owner: number;

  rows_with_linked_contract: number;
  rows_without_linked_contract: number;

  no_coverage_count: number;
  active_count: number;
  expiring_count: number;
  expired_count: number;
  no_end_date_count: number;

  rows_with_expiring_contract: number;
  rows_with_no_end_date_contract: number;
};

const COVERAGE_KIND_OPTIONS = [
  { value: "", label: "All coverage" },
  { value: "WARRANTY", label: "Warranty" },
  { value: "SUPPORT", label: "Support" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "NONE", label: "No Coverage" },
] as const;

const HEALTH_OPTIONS = [
  { value: "", label: "All health" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring" },
  { value: "EXPIRED", label: "Expired" },
  { value: "NO_COVERAGE", label: "No Coverage" },
  { value: "NO_END_DATE", label: "No End Date" },
] as const;

const LINK_STATUS_OPTIONS = [
  { value: "", label: "All rows" },
  { value: "LINKED", label: "Linked only" },
  { value: "NO_LINK", label: "No link only" },
] as const;

function pickInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function normalizePositiveIntString(value: string) {
  const s = String(value || "").trim();
  if (!s) return "";
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return "";
  return String(n);
}

function buildReportHref(params: {
  q: string;
  type_code: string;
  department_id: string;
  location_id: string;
  owner_identity_id: string;
  coverage_kind: string;
  health: string;
  link_status: string;
  expiring_in_days: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();

  if (params.q) p.set("q", params.q);
  if (params.type_code) p.set("type_code", params.type_code);
  if (params.department_id) p.set("department_id", params.department_id);
  if (params.location_id) p.set("location_id", params.location_id);
  if (params.owner_identity_id) p.set("owner_identity_id", params.owner_identity_id);
  if (params.coverage_kind) p.set("coverage_kind", params.coverage_kind);
  if (params.health) p.set("health", params.health);
  if (params.link_status) p.set("link_status", params.link_status);
  if (params.expiring_in_days) p.set("expiring_in_days", params.expiring_in_days);
  if (params.pageSize && params.pageSize > 0) {
    p.set("page_size", String(params.pageSize));
  }
  if (params.page && params.page > 0) {
    p.set("page", String(params.page));
  }

  const qs = p.toString();
  return qs
    ? `/reports/asset-mapping?${qs}`
    : "/reports/asset-mapping";
}

function filenameFromDisposition(headerValue: string | null) {
  if (!headerValue) return null;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch =
    headerValue.match(/filename="([^"]+)"/i) ||
    headerValue.match(/filename=([^;]+)/i);

  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return null;
}

async function parseJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function fmtDays(value?: number | null) {
  if (value == null) return "-";
  return String(value);
}

function coverageKindLabel(value: string) {
  if (value === "WARRANTY") return "Warranty";
  if (value === "SUPPORT") return "Support";
  if (value === "SUBSCRIPTION") return "Subscription";
  if (value === "NONE") return "No Coverage";
  return value || "-";
}

function coverageKindPill(value: string) {
  const v = String(value || "").toUpperCase();
  if (v === "WARRANTY") {
    return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700";
  }
  if (v === "SUPPORT") {
    return "rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700";
  }
  if (v === "SUBSCRIPTION") {
    return "rounded-full bg-cyan-50 px-2 py-1 text-xs text-cyan-700";
  }
  if (v === "NONE") {
    return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function healthPill(value: string) {
  const v = String(value || "").toUpperCase();
  if (v === "ACTIVE") {
    return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  }
  if (v === "EXPIRING") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  }
  if (v === "EXPIRED") {
    return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  }
  if (v === "NO_COVERAGE") {
    return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  }
  if (v === "NO_END_DATE") {
    return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function contractImpactLabel(value: ContractHealthRollup | string) {
  const v = String(value || "").toUpperCase();
  if (v === "NO_LINK") return "No Link";
  if (v === "ACTIVE_ONLY") return "Active";
  if (v === "HAS_NO_END_DATE") return "No End Date";
  if (v === "HAS_EXPIRING") return "Expiring";
  if (v === "HAS_EXPIRED") return "Expired";
  return value || "-";
}

function contractImpactPill(value: ContractHealthRollup | string) {
  const v = String(value || "").toUpperCase();
  if (v === "NO_LINK") {
    return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  }
  if (v === "ACTIVE_ONLY") {
    return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  }
  if (v === "HAS_NO_END_DATE") {
    return "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700";
  }
  if (v === "HAS_EXPIRING") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  }
  if (v === "HAS_EXPIRED") {
    return "rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800";
  }
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function normalizeAssetTypes(res: any): AssetTypeItem[] {
  const raw =
    res?.data?.items ??
    res?.data?.data?.items ??
    res?.data?.data ??
    [];
  return Array.isArray(raw)
    ? raw.map((item: any) => ({
        code: String(item?.code ?? ""),
        label: String(item?.label ?? ""),
      }))
    : [];
}

function normalizeSimpleItems(res: any): IdNameItem[] {
  const raw =
    res?.data?.items ??
    res?.data?.data?.items ??
    res?.data?.data ??
    [];
  return Array.isArray(raw)
    ? raw
        .map((item: any) => ({
          id: String(item?.id ?? ""),
          name: String(item?.name ?? item?.display_name ?? item?.label ?? ""),
        }))
        .filter((item: IdNameItem) => item.id && item.name)
    : [];
}

function normalizeSummary(res: any): MappingSummaryData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    rows_with_department: Number(raw.rows_with_department ?? 0),
    rows_with_location: Number(raw.rows_with_location ?? 0),
    rows_with_owner: Number(raw.rows_with_owner ?? 0),

    rows_with_linked_contract: Number(raw.rows_with_linked_contract ?? 0),
    rows_without_linked_contract: Number(raw.rows_without_linked_contract ?? 0),

    no_coverage_count: Number(raw.no_coverage_count ?? 0),
    active_count: Number(raw.active_count ?? 0),
    expiring_count: Number(raw.expiring_count ?? 0),
    expired_count: Number(raw.expired_count ?? 0),
    no_end_date_count: Number(raw.no_end_date_count ?? 0),

    rows_with_expiring_contract: Number(raw.rows_with_expiring_contract ?? 0),
    rows_with_no_end_date_contract: Number(raw.rows_with_no_end_date_contract ?? 0),
  };
}

function normalizeContractPreviewItems(value: any): ContractPreviewItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: Number(item?.id ?? 0),
      code: String(item?.code ?? ""),
    }))
    .filter((item) => item.id > 0 && item.code);
}

function normalizeVendorPreviewItems(value: any): VendorPreviewItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: Number(item?.id ?? 0),
      name: String(item?.name ?? ""),
    }))
    .filter((item) => item.id > 0 && item.name);
}

function normalizeList(res: any): MappingListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw.items)
    ? raw.items.map((item: any) => ({
        asset_id: Number(item.asset_id ?? 0),
        asset_tag: String(item.asset_tag ?? ""),
        name: String(item.name ?? ""),
        status: item.status == null ? null : String(item.status),
        asset_type: item.asset_type
          ? {
              code: String(item.asset_type?.code ?? ""),
              label: String(item.asset_type?.label ?? ""),
            }
          : null,
        state: item.state
          ? {
              code: String(item.state?.code ?? ""),
              label: String(item.state?.label ?? ""),
            }
          : null,
        department: item.department
          ? {
              id: item.department?.id,
              code: item.department?.code,
              label: item.department?.label,
            }
          : null,
        location: item.location
          ? {
              id: item.location?.id,
              code: item.location?.code,
              label: item.location?.label,
            }
          : null,
        owner_identity: item.owner_identity
          ? {
              id: item.owner_identity?.id,
              name: item.owner_identity?.name,
              email: item.owner_identity?.email,
            }
          : null,

        coverage_kind: String(item.coverage_kind ?? "NONE") as CoverageKind,
        start_date: item.start_date == null ? null : String(item.start_date),
        end_date: item.end_date == null ? null : String(item.end_date),
        coverage_health: String(item.coverage_health ?? "NO_COVERAGE") as CoverageHealth,
        days_to_expiry:
          item.days_to_expiry == null ? null : Number(item.days_to_expiry),

        linked_contracts_count: Number(item.linked_contracts_count ?? 0),
        linked_vendors_count: Number(item.linked_vendors_count ?? 0),

        contract_health_rollup: String(
          item.contract_health_rollup ?? "NO_LINK"
        ) as ContractHealthRollup,

        contract_preview_items: normalizeContractPreviewItems(
          item.contract_preview_items
        ),
        vendor_preview_items: normalizeVendorPreviewItems(
          item.vendor_preview_items
        ),
      }))
    : [];

  return {
    items,
    page: Number(raw.page ?? 1),
    page_size: Number(raw.page_size ?? 10),
    total: Number(raw.total ?? 0),
  };
}

function StatCard(props: {
  label: string;
  value: number | string;
  tone?: "default" | "green" | "amber" | "rose" | "cyan";
}) {
  const tone = props.tone || "default";

  const toneClass =
    tone === "green"
      ? "border-green-200 text-green-800"
      : tone === "amber"
        ? "border-amber-200 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 text-rose-800"
          : tone === "cyan"
            ? "border-cyan-200 text-cyan-800"
            : "border-slate-200 text-slate-900";

  return (
    <div className={`rounded-3xl border bg-white/85 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {props.label}
      </div>
      <div className="mt-3 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

export default function AssetMappingReportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bootLoading, setBootLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSizeDefault, setPageSizeDefault] = useState<number>(10);

  const [assetTypes, setAssetTypes] = useState<AssetTypeItem[]>([]);
  const [departments, setDepartments] = useState<IdNameItem[]>([]);
  const [locations, setLocations] = useState<IdNameItem[]>([]);
  const [owners, setOwners] = useState<IdNameItem[]>([]);

  const [summary, setSummary] = useState<MappingSummaryData>({
    rows_with_department: 0,
    rows_with_location: 0,
    rows_with_owner: 0,
    rows_with_linked_contract: 0,
    rows_without_linked_contract: 0,
    no_coverage_count: 0,
    active_count: 0,
    expiring_count: 0,
    expired_count: 0,
    no_end_date_count: 0,
    rows_with_expiring_contract: 0,
    rows_with_no_end_date_contract: 0,
  });

  const [data, setData] = useState<MappingListData>({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
  });

  const [err, setErr] = useState<string | null>(null);

  const q = searchParams.get("q")?.trim() || "";
  const typeCode = searchParams.get("type_code")?.trim() || "";
  const departmentId = searchParams.get("department_id")?.trim() || "";
  const locationId = searchParams.get("location_id")?.trim() || "";
  const ownerIdentityId = searchParams.get("owner_identity_id")?.trim() || "";
  const coverageKind = searchParams.get("coverage_kind")?.trim() || "";
  const health = searchParams.get("health")?.trim() || "";
  const linkStatus = (searchParams.get("link_status")?.trim() || "") as LinkStatusFilter;
  const expiringInDays = searchParams.get("expiring_in_days")?.trim() || "";
  const page = pickInt(searchParams.get("page"), 1);

  const pageSize = useMemo(() => {
    const c = pickInt(searchParams.get("page_size"), pageSizeDefault);
    return pageSizeOptions.includes(c) ? c : pageSizeDefault;
  }, [searchParams, pageSizeDefault, pageSizeOptions]);

  const currentReportHref = useMemo(() => {
  const qs = searchParams.toString();
  return qs
    ? `/reports/asset-mapping?${qs}`
    : "/reports/asset-mapping";
}, [searchParams]);

  const [qInput, setQInput] = useState("");
  const [typeCodeInput, setTypeCodeInput] = useState("");
  const [departmentIdInput, setDepartmentIdInput] = useState("");
  const [locationIdInput, setLocationIdInput] = useState("");
  const [ownerIdentityIdInput, setOwnerIdentityIdInput] = useState("");
  const [coverageKindInput, setCoverageKindInput] = useState("");
  const [healthInput, setHealthInput] = useState("");
  const [linkStatusInput, setLinkStatusInput] = useState<LinkStatusFilter>("");
  const [expiringInput, setExpiringInput] = useState("");
  const [pageSizeInput, setPageSizeInput] = useState("10");

  const items = Array.isArray(data.items) ? data.items : [];
  const total = Number(data.total ?? 0);
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = total === 0 ? 0 : Math.min(total, page * pageSize);

  useEffect(() => {
    setQInput(q);
    setTypeCodeInput(typeCode);
    setDepartmentIdInput(departmentId);
    setLocationIdInput(locationId);
    setOwnerIdentityIdInput(ownerIdentityId);
    setCoverageKindInput(coverageKind);
    setHealthInput(health);
    setLinkStatusInput(linkStatus);
    setExpiringInput(expiringInDays);
    setPageSizeInput(String(pageSize));
  }, [
    q,
    typeCode,
    departmentId,
    locationId,
    ownerIdentityId,
    coverageKind,
    health,
    linkStatus,
    expiringInDays,
    pageSize,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBootLoading(true);
      setErr(null);

      try {
        const [cfgRes, assetTypesRes] = await Promise.all([
          apiGet<UiConfig>("/api/v1/config/ui", {
            loadingKey: "asset_mapping_report_boot",
          }),
          apiGet<any>("/api/v1/config/asset-types", {
            loadingKey: "asset_mapping_report_asset_types",
          }),
        ]);

        if (cancelled) return;

        const cfg = cfgRes.data;
        const options = Array.isArray(cfg?.page_size_options)
          ? cfg.page_size_options
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        const def = Number(cfg?.documents_page_size_default);
        const nextDefault = options.includes(def) ? def : options[0] || 10;

        setPageSizeOptions(options);
        setPageSizeDefault(nextDefault);
        setAssetTypes(normalizeAssetTypes(assetTypesRes));
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

        setErr(eAny?.message || "Failed to initialize asset mapping report");
      } finally {
        if (!cancelled) {
          setBootLoading(false);
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      if (bootLoading) return;

      setOptionsLoading(true);

      try {
        const [departmentsRes, locationsRes, ownersRes] = await Promise.all([
          apiGet<any>("/api/v1/departments?page=1&page_size=200", {
            loadingKey: "asset_mapping_departments",
          }),
          apiGet<any>("/api/v1/locations?page=1&page_size=200", {
            loadingKey: "asset_mapping_locations",
          }),
          apiGet<any>("/api/v1/admin/users?page=1&page_size=200", {
            loadingKey: "asset_mapping_owners",
          }),
        ]);

        if (cancelled) return;

        setDepartments(normalizeSimpleItems(departmentsRes));
        setLocations(normalizeSimpleItems(locationsRes));
        setOwners(normalizeSimpleItems(ownersRes));
      } catch {
        if (cancelled) return;
        setDepartments([]);
        setLocations([]);
        setOwners([]);
      } finally {
        if (!cancelled) {
          setOptionsLoading(false);
        }
      }
    }

    loadOptions();

    return () => {
      cancelled = true;
    };
  }, [bootLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummaryAndList() {
      if (bootLoading) return;
      if (!pageSize) return;

      setErr(null);
      setSummaryLoading(true);
      setListLoading(true);

      try {
        const summaryQs = new URLSearchParams();
        if (q) summaryQs.set("q", q);
        if (typeCode) summaryQs.set("type_code", typeCode);
        if (departmentId) summaryQs.set("department_id", departmentId);
        if (locationId) summaryQs.set("location_id", locationId);
        if (ownerIdentityId) summaryQs.set("owner_identity_id", ownerIdentityId);
        if (coverageKind) summaryQs.set("coverage_kind", coverageKind);
        if (health) summaryQs.set("health", health);
        if (linkStatus) summaryQs.set("link_status", linkStatus);
        if (expiringInDays) summaryQs.set("expiring_in_days", expiringInDays);

        const listQs = new URLSearchParams(summaryQs);
        listQs.set("page", String(page));
        listQs.set("page_size", String(pageSize));

        const [summaryRes, listRes] = await Promise.all([
          apiGet<any>(
            `/api/v1/reports/asset-mapping/summary?${summaryQs.toString()}`,
            {
              loadingKey: "asset_mapping_summary",
            }
          ),
          apiGet<any>(`/api/v1/reports/asset-mapping?${listQs.toString()}`, {
            loadingKey: "asset_mapping_list",
          }),
        ]);

        if (cancelled) return;

        setSummary(normalizeSummary(summaryRes));
        setData(normalizeList(listRes));
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

        setErr(eAny?.message || "Failed to load asset mapping report");
        setSummary({
          rows_with_department: 0,
          rows_with_location: 0,
          rows_with_owner: 0,
          rows_with_linked_contract: 0,
          rows_without_linked_contract: 0,
          no_coverage_count: 0,
          active_count: 0,
          expiring_count: 0,
          expired_count: 0,
          no_end_date_count: 0,
          rows_with_expiring_contract: 0,
          rows_with_no_end_date_contract: 0,
        });
        setData({
          items: [],
          page: 1,
          page_size: pageSize,
          total: 0,
        });
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
          setListLoading(false);
        }
      }
    }

    loadSummaryAndList();

    return () => {
      cancelled = true;
    };
  }, [
    bootLoading,
    q,
    typeCode,
    departmentId,
    locationId,
    ownerIdentityId,
    coverageKind,
    health,
    linkStatus,
    expiringInDays,
    page,
    pageSize,
    router,
  ]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();

    router.push(
      buildReportHref({
        q: qInput.trim(),
        type_code: typeCodeInput.trim(),
        department_id: normalizePositiveIntString(departmentIdInput),
        location_id: normalizePositiveIntString(locationIdInput),
        owner_identity_id: normalizePositiveIntString(ownerIdentityIdInput),
        coverage_kind: coverageKindInput.trim(),
        health: healthInput.trim(),
        link_status: linkStatusInput.trim(),
        expiring_in_days: normalizePositiveIntString(expiringInput),
        page: 1,
        pageSize: Number(pageSizeInput),
      })
    );
  }

  function onReset() {
    router.push(
      buildReportHref({
        q: "",
        type_code: "",
        department_id: "",
        location_id: "",
        owner_identity_id: "",
        coverage_kind: "",
        health: "",
        link_status: "",
        expiring_in_days: "",
        page: 1,
        pageSize: pageSizeDefault,
      })
    );
  }

  async function onExportExcel() {
    try {
      setExporting(true);
      setErr(null);

      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (typeCode) qs.set("type_code", typeCode);
      if (departmentId) qs.set("department_id", departmentId);
      if (locationId) qs.set("location_id", locationId);
      if (ownerIdentityId) qs.set("owner_identity_id", ownerIdentityId);
      if (coverageKind) qs.set("coverage_kind", coverageKind);
      if (health) qs.set("health", health);
      if (linkStatus) qs.set("link_status", linkStatus);
      if (expiringInDays) qs.set("expiring_in_days", expiringInDays);

      const res = await fetch(
        `${API_BASE}/api/v1/reports/asset-mapping/export.xlsx${
          qs.toString() ? `?${qs.toString()}` : ""
        }`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!res.ok) {
        const json = await parseJsonSafe(res);
        throw new Error(
          json?.error?.message || json?.message || "Failed to export Excel"
        );
      }

      const blob = await res.blob();
      const filename =
        filenameFromDisposition(res.headers.get("content-disposition")) ||
        `asset-mapping-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
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

      setErr(eAny?.message || "Failed to export Excel");
    } finally {
      setExporting(false);
    }
  }
    if (bootLoading) {
    return (
      <main className="itam-page-shell">
        <div className="itam-page-shell-inner">
          <div className="rounded-3xl border border-white bg-white/80 p-6 text-sm text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            Loading asset mapping report...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="itam-page-shell">
      <div className="itam-page-shell-inner">
        <div className="rounded-3xl border border-white bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:p-8">
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">
                Reports
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Asset Mapping Report
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                Melihat kelengkapan mapping asset terhadap department, location, owner,
                coverage, dan dampak contract yang terhubung.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
  <Link
  href="/reports/asset-coverage"
  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
>
  Coverage
</Link>
<span className="rounded-full bg-cyan-600 px-3 py-2 text-xs font-semibold text-white">
  Mapping
</span>
</div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
  <button
    type="button"
    onClick={onExportExcel}
    disabled={exporting}
    className="itam-secondary-action"
  >
    {exporting ? "Exporting..." : "Export Excel"}
  </button>

  <Link href="/" className="itam-secondary-action">
    Back
  </Link>
</div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <form
              className="grid grid-cols-1 gap-4 lg:grid-cols-6"
              onSubmit={onSearchSubmit}
            >
              <div className="lg:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Search
                </label>
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Search asset tag / name..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Asset Type
                </label>
                <select
                  value={typeCodeInput}
                  onChange={(e) => setTypeCodeInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">All types</option>
                  {assetTypes.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Department
                </label>
                <select
                  value={departmentIdInput}
                  onChange={(e) => setDepartmentIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">All departments</option>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Location
                </label>
                <select
                  value={locationIdInput}
                  onChange={(e) => setLocationIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">All locations</option>
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Owner
                </label>
                <select
                  value={ownerIdentityIdInput}
                  onChange={(e) => setOwnerIdentityIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">All owners</option>
                  {owners.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Coverage
                </label>
                <select
                  value={coverageKindInput}
                  onChange={(e) => setCoverageKindInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {COVERAGE_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Health
                </label>
                <select
                  value={healthInput}
                  onChange={(e) => setHealthInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {HEALTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Link Status
                </label>
                <select
                  value={linkStatusInput}
                  onChange={(e) =>
                    setLinkStatusInput(e.target.value as LinkStatusFilter)
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {LINK_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Expiring In Days
                </label>
                <input
                  value={expiringInput}
                  onChange={(e) => setExpiringInput(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Page Size
                </label>
                <select
                  value={pageSizeInput}
                  onChange={(e) => setPageSizeInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {pageSizeOptions.map((item) => (
                    <option key={item} value={String(item)}>
                      {item} / page
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onReset}
                  className="itam-secondary-action"
                >
                  Reset
                </button>
                <button type="submit" className="itam-primary-action">
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Mapped Department" value={summary.rows_with_department} />
          <StatCard label="Mapped Location" value={summary.rows_with_location} />
          <StatCard label="Mapped Owner" value={summary.rows_with_owner} />
          <StatCard
            label="Linked Contract Rows"
            value={summary.rows_with_linked_contract}
            tone="cyan"
          />
          <StatCard label="No Link Rows" value={summary.rows_without_linked_contract} />
          <StatCard label="No Coverage" value={summary.no_coverage_count} />

          <StatCard
            label="Active Coverage"
            value={summary.active_count}
            tone="green"
          />
          <StatCard
            label="Expiring Coverage"
            value={summary.expiring_count}
            tone="amber"
          />
          <StatCard
            label="Expired Coverage"
            value={summary.expired_count}
            tone="rose"
          />
          <StatCard label="No End Date" value={summary.no_end_date_count} />
          <StatCard
            label="Expiring Contract Rows"
            value={summary.rows_with_expiring_contract}
            tone="amber"
          />
          <StatCard
            label="Contract No End Date Rows"
            value={summary.rows_with_no_end_date_contract}
          />
        </div>

        <div className="mt-10 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">Total rows: {total}</div>
              <div className="text-sm text-slate-500">
                Showing {total === 0 ? 0 : startIdx}–{endIdx}
              </div>
            </div>

            {err ? (
              <div className="mb-4">
                <ErrorState
                  error={err}
                  onRetry={() => {
                    window.location.reload();
                  }}
                />
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[1700px] w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Asset Tag</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Type / State</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Coverage</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Coverage Health</th>
                    <th className="px-4 py-3 font-medium">Linked Contracts</th>
                    <th className="px-4 py-3 font-medium">Linked Vendors</th>
                    <th className="px-4 py-3 font-medium">Contract Impact</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {bootLoading || summaryLoading || listLoading ? (
                    <>
                      <SkeletonTableRow cols={12} />
                      <SkeletonTableRow cols={12} />
                      <SkeletonTableRow cols={12} />
                      <SkeletonTableRow cols={12} />
                      <SkeletonTableRow cols={12} />
                    </>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                        No asset mapping rows found.
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr key={`${row.asset_id}-${row.coverage_kind}`} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-medium text-cyan-700">{row.asset_tag}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">{row.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Status: {row.status || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>{row.asset_type?.label || row.asset_type?.code || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            ({row.asset_type?.code || "-"})
                          </div>
                          <div className="mt-2 text-xs text-slate-500">State:</div>
                          <div className="text-xs text-slate-600">
                            {row.state?.label || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            ({row.state?.code || "-"})
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>{row.department?.label || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.department?.code ? `(${row.department.code})` : "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>{row.location?.label || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.location?.code ? `(${row.location.code})` : "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>{row.owner_identity?.name || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.owner_identity?.email || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={coverageKindPill(row.coverage_kind)}>
                            {coverageKindLabel(row.coverage_kind)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>Start: {fmtDate(row.start_date)}</div>
                          <div className="mt-1">End: {fmtDate(row.end_date)}</div>
                        </td>

                        <td className="px-4 py-4">
                          <div>
                            <span className={healthPill(row.coverage_health)}>
                              {row.coverage_health}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {fmtDays(row.days_to_expiry)} days
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div className="font-medium">{row.linked_contracts_count}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.contract_preview_items?.length ? (
                              row.contract_preview_items.map((item) => (
                                <Link
                                  key={item.id}
                                  href={`/contracts/${item.id}?return_to=${encodeURIComponent(currentReportHref)}`}
                                  className="text-xs font-medium text-cyan-700 hover:underline"
                                >
                                  {item.code}
                                </Link>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div className="font-medium">{row.linked_vendors_count}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.vendor_preview_items?.length ? (
                              row.vendor_preview_items.map((item) => (
                                <span key={item.id} className="text-xs text-slate-600">
                                  {item.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={contractImpactPill(row.contract_health_rollup)}>
                            {contractImpactLabel(row.contract_health_rollup)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Page {page} / {totalPages} (page_size: {pageSize})
              </div>

              <div className="flex gap-2">
                {canPrev ? (
                  <Link
                    className="itam-secondary-action-sm"
                    href={buildReportHref({
                      q,
                      type_code: typeCode,
                      department_id: departmentId,
                      location_id: locationId,
                      owner_identity_id: ownerIdentityId,
                      coverage_kind: coverageKind,
                      health,
                      link_status: linkStatus,
                      expiring_in_days: expiringInDays,
                      page: page - 1,
                      pageSize,
                    })}
                  >
                    Prev
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                    Prev
                  </span>
                )}

                {canNext ? (
                  <Link
                    className="itam-secondary-action-sm"
                    href={buildReportHref({
                      q,
                      type_code: typeCode,
                      department_id: departmentId,
                      location_id: locationId,
                      owner_identity_id: ownerIdentityId,
                      coverage_kind: coverageKind,
                      health,
                      link_status: linkStatus,
                      expiring_in_days: expiringInDays,
                      page: page + 1,
                      pageSize,
                    })}
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                    Next
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
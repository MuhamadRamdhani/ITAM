"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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

type ConfigItem = {
  code: string;
  label: string;
};

type CoverageKind = "WARRANTY" | "SUPPORT" | "SUBSCRIPTION" | "NONE";
type CoverageHealth =
  | "ACTIVE"
  | "EXPIRING"
  | "EXPIRED"
  | "NO_COVERAGE"
  | "NO_END_DATE";

type ContractHealthRollup =
  | "NO_LINK"
  | "ACTIVE_ONLY"
  | "HAS_NO_END_DATE"
  | "HAS_EXPIRING"
  | "HAS_EXPIRED";

type LinkStatusFilter = "" | "LINKED" | "NO_LINK";

type ContractPreviewItem = {
  id: number;
  code: string;
};

type VendorPreviewItem = {
  id: number;
  name: string;
};

type AssetCoverageItem = {
  asset_id: number;
  asset_tag: string;
  name: string;
  status: string | null;
  asset_type: {
    code: string;
    label: string;
  };
  state:
    | {
        code: string;
        label: string;
      }
    | null;
  coverage_kind: CoverageKind;
  start_date: string | null;
  end_date: string | null;
  coverage_health: CoverageHealth;
  days_to_expiry: number | null;

  has_linked_contract: boolean;
  linked_contracts_count: number;
  linked_vendors_count: number;

  has_active_contract: boolean;
  has_expiring_contract: boolean;
  has_expired_contract: boolean;
  has_no_end_date_contract: boolean;

  contract_health_rollup: ContractHealthRollup;
  contract_codes_preview: string[];

  vendor_names_preview: string[];
  contract_preview_items: ContractPreviewItem[];
  vendor_preview_items: VendorPreviewItem[];
};

type AssetCoverageListData = {
  items: AssetCoverageItem[];
  page: number;
  page_size: number;
  total: number;
};

type AssetCoverageSummaryData = {
  active_count: number;
  expiring_count: number;
  expired_count: number;
  no_coverage_count: number;
  no_end_date_count: number;

  rows_with_linked_contract: number;
  rows_without_linked_contract: number;
  rows_with_active_contract: number;
  rows_with_expiring_contract: number;
  rows_with_expired_contract: number;
  rows_with_no_end_date_contract: number;
};

type VendorOption = {
  id: string;
  vendor_code: string;
  vendor_name: string;
  status: string;
};

type ContractOption = {
  id: string;
  vendor_id: string;
  contract_code: string;
  contract_name: string;
  status: string;
  contract_health: string;
  vendor_code: string;
  vendor_name: string;
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

const CONTRACT_HEALTH_OPTIONS = [
  { value: "", label: "All contract impact" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring" },
  { value: "EXPIRED", label: "Expired" },
  { value: "NO_END_DATE", label: "No End Date" },
] as const;

const LINK_STATUS_OPTIONS = [
  { value: "", label: "All rows" },
  { value: "LINKED", label: "Linked Only" },
  { value: "NO_LINK", label: "No Link Only" },
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
  coverage_kind: string;
  health: string;
  vendor_id: string;
  contract_id: string;
  contract_health: string;
  link_status: string;
  expiring_in_days: string;
  page?: number;
  pageSize?: number;
}) {
  const p = new URLSearchParams();

  if (params.q) p.set("q", params.q);
  if (params.type_code) p.set("type_code", params.type_code);
  if (params.coverage_kind) p.set("coverage_kind", params.coverage_kind);
  if (params.health) p.set("health", params.health);
  if (params.vendor_id) p.set("vendor_id", params.vendor_id);
  if (params.contract_id) p.set("contract_id", params.contract_id);
  if (params.contract_health) p.set("contract_health", params.contract_health);
  if (params.link_status) p.set("link_status", params.link_status);
  if (params.expiring_in_days) p.set("expiring_in_days", params.expiring_in_days);
  if (params.pageSize && params.pageSize > 0) {
    p.set("page_size", String(params.pageSize));
  }
  if (params.page && params.page > 0) {
    p.set("page", String(params.page));
  }

  const qs = p.toString();
  return qs ? `/reports/asset-coverage?${qs}` : "/reports/asset-coverage";
}

function buildExportQuery(params: {
  q: string;
  type_code: string;
  coverage_kind: string;
  health: string;
  vendor_id: string;
  contract_id: string;
  contract_health: string;
  link_status: string;
  expiring_in_days: string;
}) {
  const p = new URLSearchParams();

  if (params.q) p.set("q", params.q);
  if (params.type_code) p.set("type_code", params.type_code);
  if (params.coverage_kind) p.set("coverage_kind", params.coverage_kind);
  if (params.health) p.set("health", params.health);
  if (params.vendor_id) p.set("vendor_id", params.vendor_id);
  if (params.contract_id) p.set("contract_id", params.contract_id);
  if (params.contract_health) p.set("contract_health", params.contract_health);
  if (params.link_status) p.set("link_status", params.link_status);
  if (params.expiring_in_days) p.set("expiring_in_days", params.expiring_in_days);

  return p.toString();
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

function normalizeAssetTypes(res: any): ConfigItem[] {
  const raw =
    res?.data?.items ??
    res?.data?.data?.items ??
    res?.data?.data ??
    [];
  return Array.isArray(raw) ? raw : [];
}

function normalizeSummary(res: any): AssetCoverageSummaryData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    active_count: Number(raw.active_count ?? 0),
    expiring_count: Number(raw.expiring_count ?? 0),
    expired_count: Number(raw.expired_count ?? 0),
    no_coverage_count: Number(raw.no_coverage_count ?? 0),
    no_end_date_count: Number(raw.no_end_date_count ?? 0),

    rows_with_linked_contract: Number(raw.rows_with_linked_contract ?? 0),
    rows_without_linked_contract: Number(raw.rows_without_linked_contract ?? 0),
    rows_with_active_contract: Number(raw.rows_with_active_contract ?? 0),
    rows_with_expiring_contract: Number(raw.rows_with_expiring_contract ?? 0),
    rows_with_expired_contract: Number(raw.rows_with_expired_contract ?? 0),
    rows_with_no_end_date_contract: Number(raw.rows_with_no_end_date_contract ?? 0),
  };
}

function normalizeStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x));
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

function normalizeList(res: any): AssetCoverageListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw.items)
    ? raw.items.map((item: any) => ({
        asset_id: Number(item.asset_id ?? 0),
        asset_tag: String(item.asset_tag ?? ""),
        name: String(item.name ?? ""),
        status: item.status == null ? null : String(item.status),
        asset_type: {
          code: String(item.asset_type?.code ?? ""),
          label: String(item.asset_type?.label ?? ""),
        },
        state: item.state
          ? {
              code: String(item.state?.code ?? ""),
              label: String(item.state?.label ?? ""),
            }
          : null,
        coverage_kind: String(item.coverage_kind ?? "NONE") as CoverageKind,
        start_date: item.start_date == null ? null : String(item.start_date),
        end_date: item.end_date == null ? null : String(item.end_date),
        coverage_health: String(item.coverage_health ?? "NO_COVERAGE") as CoverageHealth,
        days_to_expiry:
          item.days_to_expiry == null ? null : Number(item.days_to_expiry),

        has_linked_contract: Boolean(item.has_linked_contract),
        linked_contracts_count: Number(item.linked_contracts_count ?? 0),
        linked_vendors_count: Number(item.linked_vendors_count ?? 0),

        has_active_contract: Boolean(item.has_active_contract),
        has_expiring_contract: Boolean(item.has_expiring_contract),
        has_expired_contract: Boolean(item.has_expired_contract),
        has_no_end_date_contract: Boolean(item.has_no_end_date_contract),

        contract_health_rollup: String(
          item.contract_health_rollup ?? "NO_LINK"
        ) as ContractHealthRollup,
        contract_codes_preview: normalizeStringArray(item.contract_codes_preview),
        vendor_names_preview: normalizeStringArray(item.vendor_names_preview),

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

function normalizeVendorOptions(res: any): VendorOption[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(res?.data)
      ? res.data
      : [];

  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      vendor_code: String(item?.vendor_code ?? ""),
      vendor_name: String(item?.vendor_name ?? ""),
      status: String(item?.status ?? ""),
    }))
    .filter((item: VendorOption) => item.id)
    .sort((a: VendorOption, b: VendorOption) => {
      const aText = `${a.vendor_code} ${a.vendor_name}`.trim();
      const bText = `${b.vendor_code} ${b.vendor_name}`.trim();
      return aText.localeCompare(bText);
    });
}

function normalizeContractOptions(res: any): ContractOption[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(res?.data)
      ? res.data
      : [];

  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      vendor_id: String(item?.vendor_id ?? ""),
      contract_code: String(item?.contract_code ?? ""),
      contract_name: String(item?.contract_name ?? ""),
      status: String(item?.status ?? ""),
      contract_health: String(item?.contract_health ?? ""),
      vendor_code: String(item?.vendor_code ?? ""),
      vendor_name: String(item?.vendor_name ?? ""),
    }))
    .filter((item: ContractOption) => item.id)
    .sort((a: ContractOption, b: ContractOption) => {
      const aText = `${a.contract_code} ${a.contract_name}`.trim();
      const bText = `${b.contract_code} ${b.contract_name}`.trim();
      return aText.localeCompare(bText);
    });
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

function previewText(values: string[], limit = 2) {
  if (!values.length) return "-";
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} +${values.length - limit} more`;
}

function renderContractPreview(
  items: ContractPreviewItem[],
  fallback: string[],
  returnTo: string
): ReactNode {
  if (items.length > 0) {
    const visible = items.slice(0, 2);
    const remaining = items.length - visible.length;

    return (
      <>
        <div className="mt-1 flex flex-wrap gap-1">
          {visible.map((item) => (
            <Link
              key={item.id}
              href={`/contracts/${item.id}?return_to=${encodeURIComponent(returnTo)}`}
              className="text-cyan-700 hover:underline"
            >
              {item.code}
            </Link>
          ))}
        </div>
        {remaining > 0 ? (
          <div className="mt-1 text-xs text-slate-500">+{remaining} more</div>
        ) : null}
      </>
    );
  }

  return <div className="mt-1 text-xs text-slate-500">{previewText(fallback)}</div>;
}

function renderVendorPreview(
  items: VendorPreviewItem[],
  fallback: string[],
  returnTo: string
): ReactNode {
  if (items.length > 0) {
    const visible = items.slice(0, 2);
    const remaining = items.length - visible.length;

    return (
      <>
        <div className="mt-1 flex flex-wrap gap-1">
          {visible.map((item) => (
            <Link
              key={item.id}
              href={`/vendors/${item.id}?return_to=${encodeURIComponent(returnTo)}`}
              className="text-cyan-700 hover:underline"
            >
              {item.name}
            </Link>
          ))}
        </div>
        {remaining > 0 ? (
          <div className="mt-1 text-xs text-slate-500">+{remaining} more</div>
        ) : null}
      </>
    );
  }

  return <div className="mt-1 text-xs text-slate-500">{previewText(fallback)}</div>;
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
    <div
      className={`rounded-3xl border bg-white/85 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${toneClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {props.label}
      </div>
      <div className="mt-3 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

export default function AssetCoverageReportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bootLoading, setBootLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSizeDefault, setPageSizeDefault] = useState<number>(10);
  const [assetTypesItems, setAssetTypesItems] = useState<ConfigItem[]>([]);
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [contractOptions, setContractOptions] = useState<ContractOption[]>([]);

  const [summary, setSummary] = useState<AssetCoverageSummaryData>({
    active_count: 0,
    expiring_count: 0,
    expired_count: 0,
    no_coverage_count: 0,
    no_end_date_count: 0,

    rows_with_linked_contract: 0,
    rows_without_linked_contract: 0,
    rows_with_active_contract: 0,
    rows_with_expiring_contract: 0,
    rows_with_expired_contract: 0,
    rows_with_no_end_date_contract: 0,
  });

  const [data, setData] = useState<AssetCoverageListData>({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
  });

  const [err, setErr] = useState<string | null>(null);

  const q = searchParams.get("q")?.trim() || "";
  const type_code = searchParams.get("type_code")?.trim() || "";
  const coverage_kind = searchParams.get("coverage_kind")?.trim() || "";
  const health = searchParams.get("health")?.trim() || "";
  const vendor_id = searchParams.get("vendor_id")?.trim() || "";
  const contract_id = searchParams.get("contract_id")?.trim() || "";
  const contract_health = searchParams.get("contract_health")?.trim() || "";
  const link_status = (searchParams.get("link_status")?.trim() || "") as LinkStatusFilter;
  const expiring_in_days = searchParams.get("expiring_in_days")?.trim() || "";
  const page = pickInt(searchParams.get("page"), 1);

  const pageSize = useMemo(() => {
    const candidate = pickInt(searchParams.get("page_size"), pageSizeDefault);
    return pageSizeOptions.includes(candidate) ? candidate : pageSizeDefault;
  }, [searchParams, pageSizeDefault, pageSizeOptions]);

  const currentReportHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/reports/asset-coverage?${qs}` : "/reports/asset-coverage";
  }, [searchParams]);

  const [qInput, setQInput] = useState("");
  const [typeCodeInput, setTypeCodeInput] = useState("");
  const [coverageKindInput, setCoverageKindInput] = useState("");
  const [healthInput, setHealthInput] = useState("");
  const [vendorIdInput, setVendorIdInput] = useState("");
  const [contractIdInput, setContractIdInput] = useState("");
  const [contractHealthInput, setContractHealthInput] = useState("");
  const [linkStatusInput, setLinkStatusInput] = useState<LinkStatusFilter>("");
  const [expiringInput, setExpiringInput] = useState("");
  const [pageSizeInput, setPageSizeInput] = useState("10");

  const total = Number(data.total ?? 0);
  const items = Array.isArray(data.items) ? data.items : [];
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const vendorHasCurrentValue = useMemo(
    () => vendorOptions.some((item) => item.id === vendor_id),
    [vendorOptions, vendor_id]
  );

  const filteredContractOptions = useMemo(() => {
    if (!vendorIdInput) return contractOptions;
    return contractOptions.filter((item) => item.vendor_id === vendorIdInput);
  }, [contractOptions, vendorIdInput]);

  const contractHasCurrentValue = useMemo(
    () => filteredContractOptions.some((item) => item.id === contractIdInput),
    [filteredContractOptions, contractIdInput]
  );

  useEffect(() => {
    setQInput(q);
    setTypeCodeInput(type_code);
    setCoverageKindInput(coverage_kind);
    setHealthInput(health);
    setVendorIdInput(vendor_id);
    setContractIdInput(contract_id);
    setContractHealthInput(contract_health);
    setLinkStatusInput(link_status);
    setExpiringInput(expiring_in_days);
    setPageSizeInput(String(pageSize));
  }, [
    q,
    type_code,
    coverage_kind,
    health,
    vendor_id,
    contract_id,
    contract_health,
    link_status,
    expiring_in_days,
    pageSize,
  ]);

  useEffect(() => {
    if (!vendorIdInput || !contractIdInput) return;
    const current = contractOptions.find((item) => item.id === contractIdInput);
    if (!current) return;
    if (current.vendor_id !== vendorIdInput) {
      setContractIdInput("");
    }
  }, [vendorIdInput, contractIdInput, contractOptions]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBootLoading(true);
      setErr(null);

      try {
        const [cfgRes, assetTypesRes] = await Promise.all([
          apiGet<UiConfig>("/api/v1/config/ui", {
            loadingKey: "asset_coverage_report_boot",
          }),
          apiGet<any>("/api/v1/config/asset-types", {
            loadingKey: "asset_coverage_report_types",
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
        setAssetTypesItems(normalizeAssetTypes(assetTypesRes));
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

        setErr(eAny?.message || "Failed to initialize asset coverage report");
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
        const [vendorRes, contractRes] = await Promise.all([
          apiGet<any>("/api/v1/vendors?page=1&page_size=100", {
            loadingKey: "asset_coverage_vendor_options",
          }),
          apiGet<any>("/api/v1/contracts?page=1&page_size=100", {
            loadingKey: "asset_coverage_contract_options",
          }),
        ]);

        if (cancelled) return;

        setVendorOptions(normalizeVendorOptions(vendorRes));
        setContractOptions(normalizeContractOptions(contractRes));
      } catch {
        if (cancelled) return;
        setVendorOptions([]);
        setContractOptions([]);
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
        const listQs = new URLSearchParams();
        if (q) listQs.set("q", q);
        if (type_code) listQs.set("type_code", type_code);
        if (coverage_kind) listQs.set("coverage_kind", coverage_kind);
        if (health) listQs.set("health", health);
        if (vendor_id) listQs.set("vendor_id", vendor_id);
        if (contract_id) listQs.set("contract_id", contract_id);
        if (contract_health) listQs.set("contract_health", contract_health);
        if (link_status) listQs.set("link_status", link_status);
        if (expiring_in_days) listQs.set("expiring_in_days", expiring_in_days);
        listQs.set("page", String(page));
        listQs.set("page_size", String(pageSize));

        const summaryQs = new URLSearchParams();
        if (q) summaryQs.set("q", q);
        if (type_code) summaryQs.set("type_code", type_code);
        if (coverage_kind) summaryQs.set("coverage_kind", coverage_kind);
        if (health) summaryQs.set("health", health);
        if (vendor_id) summaryQs.set("vendor_id", vendor_id);
        if (contract_id) summaryQs.set("contract_id", contract_id);
        if (contract_health) summaryQs.set("contract_health", contract_health);
        if (link_status) summaryQs.set("link_status", link_status);
        if (expiring_in_days) summaryQs.set("expiring_in_days", expiring_in_days);

        const [summaryRes, listRes] = await Promise.all([
          apiGet<any>(
            `/api/v1/reports/asset-coverage/summary?${summaryQs.toString()}`,
            {
              loadingKey: "asset_coverage_summary",
            }
          ),
          apiGet<any>(`/api/v1/reports/asset-coverage?${listQs.toString()}`, {
            loadingKey: "asset_coverage_list",
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

        setErr(eAny?.message || "Failed to load asset coverage report");
        setSummary({
          active_count: 0,
          expiring_count: 0,
          expired_count: 0,
          no_coverage_count: 0,
          no_end_date_count: 0,

          rows_with_linked_contract: 0,
          rows_without_linked_contract: 0,
          rows_with_active_contract: 0,
          rows_with_expiring_contract: 0,
          rows_with_expired_contract: 0,
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
    type_code,
    coverage_kind,
    health,
    vendor_id,
    contract_id,
    contract_health,
    link_status,
    expiring_in_days,
    page,
    pageSize,
    router,
  ]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();

    const nextHref = buildReportHref({
      q: qInput.trim(),
      type_code: typeCodeInput.trim(),
      coverage_kind: coverageKindInput.trim(),
      health: healthInput.trim(),
      vendor_id: normalizePositiveIntString(vendorIdInput),
      contract_id: normalizePositiveIntString(contractIdInput),
      contract_health: contractHealthInput.trim(),
      link_status: linkStatusInput.trim(),
      expiring_in_days: normalizePositiveIntString(expiringInput),
      page: 1,
      pageSize: Number(pageSizeInput),
    });

    router.push(nextHref);
  }

  function onReset() {
    const nextHref = buildReportHref({
      q: "",
      type_code: "",
      coverage_kind: "",
      health: "",
      vendor_id: "",
      contract_id: "",
      contract_health: "",
      link_status: "",
      expiring_in_days: "",
      page: 1,
      pageSize: pageSizeDefault,
    });
    router.push(nextHref);
  }

  async function onExportExcel() {
    try {
      setExporting(true);
      setErr(null);

      const qs = buildExportQuery({
        q,
        type_code,
        coverage_kind,
        health,
        vendor_id,
        contract_id,
        contract_health,
        link_status,
        expiring_in_days,
      });

      const url = `${API_BASE}/api/v1/reports/asset-coverage/export.xlsx${
        qs ? `?${qs}` : ""
      }`;

      const res = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const json = await parseJsonSafe(res);
        throw new Error(
          json?.error?.message || json?.message || "Failed to export Excel"
        );
      }

      const blob = await res.blob();
      const filename =
        filenameFromDisposition(res.headers.get("content-disposition")) ||
        `asset-coverage-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
            Loading asset coverage report...
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
                Asset Coverage Report
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                Monitoring coverage warranty, support, dan subscription per asset
                dengan konteks contract dan vendor.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-cyan-600 px-3 py-2 text-xs font-semibold text-white">
                  Coverage
                </span>
                <Link
                  href="/reports/asset-mapping"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mapping
                </Link>
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
                >
                  <option value="">All types</option>
                  {assetTypesItems.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label} ({t.code})
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
                  {COVERAGE_KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Coverage Health
                </label>
                <select
                  value={healthInput}
                  onChange={(e) => setHealthInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {HEALTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Vendor
                </label>
                <select
                  value={vendorIdInput}
                  onChange={(e) => setVendorIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">
                    {optionsLoading ? "Loading vendors..." : "All vendors"}
                  </option>
                  {vendor_id && !vendorHasCurrentValue ? (
                    <option value={vendor_id}>Selected Vendor #{vendor_id}</option>
                  ) : null}
                  {vendorOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.vendor_code} - {item.vendor_name}
                      {item.status ? ` (${item.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Contract
                </label>
                <select
                  value={contractIdInput}
                  onChange={(e) => setContractIdInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                  disabled={optionsLoading}
                >
                  <option value="">
                    {optionsLoading ? "Loading contracts..." : "All contracts"}
                  </option>
                  {contractIdInput && !contractHasCurrentValue ? (
                    <option value={contractIdInput}>
                      Selected Contract #{contractIdInput}
                    </option>
                  ) : null}
                  {filteredContractOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.contract_code} - {item.contract_name}
                      {item.vendor_name ? ` | ${item.vendor_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Contract Impact
                </label>
                <select
                  value={contractHealthInput}
                  onChange={(e) => setContractHealthInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {CONTRACT_HEALTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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
                  onChange={(e) => setLinkStatusInput(e.target.value as LinkStatusFilter)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                >
                  {LINK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Expiring In Days
                </label>
                <input
                  type="number"
                  min={1}
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
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={String(n)}>
                      {n} / page
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

                <button
                  type="submit"
                  className="itam-primary-action"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Active Coverage" value={summary.active_count} tone="green" />
          <StatCard label="Expiring Coverage" value={summary.expiring_count} tone="amber" />
          <StatCard label="Expired Coverage" value={summary.expired_count} tone="rose" />
          <StatCard label="No Coverage" value={summary.no_coverage_count} />
          <StatCard label="No End Date" value={summary.no_end_date_count} />

          <StatCard
            label="Linked Contract Rows"
            value={summary.rows_with_linked_contract}
            tone="cyan"
          />
          <StatCard label="No Link Rows" value={summary.rows_without_linked_contract} />
          <StatCard
            label="Active Contract"
            value={summary.rows_with_active_contract}
            tone="green"
          />
          <StatCard
            label="Expiring Contract"
            value={summary.rows_with_expiring_contract}
            tone="amber"
          />
          <StatCard
            label="Expired Contract"
            value={summary.rows_with_expired_contract}
            tone="rose"
          />
        </div>

        <div className="mt-10 rounded-3xl border border-white bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">Total rows: {total}</div>
              <div className="text-sm text-slate-500">
                Contract no end date rows:{" "}
                <span className="font-medium text-slate-700">
                  {summary.rows_with_no_end_date_contract}
                </span>
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
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type / State</th>
                    <th className="px-4 py-3 font-medium">Coverage</th>
                    <th className="px-4 py-3 font-medium">Start Date</th>
                    <th className="px-4 py-3 font-medium">End Date</th>
                    <th className="px-4 py-3 font-medium">Coverage Health</th>
                    <th className="px-4 py-3 font-medium">Days</th>
                    <th className="px-4 py-3 font-medium">Linked Contracts</th>
                    <th className="px-4 py-3 font-medium">Vendors</th>
                    <th className="px-4 py-3 font-medium">Contract Impact</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {listLoading ? (
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
                        Tidak ada data asset coverage.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={`${item.asset_id}-${item.coverage_kind}-${item.start_date ?? "null"}-${item.end_date ?? "null"}`}
                        className="align-top"
                      >
                        <td className="px-4 py-4 font-mono text-xs">
                          <Link
                            href={`/assets/${item.asset_id}?return_to=${encodeURIComponent(currentReportHref)}`}
                            className="text-cyan-700 hover:underline"
                          >
                            {item.asset_tag}
                          </Link>
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Status: {item.status || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-700">
                          <div>
                            {item.asset_type?.label
                              ? `${item.asset_type.label} (${item.asset_type.code})`
                              : "-"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            State:{" "}
                            {item.state?.label
                              ? `${item.state.label} (${item.state.code})`
                              : "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={coverageKindPill(item.coverage_kind)}>
                            {coverageKindLabel(item.coverage_kind)}
                          </span>
                        </td>

                        <td className="px-4 py-4">{fmtDate(item.start_date)}</td>
                        <td className="px-4 py-4">{fmtDate(item.end_date)}</td>

                        <td className="px-4 py-4">
                          <span className={healthPill(item.coverage_health)}>
                            {item.coverage_health}
                          </span>
                        </td>

                        <td className="px-4 py-4">{fmtDays(item.days_to_expiry)}</td>

                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">
                            {item.linked_contracts_count} contract
                            {item.linked_contracts_count === 1 ? "" : "s"}
                          </div>
                          {renderContractPreview(
                            item.contract_preview_items,
                            item.contract_codes_preview,
                            currentReportHref
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">
                            {item.linked_vendors_count} vendor
                            {item.linked_vendors_count === 1 ? "" : "s"}
                          </div>
                          {renderVendorPreview(
                            item.vendor_preview_items,
                            item.vendor_names_preview,
                            currentReportHref
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div>
                            <span className={contractImpactPill(item.contract_health_rollup)}>
                              {contractImpactLabel(item.contract_health_rollup)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.has_active_contract ? "A" : "-"} /{" "}
                            {item.has_expiring_contract ? "E" : "-"} /{" "}
                            {item.has_expired_contract ? "X" : "-"} /{" "}
                            {item.has_no_end_date_contract ? "N" : "-"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <Link
                            href={`/assets/${item.asset_id}?return_to=${encodeURIComponent(currentReportHref)}`}
                            className="text-cyan-700 hover:underline"
                          >
                            View Asset
                          </Link>
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
                      type_code,
                      coverage_kind,
                      health,
                      vendor_id,
                      contract_id,
                      contract_health,
                      link_status,
                      expiring_in_days,
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
                      type_code,
                      coverage_kind,
                      health,
                      vendor_id,
                      contract_id,
                      contract_health,
                      link_status,
                      expiring_in_days,
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
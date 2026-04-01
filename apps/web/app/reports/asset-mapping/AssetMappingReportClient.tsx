"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "../../lib/api";
import { ErrorState, SkeletonTableRow } from "../../lib/loadingComponents";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";

type UiConfig = { page_size_options: number[]; documents_page_size_default: number };
type Item = { id: string; name: string };
type AssetType = { code: string; label: string };
type CoverageKind = "WARRANTY" | "SUPPORT" | "SUBSCRIPTION" | "NONE";
type CoverageHealth = "ACTIVE" | "EXPIRING" | "EXPIRED" | "NO_COVERAGE" | "NO_END_DATE";
type ContractHealthRollup = "NO_LINK" | "ACTIVE_ONLY" | "HAS_NO_END_DATE" | "HAS_EXPIRING" | "HAS_EXPIRED";
type LinkStatusFilter = "" | "LINKED" | "NO_LINK";
type AssetMappingItem = {
  asset_id: number;
  asset_tag: string;
  name: string;
  status: string | null;
  asset_type: AssetType;
  state: AssetType | null;
  department: AssetType | null;
  location: AssetType | null;
  owner_identity: { id: number; name: string; email: string | null } | null;
  coverage_kind: CoverageKind;
  start_date: string | null;
  end_date: string | null;
  coverage_health: CoverageHealth;
  days_to_expiry: number | null;
  linked_contracts_count: number;
  linked_vendors_count: number;
  has_active_contract: boolean;
  has_expiring_contract: boolean;
  has_expired_contract: boolean;
  has_no_end_date_contract: boolean;
  contract_health_rollup: ContractHealthRollup;
  contract_codes_preview: string[];
  vendor_names_preview: string[];
  contract_preview_items: { id: number; code: string }[];
  vendor_preview_items: { id: number; name: string }[];
};
type Summary = {
  active_count: number;
  expiring_count: number;
  expired_count: number;
  no_coverage_count: number;
  no_end_date_count: number;
  rows_with_department: number;
  rows_with_location: number;
  rows_with_owner: number;
  rows_with_linked_contract: number;
  rows_without_linked_contract: number;
  rows_with_expiring_contract: number;
  rows_with_no_end_date_contract: number;
};
type ListData = { items: AssetMappingItem[]; page: number; page_size: number; total: number };

const COVERAGE_KIND_OPTIONS = [
  { value: "", label: "All coverage" },
  { value: "WARRANTY", label: "Warranty" },
  { value: "SUPPORT", label: "Support" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "NONE", label: "No coverage" },
] as const;
const HEALTH_OPTIONS = [
  { value: "", label: "All health" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring" },
  { value: "EXPIRED", label: "Expired" },
  { value: "NO_COVERAGE", label: "No coverage" },
  { value: "NO_END_DATE", label: "No end date" },
] as const;

function pickInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(n) && !Number.isNaN(n) && n > 0 ? n : fallback;
}
function normalizePositiveIntString(value: string) {
  const s = String(value || "").trim();
  if (!s) return "";
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && !Number.isNaN(n) && n > 0 ? String(n) : "";
}
function unwrap(payload: any) { return payload && typeof payload === "object" && "data" in payload ? payload.data : payload; }
function itemsOf(payload: any) {
  const root = unwrap(payload);
  return Array.isArray(root) ? root : Array.isArray(root?.items) ? root.items : Array.isArray(root?.data?.items) ? root.data.items : [];
}
function fmtDate(v?: string | null) { if (!v) return "-"; const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(); }
function fmtDays(v?: number | null) { return v == null ? "-" : String(v); }
function coverageKindLabel(v: string) { return v === "WARRANTY" ? "Warranty" : v === "SUPPORT" ? "Support" : v === "SUBSCRIPTION" ? "Subscription" : v === "NONE" ? "No coverage" : v || "-"; }
function coverageKindPill(v: string) { const s = String(v || "").toUpperCase(); return s === "WARRANTY" ? "inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200" : s === "SUPPORT" ? "inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200" : s === "SUBSCRIPTION" ? "inline-flex rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-inset ring-cyan-200" : s === "NONE" ? "inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200" : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"; }
function healthPill(v: string) { const s = String(v || "").toUpperCase(); return s === "ACTIVE" ? "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200" : s === "EXPIRING" ? "inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200" : s === "EXPIRED" ? "inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200" : s === "NO_COVERAGE" ? "inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200" : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"; }
function contractImpactLabel(v: ContractHealthRollup | string) { const s = String(v || "").toUpperCase(); return s === "NO_LINK" ? "No link" : s === "ACTIVE_ONLY" ? "Active" : s === "HAS_NO_END_DATE" ? "No end date" : s === "HAS_EXPIRING" ? "Expiring" : s === "HAS_EXPIRED" ? "Expired" : v || "-"; }
function contractImpactPill(v: ContractHealthRollup | string) { const s = String(v || "").toUpperCase(); return s === "NO_LINK" ? "inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200" : s === "ACTIVE_ONLY" ? "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200" : s === "HAS_NO_END_DATE" ? "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200" : s === "HAS_EXPIRING" ? "inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200" : s === "HAS_EXPIRED" ? "inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200" : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200"; }
function previewText(values: string[], limit = 2) { return !values.length ? "-" : values.length <= limit ? values.join(", ") : `${values.slice(0, limit).join(", ")} +${values.length - limit} more`; }
function renderContractPreview(items: { id: number; code: string }[], fallback: string[]): ReactNode { if (items.length) { const visible = items.slice(0, 2); const remaining = items.length - visible.length; return (<><div className="mt-1 flex flex-wrap gap-1">{visible.map((item) => <Link key={item.id} href={`/contracts/${item.id}`} className="text-xs text-blue-700 hover:underline">{item.code}</Link>)}</div>{remaining > 0 ? <div className="mt-1 text-xs text-gray-500">+{remaining} more</div> : null}</>); } return <div className="mt-1 text-xs text-gray-500">{previewText(fallback)}</div>; }
function renderVendorPreview(items: { id: number; name: string }[], fallback: string[]): ReactNode { if (items.length) { const visible = items.slice(0, 2); const remaining = items.length - visible.length; return (<><div className="mt-1 flex flex-wrap gap-1">{visible.map((item) => <Link key={item.id} href={`/vendors/${item.id}`} className="text-xs text-blue-700 hover:underline">{item.name}</Link>)}</div>{remaining > 0 ? <div className="mt-1 text-xs text-gray-500">+{remaining} more</div> : null}</>); } return <div className="mt-1 text-xs text-gray-500">{previewText(fallback)}</div>; }
function filenameFromDisposition(headerValue: string | null) { if (!headerValue) return null; const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i); if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]); const plainMatch = headerValue.match(/filename="([^"]+)"/i) || headerValue.match(/filename=([^;]+)/i); return plainMatch?.[1]?.trim() || null; }
function normalizeItemSelect(res: any): Item[] { return itemsOf(res).map((x: any) => ({ id: String(x?.id ?? ""), name: String(x?.name ?? x?.display_name ?? "") })).filter((x: Item) => x.id && x.name); }
function normalizeAssetTypes(res: any): AssetType[] { return itemsOf(res).map((x: any) => ({ code: String(x?.code ?? ""), label: String(x?.label ?? x?.name ?? "") })).filter((x: AssetType) => x.code && x.label); }
function normalizeList(res: any): ListData {
  const raw = unwrap(res)?.data ?? unwrap(res) ?? {};
  const items = Array.isArray(raw.items) ? raw.items.map((x: any) => ({
    asset_id: Number(x.asset_id ?? 0), asset_tag: String(x.asset_tag ?? ""), name: String(x.name ?? ""), status: x.status == null ? null : String(x.status),
    asset_type: { code: String(x.asset_type?.code ?? ""), label: String(x.asset_type?.label ?? "") },
    state: x.state ? { code: String(x.state?.code ?? ""), label: String(x.state?.label ?? "") } : null,
    department: x.department ? { code: String(x.department?.code ?? ""), label: String(x.department?.label ?? "") } : null,
    location: x.location ? { code: String(x.location?.code ?? ""), label: String(x.location?.label ?? "") } : null,
    owner_identity: x.owner_identity ? { id: Number(x.owner_identity?.id ?? 0), name: String(x.owner_identity?.name ?? ""), email: x.owner_identity?.email == null ? null : String(x.owner_identity?.email) } : null,
    coverage_kind: String(x.coverage_kind ?? "NONE") as CoverageKind, start_date: x.start_date == null ? null : String(x.start_date), end_date: x.end_date == null ? null : String(x.end_date),
    coverage_health: String(x.coverage_health ?? "NO_COVERAGE") as CoverageHealth, days_to_expiry: x.days_to_expiry == null ? null : Number(x.days_to_expiry),
    linked_contracts_count: Number(x.linked_contracts_count ?? 0), linked_vendors_count: Number(x.linked_vendors_count ?? 0), has_active_contract: Boolean(x.has_active_contract), has_expiring_contract: Boolean(x.has_expiring_contract), has_expired_contract: Boolean(x.has_expired_contract), has_no_end_date_contract: Boolean(x.has_no_end_date_contract), contract_health_rollup: String(x.contract_health_rollup ?? "NO_LINK") as ContractHealthRollup,
    contract_codes_preview: Array.isArray(x.contract_codes_preview) ? x.contract_codes_preview.map(String) : [], vendor_names_preview: Array.isArray(x.vendor_names_preview) ? x.vendor_names_preview.map(String) : [],
    contract_preview_items: Array.isArray(x.contract_preview_items) ? x.contract_preview_items.map((i: any) => ({ id: Number(i?.id ?? 0), code: String(i?.code ?? "") })) : [], vendor_preview_items: Array.isArray(x.vendor_preview_items) ? x.vendor_preview_items.map((i: any) => ({ id: Number(i?.id ?? 0), name: String(i?.name ?? "") })) : [],
  })) : [];
  return { items, page: Number(raw.page ?? 1), page_size: Number(raw.page_size ?? 10), total: Number(raw.total ?? 0) };
}
function normalizeSummary(res: any): Summary {
  const raw = unwrap(res)?.data ?? unwrap(res) ?? {};
  return { active_count: Number(raw.active_count ?? 0), expiring_count: Number(raw.expiring_count ?? 0), expired_count: Number(raw.expired_count ?? 0), no_coverage_count: Number(raw.no_coverage_count ?? 0), no_end_date_count: Number(raw.no_end_date_count ?? 0), rows_with_department: Number(raw.rows_with_department ?? 0), rows_with_location: Number(raw.rows_with_location ?? 0), rows_with_owner: Number(raw.rows_with_owner ?? 0), rows_with_linked_contract: Number(raw.rows_with_linked_contract ?? 0), rows_without_linked_contract: Number(raw.rows_without_linked_contract ?? 0), rows_with_expiring_contract: Number(raw.rows_with_expiring_contract ?? 0), rows_with_no_end_date_contract: Number(raw.rows_with_no_end_date_contract ?? 0) };
}
async function parseJsonSafe(res: Response) { try { return await res.json(); } catch { return null; } }

export default function AssetMappingReportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bootLoading, setBootLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([]);
  const [pageSizeDefault, setPageSizeDefault] = useState(10);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [departments, setDepartments] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Item[]>([]);
  const [owners, setOwners] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary>({ active_count: 0, expiring_count: 0, expired_count: 0, no_coverage_count: 0, no_end_date_count: 0, rows_with_department: 0, rows_with_location: 0, rows_with_owner: 0, rows_with_linked_contract: 0, rows_without_linked_contract: 0, rows_with_expiring_contract: 0, rows_with_no_end_date_contract: 0 });
  const [data, setData] = useState<ListData>({ items: [], page: 1, page_size: 10, total: 0 });

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
  const pageSize = useMemo(() => { const c = pickInt(searchParams.get("page_size"), pageSizeDefault); return pageSizeOptions.includes(c) ? c : pageSizeDefault; }, [searchParams, pageSizeDefault, pageSizeOptions]);

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

  const total = data.total || 0;
  const items = data.items || [];
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => { setQInput(q); setTypeCodeInput(typeCode); setDepartmentIdInput(departmentId); setLocationIdInput(locationId); setOwnerIdentityIdInput(ownerIdentityId); setCoverageKindInput(coverageKind); setHealthInput(health); setLinkStatusInput(linkStatus); setExpiringInput(expiringInDays); setPageSizeInput(String(pageSize)); }, [q, typeCode, departmentId, locationId, ownerIdentityId, coverageKind, health, linkStatus, expiringInDays, pageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true); setErr(null);
      try {
        const [cfgRes, typeRes] = await Promise.all([
          apiGet<UiConfig>("/api/v1/config/ui", { loadingKey: "asset_mapping_boot" }),
          apiGet<any>("/api/v1/config/asset-types", { loadingKey: "asset_mapping_types" }),
        ]);
        if (cancelled) return;
        const cfg = cfgRes.data; const options = Array.isArray(cfg?.page_size_options) ? cfg.page_size_options.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []; const def = Number(cfg?.documents_page_size_default); const nextDefault = options.includes(def) ? def : options[0] || 10;
        setPageSizeOptions(options); setPageSizeDefault(nextDefault); setAssetTypes(normalizeAssetTypes(typeRes));
      } catch (eAny: any) {
        if (eAny?.code === "AUTH_REQUIRED" || eAny?.code === "AUTH_UNAUTHORIZED" || eAny?.http_status === 401) { router.replace("/login"); router.refresh(); return; }
        setErr(eAny?.message || "Failed to initialize asset report");
      } finally { if (!cancelled) setBootLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (bootLoading) return;
      setOptionsLoading(true);
      try {
        const [departmentRes, locationRes, ownerRes] = await Promise.all([
          apiGet<any>("/api/v1/departments?page=1&page_size=100", { loadingKey: "asset_mapping_departments" }),
          apiGet<any>("/api/v1/locations?page=1&page_size=100", { loadingKey: "asset_mapping_locations" }),
          apiGet<any>("/api/v1/identities?page=1&page_size=100", { loadingKey: "asset_mapping_identities" }),
        ]);
        if (cancelled) return;
        setDepartments(normalizeItemSelect(departmentRes)); setLocations(normalizeItemSelect(locationRes)); setOwners(normalizeItemSelect(ownerRes));
      } catch { if (!cancelled) { setDepartments([]); setLocations([]); setOwners([]); } }
      finally { if (!cancelled) setOptionsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [bootLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (bootLoading || !pageSize) return;
      setErr(null); setSummaryLoading(true); setListLoading(true);
      try {
        const listQs = new URLSearchParams();
        if (q) listQs.set("q", q); if (typeCode) listQs.set("type_code", typeCode); if (departmentId) listQs.set("department_id", departmentId); if (locationId) listQs.set("location_id", locationId); if (ownerIdentityId) listQs.set("owner_identity_id", ownerIdentityId); if (coverageKind) listQs.set("coverage_kind", coverageKind); if (health) listQs.set("health", health); if (linkStatus) listQs.set("link_status", linkStatus); if (expiringInDays) listQs.set("expiring_in_days", expiringInDays); listQs.set("page", String(page)); listQs.set("page_size", String(pageSize));
        const summaryQs = new URLSearchParams(listQs); summaryQs.delete("page"); summaryQs.delete("page_size");
        const [summaryRes, listRes] = await Promise.all([
          apiGet<any>(`/api/v1/reports/asset-mapping/summary?${summaryQs.toString()}`, { loadingKey: "asset_mapping_summary" }),
          apiGet<any>(`/api/v1/reports/asset-mapping?${listQs.toString()}`, { loadingKey: "asset_mapping_list" }),
        ]);
        if (cancelled) return;
        setSummary(normalizeSummary(summaryRes)); setData(normalizeList(listRes));
      } catch (eAny: any) {
        if (eAny?.code === "AUTH_REQUIRED" || eAny?.code === "AUTH_UNAUTHORIZED" || eAny?.http_status === 401) { router.replace("/login"); router.refresh(); return; }
        setErr(eAny?.message || "Failed to load asset report"); setData({ items: [], page: 1, page_size: pageSize, total: 0 });
      } finally { if (!cancelled) { setSummaryLoading(false); setListLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [bootLoading, q, typeCode, departmentId, locationId, ownerIdentityId, coverageKind, health, linkStatus, expiringInDays, page, pageSize, router]);
  function queryFromInputs(pageNo: number, pageSizeValue = Number(pageSizeInput) || pageSizeDefault) {
    const p = new URLSearchParams();
    const qTrim = qInput.trim();
    const typeTrim = typeCodeInput.trim();
    const deptTrim = normalizePositiveIntString(departmentIdInput);
    const locTrim = normalizePositiveIntString(locationIdInput);
    const ownerTrim = normalizePositiveIntString(ownerIdentityIdInput);
    const coverageTrim = coverageKindInput.trim();
    const healthTrim = healthInput.trim();
    const linkTrim = linkStatusInput.trim();
    const expiringTrim = normalizePositiveIntString(expiringInput);

    if (qTrim) p.set("q", qTrim);
    if (typeTrim) p.set("type_code", typeTrim);
    if (deptTrim) p.set("department_id", deptTrim);
    if (locTrim) p.set("location_id", locTrim);
    if (ownerTrim) p.set("owner_identity_id", ownerTrim);
    if (coverageTrim) p.set("coverage_kind", coverageTrim);
    if (healthTrim) p.set("health", healthTrim);
    if (linkTrim) p.set("link_status", linkTrim);
    if (expiringTrim) p.set("expiring_in_days", expiringTrim);
    p.set("page", String(pageNo));
    p.set("page_size", String(pageSizeValue));
    return `/reports/asset-mapping?${p.toString()}`;
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    router.push(queryFromInputs(1));
  }

  function onReset() {
    router.push(`/reports/asset-mapping?page=1&page_size=${pageSizeDefault}`);
  }

  async function onExportExcel() {
    try {
      setExporting(true);
      setErr(null);

      const qs = new URLSearchParams();
      const qTrim = qInput.trim();
      const typeTrim = typeCodeInput.trim();
      const deptTrim = normalizePositiveIntString(departmentIdInput);
      const locTrim = normalizePositiveIntString(locationIdInput);
      const ownerTrim = normalizePositiveIntString(ownerIdentityIdInput);
      const coverageTrim = coverageKindInput.trim();
      const healthTrim = healthInput.trim();
      const linkTrim = linkStatusInput.trim();
      const expiringTrim = normalizePositiveIntString(expiringInput);

      if (qTrim) qs.set("q", qTrim);
      if (typeTrim) qs.set("type_code", typeTrim);
      if (deptTrim) qs.set("department_id", deptTrim);
      if (locTrim) qs.set("location_id", locTrim);
      if (ownerTrim) qs.set("owner_identity_id", ownerTrim);
      if (coverageTrim) qs.set("coverage_kind", coverageTrim);
      if (healthTrim) qs.set("health", healthTrim);
      if (linkTrim) qs.set("link_status", linkTrim);
      if (expiringTrim) qs.set("expiring_in_days", expiringTrim);

      const res = await fetch(`${API_BASE}/api/v1/reports/asset-mapping/export.xlsx${qs.toString() ? `?${qs.toString()}` : ""}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const json = await parseJsonSafe(res);
        throw new Error(json?.error?.message || json?.message || "Failed to export Excel");
      }

      const blob = await res.blob();
      const filename = filenameFromDisposition(res.headers.get("content-disposition")) || `asset-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (eAny: any) {
      if (eAny?.code === "AUTH_REQUIRED" || eAny?.code === "AUTH_UNAUTHORIZED" || eAny?.http_status === 401) {
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
      <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            Loading asset report...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_55%,#eef6fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.10),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(14,165,233,0.08),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_22%)]" />
      <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-300/8 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10 lg:py-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-700">
              Asset Report
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Coverage dan mapping
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Coverage dan mapping sudah digabung dalam satu tabel dan satu export Excel.
            </p>
          </div>
          <div className="flex gap-2">
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

        {err ? (
          <div className="mt-6">
            <ErrorState error={err} onRetry={() => window.location.reload()} />
          </div>
        ) : null}

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <form className="grid grid-cols-1 gap-4 lg:grid-cols-6" onSubmit={onSearchSubmit}>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Search</label>
              <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search asset tag / name..." className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Asset Type</label>
              <select value={typeCodeInput} onChange={(e) => setTypeCodeInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100">
                <option value="">All types</option>
                {assetTypes.map((item) => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Department</label>
              <select value={departmentIdInput} onChange={(e) => setDepartmentIdInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" disabled={optionsLoading}>
                <option value="">{optionsLoading ? "Loading departments..." : "All departments"}</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
              <select value={locationIdInput} onChange={(e) => setLocationIdInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" disabled={optionsLoading}>
                <option value="">{optionsLoading ? "Loading locations..." : "All locations"}</option>
                {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Owner</label>
              <select value={ownerIdentityIdInput} onChange={(e) => setOwnerIdentityIdInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" disabled={optionsLoading}>
                <option value="">{optionsLoading ? "Loading owners..." : "All owners"}</option>
                {owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Coverage</label>
              <select value={coverageKindInput} onChange={(e) => setCoverageKindInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100">
                {COVERAGE_KIND_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Health</label>
              <select value={healthInput} onChange={(e) => setHealthInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100">
                {HEALTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Link Status</label>
              <select value={linkStatusInput} onChange={(e) => setLinkStatusInput(e.target.value as LinkStatusFilter)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100">
                <option value="">All rows</option>
                <option value="LINKED">Linked only</option>
                <option value="NO_LINK">No link only</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Expiring In Days</label>
              <input type="number" min={1} value={expiringInput} onChange={(e) => setExpiringInput(e.target.value)} placeholder="e.g. 30" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Page Size</label>
              <select value={pageSizeInput} onChange={(e) => setPageSizeInput(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100">
                {pageSizeOptions.map((n) => <option key={n} value={String(n)}>{n} / page</option>)}
              </select>
            </div>
            <div className="lg:col-span-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={onReset} className="itam-secondary-action">
                Reset
              </button>
              <button type="submit" className="itam-primary-action">Search</button>
            </div>
          </form>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mapped Department</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.rows_with_department}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mapped Location</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.rows_with_location}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mapped Owner</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.rows_with_owner}</div></div>
          <div className="rounded-3xl border border-cyan-200 bg-cyan-50/40 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Linked Contract Rows</div><div className="mt-2 text-2xl font-semibold tracking-tight text-cyan-800">{summaryLoading ? "-" : summary.rows_with_linked_contract}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">No Link Rows</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.rows_without_linked_contract}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">No Coverage</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.no_coverage_count}</div></div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Active Coverage</div><div className="mt-2 text-2xl font-semibold tracking-tight text-emerald-800">{summaryLoading ? "-" : summary.active_count}</div></div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50/40 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Expiring Coverage</div><div className="mt-2 text-2xl font-semibold tracking-tight text-amber-800">{summaryLoading ? "-" : summary.expiring_count}</div></div>
          <div className="rounded-3xl border border-rose-200 bg-rose-50/40 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Expired Coverage</div><div className="mt-2 text-2xl font-semibold tracking-tight text-rose-800">{summaryLoading ? "-" : summary.expired_count}</div></div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">No End Date</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{summaryLoading ? "-" : summary.no_end_date_count}</div></div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <div>Total rows: {total}</div>
            <div>
              Contract no end date rows: <span className="font-medium text-slate-700">{summaryLoading ? "-" : summary.rows_with_no_end_date_contract}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1400px] w-full text-[13px] leading-6">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-4 py-4 pr-6 font-medium">Asset Tag</th>
                  <th className="px-4 py-4 pr-6 font-medium">Asset</th>
                  <th className="px-4 py-4 pr-6 font-medium">Type / State</th>
                  <th className="px-4 py-4 pr-6 font-medium">Department</th>
                  <th className="px-4 py-4 pr-6 font-medium">Location</th>
                  <th className="px-4 py-4 pr-6 font-medium">Owner</th>
                  <th className="px-4 py-4 pr-6 font-medium">Coverage</th>
                  <th className="px-4 py-4 pr-6 font-medium">Dates</th>
                  <th className="px-4 py-4 pr-6 font-medium">Coverage Health</th>
                  <th className="px-4 py-4 pr-6 font-medium">Linked Contracts</th>
                  <th className="px-4 py-4 pr-6 font-medium">Vendors</th>
                  <th className="px-4 py-4 pr-6 font-medium">Contract Impact</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <>
                    <SkeletonTableRow cols={12} />
                    <SkeletonTableRow cols={12} />
                    <SkeletonTableRow cols={12} />
                  </>
                ) : items.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={12} className="px-4 py-10 text-slate-600">Tidak ada data asset mapping.</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={`${item.asset_id}-${item.coverage_kind}-${item.start_date ?? "null"}-${item.end_date ?? "null"}`} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-5 pr-6 font-mono text-xs">
                        <Link href={`/assets/${item.asset_id}`} className="font-medium text-cyan-700 hover:text-cyan-800">{item.asset_tag}</Link>
                      </td>
                      <td className="px-4 py-5 pr-6">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">Status: {item.status || "-"}</div>
                      </td>
                      <td className="px-4 py-5 pr-6">
                        <div className="text-slate-900">{item.asset_type?.label ? `${item.asset_type.label} (${item.asset_type.code})` : "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">State: {item.state?.label ? `${item.state.label} (${item.state.code})` : "-"}</div>
                      </td>
                      <td className="px-4 py-5 pr-6 text-slate-700">{item.department?.label ? `${item.department.label} (${item.department.code})` : "-"}</td>
                      <td className="px-4 py-5 pr-6 text-slate-700">{item.location?.label ? `${item.location.label} (${item.location.code})` : "-"}</td>
                      <td className="px-4 py-5 pr-6 text-slate-700">
                        {item.owner_identity ? (
                          <div>
                            <div className="font-medium text-slate-900">{item.owner_identity.name}</div>
                            {item.owner_identity.email ? <div className="mt-1 text-xs text-slate-500">{item.owner_identity.email}</div> : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-5 pr-6"><span className={coverageKindPill(item.coverage_kind)}>{coverageKindLabel(item.coverage_kind)}</span></td>
                      <td className="px-4 py-5 pr-6 text-slate-700"><div>Start: {fmtDate(item.start_date)}</div><div className="mt-1 text-xs text-slate-500">End: {fmtDate(item.end_date)}</div></td>
                      <td className="px-4 py-5 pr-6"><span className={healthPill(item.coverage_health)}>{item.coverage_health}</span><div className="mt-1 text-xs text-slate-500">{fmtDays(item.days_to_expiry)} days</div></td>
                      <td className="px-4 py-5 pr-6 text-slate-700">
                        <div className="font-medium text-slate-900">{item.linked_contracts_count} contract{item.linked_contracts_count === 1 ? "" : "s"}</div>
                        {renderContractPreview(item.contract_preview_items, item.contract_codes_preview)}
                      </td>
                      <td className="px-4 py-5 pr-6 text-slate-700">
                        <div className="font-medium text-slate-900">{item.linked_vendors_count} vendor{item.linked_vendors_count === 1 ? "" : "s"}</div>
                        {renderVendorPreview(item.vendor_preview_items, item.vendor_names_preview)}
                      </td>
                      <td className="px-4 py-5 pr-6">
                        <div><span className={contractImpactPill(item.contract_health_rollup)}>{contractImpactLabel(item.contract_health_rollup)}</span></div>
                        <div className="mt-1 text-xs text-slate-500">{item.has_active_contract ? "A" : "-"} / {item.has_expiring_contract ? "E" : "-"} / {item.has_expired_contract ? "X" : "-"} / {item.has_no_end_date_contract ? "N" : "-"}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <div>Page {data.page} of {totalPages}</div>
            <div className="flex gap-2">
              <button type="button" disabled={!canPrev} onClick={() => router.push(queryFromInputs(page - 1, pageSize))} className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
              <button type="button" disabled={!canNext} onClick={() => router.push(queryFromInputs(page + 1, pageSize))} className="itam-secondary-action-sm disabled:cursor-not-allowed disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

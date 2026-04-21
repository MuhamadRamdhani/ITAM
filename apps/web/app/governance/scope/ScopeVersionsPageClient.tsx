"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { canManageGovernance } from "../../lib/governanceAccess";
import { apiGet, apiPostJson } from "../../lib/api";
import { SkeletonTableRow, ErrorState } from "../../lib/loadingComponents";

type ScopeVersion = {
  id: number | string;
  tenant_id: number | string;
  version_no: number;
  status: string;
  scope_json: any;
  note?: string | null;
  created_by_user_id?: number | string | null;
  updated_by_user_id?: number | string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  activated_at?: string | null;
  superseded_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ScopeVersionsListData = {
  items: ScopeVersion[];
  total: number;
  page: number;
  page_size: number;
};

type UiConfigNormalized = {
  pageSizeOptions: number[];
  pageSizeDefault: number;
};

type AssetTypeItem = {
  code: string;
  label: string;
  active?: boolean;
};

type DepartmentItem = {
  id: number;
  name: string;
  code?: string;
};

type LocationItem = {
  id: number;
  name: string;
  code?: string;
};

type DropdownSectionProps = {
  title: string;
  summary: string;
  badge?: string;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

type SelectableOptionCardProps = {
  title: string;
  subtitle?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: "sky" | "emerald" | "violet" | "amber";
};

const STATUSES = ["ALL", "DRAFT", "SUBMITTED", "APPROVED", "ACTIVE", "SUPERSEDED"] as const;
const ENV_OPTIONS = ["ON_PREM", "CLOUD", "SAAS"] as const;

function pickInt(raw: string | null | undefined, fallback: number) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

function fmtDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusPill(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "DRAFT") return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800";
  if (s === "SUBMITTED") return "rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800";
  if (s === "APPROVED") return "rounded-full bg-green-50 px-2 py-1 text-xs text-green-800";
  if (s === "ACTIVE") return "rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800";
  if (s === "SUPERSEDED") return "rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700";
  return "rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700";
}

function prettyJson(v: any) {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v);
  }
}

function getErrorMessage(error: unknown, fallback = "Failed to load scope versions") {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  const e = error as any;
  return e?.error?.message || e?.message || fallback;
}

function normalizeUiConfig(res: any): UiConfigNormalized {
  const raw = res?.data?.data ?? res?.data ?? {};
  const optionsRaw = raw?.page_size_options ?? raw?.ui?.page_size?.options ?? [];
  const pageSizeOptions = Array.isArray(optionsRaw)
    ? optionsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const safeOptions = pageSizeOptions.length > 0 ? pageSizeOptions : [10, 20, 50];
  const defaultRaw = Number(
    raw?.documents_page_size_default ??
      raw?.ui?.documents?.page_size?.default ??
      safeOptions[0]
  );
  const pageSizeDefault = safeOptions.includes(defaultRaw) ? defaultRaw : safeOptions[0];

  return { pageSizeOptions: safeOptions, pageSizeDefault };
}

function normalizeScopeVersionsList(res: any): ScopeVersionsListData {
  const raw = res?.data?.data ?? res?.data ?? {};
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    total: Number(raw?.total ?? 0),
    page: Number(raw?.page ?? 1),
    page_size: Number(raw?.page_size ?? 10),
  };
}

function normalizeAssetTypes(res: any): AssetTypeItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map((row: any) => ({
      code: String(row?.code ?? "").trim(),
      label: String(row?.display_name ?? row?.label ?? row?.code ?? "").trim(),
      active: row?.active ?? row?.is_active ?? true,
    }))
    .filter((row: AssetTypeItem) => row.code);
}

function normalizeDepartments(res: any): DepartmentItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map((row: any) => ({
      id: Number(row?.id),
      name: String(row?.name ?? row?.display_name ?? "").trim(),
      code: row?.code ? String(row.code) : undefined,
    }))
    .filter((row: DepartmentItem) => Number.isFinite(row.id) && row.id > 0 && row.name);
}

function normalizeLocations(res: any): LocationItem[] {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map((row: any) => ({
      id: Number(row?.id),
      name: String(row?.name ?? row?.display_name ?? "").trim(),
      code: row?.code ? String(row.code) : undefined,
    }))
    .filter((row: LocationItem) => Number.isFinite(row.id) && row.id > 0 && row.name);
}

function buildHref(params: { status: string; page?: number; pageSize?: number; returnTo?: string }) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "ALL") p.set("status", params.status);
  if (params.page && params.page > 0) p.set("page", String(params.page));
  if (params.pageSize && params.pageSize > 0) p.set("page_size", String(params.pageSize));
  if (params.returnTo && params.returnTo.startsWith("/")) p.set("return_to", params.returnTo);
  const qs = p.toString();
  return qs ? `/governance/scope?${qs}` : "/governance/scope";
}

function toggleString(arr: string[], value: string) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function toggleNumber(arr: number[], value: number) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function optionToneClasses(
  tone: NonNullable<SelectableOptionCardProps["tone"]>,
  selected: boolean
) {
  const map = {
    sky: selected
      ? "border-sky-400 bg-sky-50 text-sky-900 shadow-[0_8px_24px_rgba(14,165,233,0.12)]"
      : "border-slate-200 bg-white text-slate-900 hover:border-sky-300 hover:bg-sky-50/50",
    emerald: selected
      ? "border-emerald-400 bg-emerald-50 text-emerald-900 shadow-[0_8px_24px_rgba(16,185,129,0.10)]"
      : "border-slate-200 bg-white text-slate-900 hover:border-emerald-300 hover:bg-emerald-50/50",
    violet: selected
      ? "border-violet-400 bg-violet-50 text-violet-900 shadow-[0_8px_24px_rgba(139,92,246,0.10)]"
      : "border-slate-200 bg-white text-slate-900 hover:border-violet-300 hover:bg-violet-50/50",
    amber: selected
      ? "border-amber-400 bg-amber-50 text-amber-900 shadow-[0_8px_24px_rgba(245,158,11,0.10)]"
      : "border-slate-200 bg-white text-slate-900 hover:border-amber-300 hover:bg-amber-50/50",
  } as const;

  return map[tone];
}

function optionCheckToneClasses(
  tone: NonNullable<SelectableOptionCardProps["tone"]>,
  selected: boolean
) {
  if (!selected) {
    return "border-slate-300 bg-white text-transparent";
  }

  const map = {
    sky: "border-sky-500 bg-sky-500 text-white",
    emerald: "border-emerald-500 bg-emerald-500 text-white",
    violet: "border-violet-500 bg-violet-500 text-white",
    amber: "border-amber-500 bg-amber-500 text-white",
  } as const;

  return map[tone];
}

function SelectableOptionCard({
  title,
  subtitle,
  selected,
  disabled,
  onClick,
  tone = "sky",
}: SelectableOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        optionToneClasses(tone, selected),
      ].join(" ")}
    >
      <span
        className={[
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition",
          optionCheckToneClasses(tone, selected),
        ].join(" ")}
      >
        ✓
      </span>

      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold leading-5">
          {title}
        </span>

        {subtitle ? (
          <span className="mt-1 block break-words text-xs text-slate-500">
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MultiSelectDropdownSection({
  title,
  summary,
  badge,
  emptyText,
  open,
  onToggle,
  children,
}: DropdownSectionProps) {
  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-4 text-left shadow-sm transition hover:border-sky-400"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 truncate text-xs text-gray-500">{summary || emptyText}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {badge ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700">
              {badge}
            </span>
          ) : null}
          <span className="text-sm text-gray-500">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="text-xs text-slate-500">{emptyText}</div>
            <button
              type="button"
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
              onClick={onToggle}
            >
              Close
            </button>
          </div>

          <div className="max-h-72 overflow-auto">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function ScopeVersionsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") || "ALL").trim() || "ALL";
  const pageFromUrl = pickInt(searchParams.get("page"), 1);
  const pageSizeFromUrl = pickInt(searchParams.get("page_size"), 0);
  const rawReturnTo = searchParams.get("return_to")?.trim() || "";
  const safeReturnTo = rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : "";
  const backHref = safeReturnTo || "/";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ScopeVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSizeOptions, setPageSizeOptions] = useState<number[]>([10, 20, 50]);
  const [pageSize, setPageSize] = useState<number>(10);

  const [assetTypes, setAssetTypes] = useState<AssetTypeItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [canManage, setCanManage] = useState(false);

  const [createNote, setCreateNote] = useState("Initial scope draft");
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>(["HARDWARE", "SOFTWARE", "SAAS"]);
  const [selectedDepartments, setSelectedDepartments] = useState<number[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<number[]>([]);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(["ON_PREM"]);
  const [scopeNotes, setScopeNotes] = useState("");
  const [stakeholderSummary, setStakeholderSummary] = useState("");
  const [openSections, setOpenSections] = useState({
    assetTypes: true,
    departments: false,
    locations: false,
    environments: false,
  });

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const selectedAssetTypeSummary = useMemo(() => {
    if (assetTypes.length === 0) return "";
    const selected = assetTypes.filter((row) => selectedAssetTypes.includes(row.code));
    if (selected.length === 0) return "No asset types selected";
    return selected.map((row) => row.label).join(", ");
  }, [assetTypes, selectedAssetTypes]);

  const selectedDepartmentSummary = useMemo(() => {
    if (departments.length === 0) return "";
    const selected = departments.filter((row) => selectedDepartments.includes(row.id));
    if (selected.length === 0) return "No departments selected";
    return selected.map((row) => row.name).join(", ");
  }, [departments, selectedDepartments]);

  const selectedLocationSummary = useMemo(() => {
    if (locations.length === 0) return "";
    const selected = locations.filter((row) => selectedLocations.includes(row.id));
    if (selected.length === 0) return "No locations selected";
    return selected.map((row) => row.name).join(", ");
  }, [locations, selectedLocations]);

  const selectedEnvironmentSummary = useMemo(() => {
    if (selectedEnvironments.length === 0) return "No environments selected";
    return selectedEnvironments.join(", ");
  }, [selectedEnvironments]);

  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const [cfgRes, listRes, meRes] = await Promise.all([
          apiGet<any>("/api/v1/config/ui", { loadingKey: "scope_config" }),
          apiGet<any>(
            `/api/v1/governance/scope/versions?${(() => {
              const qs = new URLSearchParams();
              if (status && status !== "ALL") qs.set("status", status);
              qs.set("page", String(pageFromUrl));
              qs.set("page_size", String(pageSizeFromUrl || 10));
              return qs.toString();
            })()}`,
            { loadingKey: "scope_list", loadingDelay: 300 }
          ).catch(() => null),
          apiGet<any>("/api/v1/auth/me", { loadingKey: "scope_me" }).catch(() => null),
        ]);

        if (!active) return;

        const cfg = normalizeUiConfig(cfgRes);
        setPageSizeOptions(cfg.pageSizeOptions);

        const effectivePageSize = cfg.pageSizeOptions.includes(pageSizeFromUrl)
          ? pageSizeFromUrl
          : cfg.pageSizeDefault;

        setPageSize(effectivePageSize);

        const finalListRes = listRes
          ? listRes
          : await apiGet<any>(
              `/api/v1/governance/scope/versions?${(() => {
                const qs = new URLSearchParams();
                if (status && status !== "ALL") qs.set("status", status);
                qs.set("page", String(pageFromUrl));
                qs.set("page_size", String(effectivePageSize));
                return qs.toString();
              })()}`
            );

        const data = normalizeScopeVersionsList(finalListRes);
        setItems(data.items);
        setTotal(data.total);

        const meData = meRes?.data?.data ?? meRes?.data ?? {};
        const roles = Array.isArray(meData?.roles) ? meData.roles : [];
        const nextCanManage = canManageGovernance(roles);
        setCanManage(nextCanManage);

        if (nextCanManage) {
          const [assetTypesRes, departmentsRes, locationsRes] = await Promise.all([
            apiGet<any>("/api/v1/admin/asset-types", { loadingKey: "scope_asset_types" }),
            apiGet<any>("/api/v1/admin/departments", { loadingKey: "scope_departments" }),
            apiGet<any>("/api/v1/admin/locations", { loadingKey: "scope_locations" }),
          ]);

          if (!active) return;

          const assetTypeRows = normalizeAssetTypes(assetTypesRes).filter((x) => x.active !== false);
          const departmentRows = normalizeDepartments(departmentsRes);
          const locationRows = normalizeLocations(locationsRes);

          setAssetTypes(assetTypeRows);
          setDepartments(departmentRows);
          setLocations(locationRows);

          if (assetTypeRows.length > 0) {
            setSelectedAssetTypes((prev) => {
              const next = prev.filter((x) => assetTypeRows.some((row) => row.code === x));
              return next.length > 0 ? next : assetTypeRows.slice(0, 3).map((x) => x.code);
            });
          }
        }
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setItems([]);
        setTotal(0);
        setCanManage(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [status, pageFromUrl, pageSizeFromUrl]);

  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const canPrev = pageFromUrl > 1;
  const canNext = pageFromUrl < totalPages;

  const scopeJsonPreview = useMemo(() => {
    return {
      asset_type_codes: selectedAssetTypes,
      department_ids: selectedDepartments,
      location_ids: selectedLocations,
      environments: selectedEnvironments,
      notes: scopeNotes,
      stakeholder_summary: stakeholderSummary,
    };
  }, [
    selectedAssetTypes,
    selectedDepartments,
    selectedLocations,
    selectedEnvironments,
    scopeNotes,
    stakeholderSummary,
  ]);

  const assetTypeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of assetTypes) {
      m.set(row.code, row.label || row.code);
    }
    return m;
  }, [assetTypes]);

  const departmentLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of departments) {
      m.set(row.id, row.name);
    }
    return m;
  }, [departments]);

  const locationLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const row of locations) {
      m.set(row.id, row.name);
    }
    return m;
  }, [locations]);

  const scopeSummary = useMemo(() => {
    return {
      assetTypes: selectedAssetTypes.map((code) => assetTypeLabelMap.get(code) || code),
      departments: selectedDepartments.map((id) => departmentLabelMap.get(id) || "-"),
      locations: selectedLocations.map((id) => locationLabelMap.get(id) || "-"),
      environments: selectedEnvironments,
      notes: scopeNotes.trim(),
      stakeholderSummary: stakeholderSummary.trim(),
    };
  }, [
    selectedAssetTypes,
    selectedDepartments,
    selectedLocations,
    selectedEnvironments,
    scopeNotes,
    stakeholderSummary,
    assetTypeLabelMap,
    departmentLabelMap,
    locationLabelMap,
  ]);

  async function createScopeVersion() {
    setCreating(true);
    setCreateErr(null);

    try {
      if (selectedAssetTypes.length === 0) {
        throw new Error("Pilih minimal 1 asset type.");
      }

      if (selectedEnvironments.length === 0) {
        throw new Error("Pilih minimal 1 environment.");
      }

      const res = await apiPostJson<any>("/api/v1/governance/scope/versions", {
        note: createNote.trim() || undefined,
        scope_json: scopeJsonPreview,
      });

      const createdId = res?.data?.id ?? res?.data?.data?.id ?? null;

      if (!createdId) {
        router.push(buildHref({ status: "ALL", page: 1, pageSize, returnTo: safeReturnTo }));
        return;
      }

      const detailQs = new URLSearchParams();
      if (safeReturnTo) detailQs.set("return_to", safeReturnTo);
      router.push(
        detailQs.toString()
          ? `/governance/scope/${createdId}?${detailQs.toString()}`
          : `/governance/scope/${createdId}`
      );
    } catch (error) {
      setCreateErr(getErrorMessage(error, "Failed to create scope version"));
    } finally {
      setCreating(false);
    }
  }

  function onPageSizeChange(nextPageSize: number) {
    router.push(
      buildHref({
        status,
        page: 1,
        pageSize: nextPageSize,
        returnTo: safeReturnTo,
      })
    );
  }

  return (
    <main className="relative z-10">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                Governance Scope
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-gray-900">
                Governance Scope
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                MVP1.6 - scope versions with submit / approve / activate workflow.
              </p>
            </div>

            <Link href={backHref} className="itam-secondary-action md:self-end">
              Back
            </Link>
          </div>
        </div>

        <div className="mt-16 rounded-3xl border border-white bg-white/80 p-10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            {canManage ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                <div className="text-base font-semibold text-gray-900">New Scope Version</div>
                <div className="mt-1 text-sm text-gray-600">
                  Buat draft scope version baru untuk tenant aktif.
                </div>

                <div className="mt-8 space-y-8">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Version Note</div>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      value={createNote}
                      onChange={(e) => setCreateNote(e.target.value)}
                      disabled={creating}
                      placeholder="Initial scope draft"
                    />
                  </div>

                  <MultiSelectDropdownSection
                    title="Asset Types in Scope"
                    summary={selectedAssetTypeSummary}
                    badge={`${selectedAssetTypes.length} selected`}
                    emptyText="Pick one or more asset types."
                    open={openSections.assetTypes}
                    onToggle={() => toggleSection("assetTypes")}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {assetTypes.map((row) => (
                        <SelectableOptionCard
                          key={row.code}
                          title={row.label}
                          subtitle={row.code}
                          selected={selectedAssetTypes.includes(row.code)}
                          disabled={creating}
                          tone="sky"
                          onClick={() =>
                            setSelectedAssetTypes((prev) => toggleString(prev, row.code))
                          }
                        />
                      ))}

                      {assetTypes.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No asset types available.
                        </div>
                      ) : null}
                    </div>
                  </MultiSelectDropdownSection>

                  <MultiSelectDropdownSection
                    title="Departments in Scope"
                    summary={selectedDepartmentSummary}
                    badge={`${selectedDepartments.length} selected`}
                    emptyText="Pick one or more departments."
                    open={openSections.departments}
                    onToggle={() => toggleSection("departments")}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {departments.map((row) => (
                        <SelectableOptionCard
                          key={row.id}
                          title={row.name}
                          subtitle={row.code || `ID ${row.id}`}
                          selected={selectedDepartments.includes(row.id)}
                          disabled={creating}
                          tone="emerald"
                          onClick={() =>
                            setSelectedDepartments((prev) => toggleNumber(prev, row.id))
                          }
                        />
                      ))}

                      {departments.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No departments available.
                        </div>
                      ) : null}
                    </div>
                  </MultiSelectDropdownSection>

                  <MultiSelectDropdownSection
                    title="Locations in Scope"
                    summary={selectedLocationSummary}
                    badge={`${selectedLocations.length} selected`}
                    emptyText="Pick one or more locations."
                    open={openSections.locations}
                    onToggle={() => toggleSection("locations")}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {locations.map((row) => (
                        <SelectableOptionCard
                          key={row.id}
                          title={row.name}
                          subtitle={row.code || `ID ${row.id}`}
                          selected={selectedLocations.includes(row.id)}
                          disabled={creating}
                          tone="violet"
                          onClick={() =>
                            setSelectedLocations((prev) => toggleNumber(prev, row.id))
                          }
                        />
                      ))}

                      {locations.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          No locations available.
                        </div>
                      ) : null}
                    </div>
                  </MultiSelectDropdownSection>

                  <MultiSelectDropdownSection
                    title="Environments"
                    summary={selectedEnvironmentSummary}
                    badge={`${selectedEnvironments.length} selected`}
                    emptyText="Pick one or more environments."
                    open={openSections.environments}
                    onToggle={() => toggleSection("environments")}
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {ENV_OPTIONS.map((env) => (
                        <SelectableOptionCard
                          key={env}
                          title={env}
                          selected={selectedEnvironments.includes(env)}
                          disabled={creating}
                          tone="amber"
                          onClick={() =>
                            setSelectedEnvironments((prev) => toggleString(prev, env))
                          }
                        />
                      ))}
                    </div>
                  </MultiSelectDropdownSection>

                  <div>
                    <div className="text-sm font-medium text-gray-700">Additional Notes</div>
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      rows={4}
                      value={scopeNotes}
                      onChange={(e) => setScopeNotes(e.target.value)}
                      disabled={creating}
                      placeholder="Catatan tambahan mengenai scope..."
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700">Stakeholder Summary</div>
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      rows={4}
                      value={stakeholderSummary}
                      onChange={(e) => setStakeholderSummary(e.target.value)}
                      disabled={creating}
                      placeholder="Ringkasan stakeholder terkait scope ini..."
                    />
                  </div>

                  {createErr ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {createErr}
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={createScopeVersion}
                      disabled={creating}
                      className="itam-primary-action disabled:opacity-50"
                    >
                      {creating ? "Creating..." : "Create Scope Version"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
                <div className="text-base font-semibold text-gray-900">Governance Scope</div>
                <div className="mt-2 text-sm text-gray-600">
                  Read only. Create scope version, submit, approve, and activate are restricted to
                  SUPERADMIN, TENANT_ADMIN, and ITAM_MANAGER.
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap text-sm font-medium text-gray-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {STATUSES.map((s) => (
                      <Link
                        key={s}
                        href={buildHref({ status: s, page: 1, pageSize, returnTo: safeReturnTo })}
                        className={status === s ? "border-b-2 border-blue-600 pb-1 text-blue-700" : "pb-1 hover:text-gray-900"}
                      >
                        {s}
                      </Link>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={String(pageSize)}
                      onChange={(e) => onPageSizeChange(Number(e.target.value))}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      {pageSizeOptions.map((n) => (
                        <option key={n} value={String(n)}>
                          {n} / page
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 text-sm text-gray-500">Total: {total}</div>

                {err ? (
                  <div className="mt-4">
                    <ErrorState
                      error={err}
                      onRetry={() => {
                        window.location.reload();
                      }}
                    />
                  </div>
                ) : null}

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="py-2 pr-4">Version</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">Activated</th>
                        <th className="py-2 pr-4">Note</th>
                        <th className="py-2 pr-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <>
                          <SkeletonTableRow cols={6} />
                          <SkeletonTableRow cols={6} />
                          <SkeletonTableRow cols={6} />
                          <SkeletonTableRow cols={6} />
                          <SkeletonTableRow cols={6} />
                        </>
                      ) : items.length === 0 ? (
                        <tr className="border-t">
                          <td colSpan={6} className="py-6 text-gray-600">
                            Tidak ada scope versions.
                          </td>
                        </tr>
                      ) : (
                        items.map((row) => {
                          const detailQs = new URLSearchParams();
                          if (safeReturnTo) detailQs.set("return_to", safeReturnTo);
                          const detailHref = detailQs.toString()
                            ? `/governance/scope/${row.id}?${detailQs.toString()}`
                            : `/governance/scope/${row.id}`;

                          return (
                            <tr key={String(row.id)} className="border-t align-top">
                              <td className="py-2 pr-4 font-medium">v{Number(row.version_no)}</td>
                              <td className="py-2 pr-4">
                                <span className={statusPill(row.status)}>{row.status}</span>
                              </td>
                              <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(row.created_at)}</td>
                              <td className="whitespace-nowrap py-2 pr-4">{fmtDateTime(row.activated_at)}</td>
                              <td className="py-2 pr-4 text-gray-700">{row.note || "-"}</td>
                              <td className="whitespace-nowrap py-2 pr-4 text-right">
                                <Link
                                  href={detailHref}
                                  className="text-blue-700 hover:underline"
                                >
                                  View
                                </Link>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-gray-500">
                    Page {pageFromUrl} / {totalPages} (page_size: {pageSize})
                  </div>

                  <div className="flex gap-2">
                    {canPrev ? (
                      <Link
                        className="itam-secondary-action-sm"
                        href={buildHref({ status, page: pageFromUrl - 1, pageSize, returnTo: safeReturnTo })}
                      >
                        Prev
                      </Link>
                    ) : (
                      <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                        Prev
                      </span>
                    )}

                    {canNext ? (
                      <Link
                        className="itam-secondary-action-sm"
                        href={buildHref({ status, page: pageFromUrl + 1, pageSize, returnTo: safeReturnTo })}
                      >
                        Next
                      </Link>
                    ) : (
                      <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                        Next
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-md border bg-gray-50 p-3">
                  <div className="text-sm font-semibold text-gray-900">Scope Summary</div>
                  <div className="mt-3 space-y-3 text-sm text-gray-700">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Asset Types
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {scopeSummary.assetTypes.length > 0 ? (
                          scopeSummary.assetTypes.map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-700"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Departments
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {scopeSummary.departments.length > 0 ? (
                          scopeSummary.departments.map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Locations
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {scopeSummary.locations.length > 0 ? (
                          scopeSummary.locations.map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-700"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Environments
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {scopeSummary.environments.length > 0 ? (
                          scopeSummary.environments.map((label) => (
                            <span
                              key={label}
                              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"
                            >
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Notes
                      </div>
                      <div className="mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                        {scopeSummary.notes || "-"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                        Stakeholder Summary
                      </div>
                      <div className="mt-1 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                        {scopeSummary.stakeholderSummary || "-"}
                      </div>
                    </div>
                  </div>

                  <details className="mt-4 rounded-md border bg-white px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-gray-900">
                      Advanced: raw scope_json
                    </summary>
                    <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs">
                      {prettyJson(scopeJsonPreview)}
                    </pre>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
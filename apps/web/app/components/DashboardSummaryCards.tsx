"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "../lib/api";
import { parseActiveScopeJson, resolveScopedLookupLabel } from "../lib/governanceScope";

type DashboardSummaryData = {
  totals: {
    assets: number;
    pending_approvals: number;
    documents_in_review: number;
    evidence_files: number;
    active_scope_versions: number;
    open_context_entries: number;
    open_stakeholder_entries: number;
  };
  assets_by_state: Array<{
    state_code: string;
    state_label: string;
    total: number;
  }>;
  assets_by_type: Array<{
    asset_type_code: string;
    asset_type_label: string;
    total: number;
  }>;
};

type ContractAlertSummaryData = {
  expiring_contracts: number;
  expired_contracts: number;
  total_alerts: number;
};

type SummaryApiShape = {
  totals?: {
    assets?: unknown;
    pending_approvals?: unknown;
    documents_in_review?: unknown;
    evidence_files?: unknown;
    active_scope_versions?: unknown;
    open_context_entries?: unknown;
    open_stakeholder_entries?: unknown;
  };
  assets_by_state?: unknown;
  assets_by_type?: unknown;
};

type ContractListApiShape = {
  total?: unknown;
};

type AssetTypeItem = {
  code: string;
  label: string;
};

type LookupItem = {
  id: number;
  name?: string;
  label?: string;
  display_name?: string;
  code?: string;
  active?: boolean;
};

type GovernanceSnapshotData = {
  versionNo: number | null;
  assetTypes: string[];
  departments: string[];
  locations: string[];
  environments: string[];
  openContexts: number;
  openStakeholders: number;
  hasActiveScope: boolean;
};

function GovernanceMiniCard(props: {
  title: string;
  headline: string;
  description: string;
  href: string;
  tone: "warning" | "success" | "info";
  badges: string[];
  ctaLabel: string;
  loading: boolean;
  error: string | null;
}) {
  const toneClass =
    props.tone === "warning"
      ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
      : props.tone === "success"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white"
      : "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-white";

  const titleClass =
    props.tone === "warning"
      ? "text-amber-700"
      : props.tone === "success"
      ? "text-emerald-700"
      : "text-cyan-700";

  const badgeToneClass =
    props.tone === "warning"
      ? "bg-amber-100 text-amber-800"
      : props.tone === "success"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-cyan-100 text-cyan-800";

  if (props.loading) {
    return (
      <div className={`rounded-3xl border p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] ${toneClass}`}>
        <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${titleClass}`}>
          {props.title}
        </div>
        <div className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Loading...</div>
        <div className="mt-2 text-sm leading-6 text-slate-600">Loading governance snapshot...</div>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">
          {props.title}
        </div>
        <div className="mt-2 text-sm leading-6 text-rose-700">{props.error}</div>
      </div>
    );
  }

  return (
    <Link
      href={props.href}
      className={`block rounded-3xl border p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(15,23,42,0.12)] ${toneClass}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${titleClass}`}>
            {props.title}
          </div>
          <div className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
            {props.headline}
          </div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            {props.description}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {props.badges.map((badge) => (
            <span
              key={badge}
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeToneClass}`}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 text-sm font-semibold text-cyan-700">{props.ctaLabel} →</div>
    </Link>
  );
}

function SummaryCard(props: {
  title: string;
  value: number | string;
  href?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  const toneClass =
    props.tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : props.tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : props.tone === "info"
      ? "border-cyan-200 bg-cyan-50"
      : "border-slate-200 bg-white";

  const inner = (
    <div
      className={`flex min-h-[150px] flex-col justify-between rounded-3xl border p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] ${toneClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
        {props.title}
      </div>
      <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
        {props.value}
      </div>
      {props.href ? (
        <div className="mt-4 text-sm font-semibold text-cyan-700">Open →</div>
      ) : null}
    </div>
  );

  if (props.href) {
    return (
      <Link href={props.href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}

function ContractAlertCard(props: {
  data: ContractAlertSummaryData | null;
  loading: boolean;
  error: string | null;
}) {
  if (props.loading) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
          Vendor Contract Alert
        </div>
        <div className="mt-3 text-sm text-slate-600">Loading contract alerts...</div>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
          Vendor Contract Alert
        </div>
        <div className="mt-3 text-sm text-rose-700">{props.error}</div>
      </div>
    );
  }

  const data = props.data ?? {
    expiring_contracts: 0,
    expired_contracts: 0,
    total_alerts: 0,
  };

  return (
    <Link
      href="/contracts"
      className="block rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Vendor Contract Alert
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {data.total_alerts.toLocaleString()} contracts need attention
          </div>
          <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
            Contract vendor yang mendekati jatuh tempo atau sudah expired, dirangkum
            dalam satu kartu khusus agar mudah dipantau dari dashboard.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Expiring: {data.expiring_contracts.toLocaleString()}
          </span>
          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
            Expired: {data.expired_contracts.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-5 text-sm font-semibold text-amber-700">Open Contracts</div>
    </Link>
  );
}

function GovernanceAlertCard(props: {
  data: GovernanceSnapshotData | null;
  loading: boolean;
  error: string | null;
  activeScopeVersions: number;
}) {
  const data = props.data;
  const hasActiveScope = Boolean(data?.hasActiveScope && data.versionNo);
  const activeScopeVersion = data?.versionNo ?? null;
  const scopeHeadline = !hasActiveScope
    ? "Active governance scope not yet configured"
    : `Active Scope v${String(activeScopeVersion ?? "").trim()}`;

  const scopeDescription = !hasActiveScope
    ? "This tenant does not yet have an active governance scope. Configure and activate scope to establish the operational boundary for assets, context, and stakeholders."
    : "The active governance scope is shown first so operators can quickly confirm the tenant boundary before reviewing context and stakeholders.";

  const scopeBadges = [
    data?.assetTypes?.length ? `Asset types: ${data.assetTypes.join(", ")}` : "Asset types: -",
    data?.departments?.length ? `Departments: ${data.departments.join(", ")}` : "Departments: -",
    data?.locations?.length ? `Locations: ${data.locations.join(", ")}` : "Locations: -",
    data?.environments?.length ? `Environments: ${data.environments.join(", ")}` : "Environments: -",
  ];

  return (
    <div className="space-y-4">
      <GovernanceMiniCard
        title="Governance Scope"
        headline={scopeHeadline}
        description={scopeDescription}
        href="/governance/scope"
        tone={hasActiveScope ? "success" : "warning"}
        badges={[
          `Active Scope: ${props.activeScopeVersions.toLocaleString()}`,
          ...scopeBadges,
        ]}
        ctaLabel="Open Governance Scope"
        loading={props.loading}
        error={props.error}
      />

      <GovernanceMiniCard
        title="Governance Context"
        headline={
          (data?.openContexts ?? 0) > 0
            ? `${data?.openContexts?.toLocaleString() ?? "0"} open context entries`
            : "No open context entries"
        }
        description="Operational drivers, risks, and review items that influence the active ITAM boundary."
        href="/governance/context"
        tone={(data?.openContexts ?? 0) > 0 ? "info" : "warning"}
        badges={[
          `Open: ${data?.openContexts?.toLocaleString() ?? "0"}`,
          "Review queue: Governance Context",
        ]}
        ctaLabel="Open Governance Context"
        loading={props.loading}
        error={props.error}
      />

      <GovernanceMiniCard
        title="Governance Stakeholders"
        headline={
          (data?.openStakeholders ?? 0) > 0
            ? `${data?.openStakeholders?.toLocaleString() ?? "0"} open stakeholder records`
            : "No open stakeholder records"
        }
        description="People, teams, and interested parties that need visibility or review when governance changes."
        href="/governance/stakeholders"
        tone={(data?.openStakeholders ?? 0) > 0 ? "info" : "warning"}
        badges={[
          `Open: ${data?.openStakeholders?.toLocaleString() ?? "0"}`,
          "Review queue: Governance Stakeholders",
        ]}
        ctaLabel="Open Governance Stakeholders"
        loading={props.loading}
        error={props.error}
      />
    </div>
  );
}

function getErrorMessage(error: unknown) {
  const fallback = "Failed to load dashboard summary.";
  if (!error) return fallback;
  if (error instanceof Error && error.message) {
    if (error.message.toLowerCase() === "unauthorized") {
      return "Your session is missing or has expired. Please log in again.";
    }
    return error.message;
  }

  if (typeof error === "object" && error) {
    const e = error as { message?: string; code?: string; http_status?: number };
    const http = Number(e.http_status);
    const code = String(e.code || "").toUpperCase();
    const msg = String(e.message || "").trim();

    if (http === 401 || code === "AUTH_REQUIRED" || code === "AUTH_UNAUTHORIZED") {
      return "Your session is missing or has expired. Please log in again.";
    }
    if (http === 403 || code === "FORBIDDEN") {
      return "Access denied. You don't have permission to view this dashboard.";
    }
    return msg || fallback;
  }

  return fallback;
}

function extractResponsePayload(res: unknown): unknown {
  if (!res || typeof res !== "object") return {};

  const response = res as { data?: unknown };
  const firstLayer = response.data;

  if (firstLayer && typeof firstLayer === "object" && "data" in firstLayer) {
    return (firstLayer as { data?: unknown }).data ?? {};
  }

  return response.data ?? {};
}

function normalizeLookupItems(res: unknown): LookupItem[] {
  const raw = extractResponsePayload(res) as { items?: unknown };
  const items = Array.isArray(raw?.items) ? raw.items : [];

  return items
    .map((item: any) => ({
      id: Number(item?.id),
      name: String(item?.name ?? "").trim() || undefined,
      label: String(item?.label ?? "").trim() || undefined,
      display_name: String(item?.display_name ?? "").trim() || undefined,
      code: String(item?.code ?? "").trim() || undefined,
      active: item?.active ?? item?.is_active ?? true,
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function normalizeGovernanceSnapshot(res: unknown, activeScopeVersions: number): GovernanceSnapshotData {
  const raw = extractResponsePayload(res) as {
    version?: { version_no?: number | string | null; scope_json?: unknown } | null;
    departments?: LookupItem[];
    locations?: LookupItem[];
    assetTypes?: AssetTypeItem[];
    totals?: {
      open_context_entries?: unknown;
      open_stakeholder_entries?: unknown;
    };
  };

  const version = raw?.version ?? null;
  const parsed = parseActiveScopeJson(version?.scope_json ?? null, version?.version_no ?? null);

  const departmentItems = Array.isArray(raw?.departments) ? raw.departments : [];
  const locationItems = Array.isArray(raw?.locations) ? raw.locations : [];
  const assetTypeItems = Array.isArray(raw?.assetTypes) ? raw.assetTypes : [];

  const assetTypeMap = new Map<string, string>();
  for (const row of assetTypeItems) {
    const code = String(row?.code ?? "").trim().toUpperCase();
    const label = String(row?.label ?? row?.code ?? "").trim();
    if (code && label) assetTypeMap.set(code, label);
  }

  const departmentLabels =
    parsed.departmentTokens.length > 0
      ? departmentItems
          .map((item) =>
            resolveScopedLookupLabel(
              departmentItems as any,
              Number(item.id),
              parsed.departmentTokens
            )
          )
          .filter((v): v is string => Boolean(v))
      : [];

  const locationLabels =
    parsed.locationTokens.length > 0
      ? locationItems
          .map((item) =>
            resolveScopedLookupLabel(
              locationItems as any,
              Number(item.id),
              parsed.locationTokens
            )
          )
          .filter((v): v is string => Boolean(v))
      : [];

  return {
    versionNo: parsed.versionNo,
    assetTypes: parsed.assetTypeCodes.map((code) => assetTypeMap.get(code.toUpperCase()) || code),
    departments: departmentLabels,
    locations: locationLabels,
    environments: parsed.environmentCodes.map((env) =>
      String(env || "").toUpperCase() === "ON_PREM" ? "On Prem" : env
    ),
    openContexts: Number(raw?.totals?.open_context_entries ?? 0),
    openStakeholders: Number(raw?.totals?.open_stakeholder_entries ?? 0),
    hasActiveScope: activeScopeVersions > 0,
  };
}

function normalizeSummary(res: unknown): DashboardSummaryData {
  const raw = extractResponsePayload(res) as SummaryApiShape;

  return {
    totals: {
      assets: Number(raw?.totals?.assets ?? 0),
      pending_approvals: Number(raw?.totals?.pending_approvals ?? 0),
      documents_in_review: Number(raw?.totals?.documents_in_review ?? 0),
      evidence_files: Number(raw?.totals?.evidence_files ?? 0),
      active_scope_versions: Number(raw?.totals?.active_scope_versions ?? 0),
      open_context_entries: Number(raw?.totals?.open_context_entries ?? 0),
      open_stakeholder_entries: Number(raw?.totals?.open_stakeholder_entries ?? 0),
    },
    assets_by_state: Array.isArray(raw?.assets_by_state) ? raw.assets_by_state : [],
    assets_by_type: Array.isArray(raw?.assets_by_type) ? raw.assets_by_type : [],
  };
}

function normalizeContractAlerts(res: unknown): ContractAlertSummaryData {
  const raw = extractResponsePayload(res) as ContractListApiShape;

  return {
    expiring_contracts: Number(raw?.total ?? 0),
    expired_contracts: 0,
    total_alerts: Number(raw?.total ?? 0),
  };
}

export default function DashboardSummaryCards() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DashboardSummaryData | null>(null);
  const [contractAlertsLoading, setContractAlertsLoading] = useState(true);
  const [contractAlertsErr, setContractAlertsErr] = useState<string | null>(null);
  const [contractAlerts, setContractAlerts] = useState<ContractAlertSummaryData | null>(
    null
  );
  const [governanceLoading, setGovernanceLoading] = useState(true);
  const [governanceErr, setGovernanceErr] = useState<string | null>(null);
  const [governanceSnapshot, setGovernanceSnapshot] = useState<GovernanceSnapshotData | null>(
    null
  );

  useEffect(() => {
    let active = true;

    async function loadGovernanceSnapshot() {
      setGovernanceLoading(true);
      setGovernanceErr(null);

      try {
        const [summaryRes, scopeRes, assetTypesRes, departmentsRes, locationsRes] = await Promise.all([
          apiGet<unknown>("/api/v1/dashboard/summary"),
          apiGet<unknown>("/api/v1/governance/scope/versions?status=ACTIVE&page=1&page_size=1"),
          apiGet<unknown>("/api/v1/config/asset-types"),
          apiGet<unknown>("/api/v1/departments?page=1&page_size=500"),
          apiGet<unknown>("/api/v1/locations?page=1&page_size=500"),
        ]);

        if (!active) return;

        const scopePayload = extractResponsePayload(scopeRes) as { items?: unknown };
        const scopeItems = Array.isArray(scopePayload?.items) ? scopePayload.items : [];
        const version = scopeItems.length > 0 ? (scopeItems[0] as any) : null;
        const summaryPayload = extractResponsePayload(summaryRes) as { totals?: unknown };
        const snapshot = normalizeGovernanceSnapshot(
          {
            data: {
              data: {
                totals: (summaryPayload as any)?.totals ?? {},
                version,
                assetTypes: normalizeLookupItems(assetTypesRes),
                departments: normalizeLookupItems(departmentsRes),
                locations: normalizeLookupItems(locationsRes),
              },
            },
          },
          Number((summaryRes as any)?.data?.data?.totals?.active_scope_versions ?? 0)
        );

        setGovernanceSnapshot(snapshot);
      } catch (error) {
        if (!active) return;
        setGovernanceErr(getErrorMessage(error));
        setGovernanceSnapshot(null);
      } finally {
        if (active) setGovernanceLoading(false);
      }
    }

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await apiGet<unknown>("/api/v1/dashboard/summary");
        if (!active) return;

        setData(normalizeSummary(res));
      } catch (error) {
        if (!active) return;
        setErr(getErrorMessage(error));
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    void loadGovernanceSnapshot();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadContractAlerts() {
      setContractAlertsLoading(true);
      setContractAlertsErr(null);

      try {
        const [expiringRes, expiredRes] = await Promise.all([
          apiGet<unknown>("/api/v1/contracts?page=1&page_size=1&health=EXPIRING"),
          apiGet<unknown>("/api/v1/contracts?page=1&page_size=1&health=EXPIRED"),
        ]);

        if (!active) return;

        const expiring = normalizeContractAlerts(expiringRes);
        const expired = normalizeContractAlerts(expiredRes);

        setContractAlerts({
          expiring_contracts: expiring.expiring_contracts,
          expired_contracts: expired.expiring_contracts,
          total_alerts: expiring.expiring_contracts + expired.expiring_contracts,
        });
      } catch (error) {
        if (!active) return;
        setContractAlertsErr(getErrorMessage(error));
        setContractAlerts(null);
      } finally {
        if (active) setContractAlertsLoading(false);
      }
    }

    void loadContractAlerts();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-slate-600">Loading dashboard summary...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm text-rose-700">{err}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-6 space-y-4">
      <GovernanceAlertCard
        data={governanceSnapshot}
        loading={governanceLoading}
        error={governanceErr}
        activeScopeVersions={data.totals.active_scope_versions}
      />

      <ContractAlertCard
        data={contractAlerts}
        loading={contractAlertsLoading}
        error={contractAlertsErr}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <SummaryCard title="Assets" value={data.totals.assets} href="/assets" />
        <SummaryCard
          title="Pending Approvals"
          value={data.totals.pending_approvals}
          href="/approvals?status=PENDING"
          tone="warning"
        />
        <SummaryCard
          title="Docs In Review"
          value={data.totals.documents_in_review}
          href="/documents?status=IN_REVIEW"
          tone="info"
        />
        <SummaryCard
          title="Evidence Files"
          value={data.totals.evidence_files}
          href="/evidence"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">Assets by State</div>
              <div className="mt-1 text-sm text-slate-700">
                Ringkasan status lifecycle aset.
              </div>
            </div>
            <Link href="/assets" className="text-sm font-medium text-cyan-700 hover:underline">
              Open Assets
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.assets_by_state.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={3} className="py-6 text-slate-600">
                      No asset state summary.
                    </td>
                  </tr>
                ) : (
                  data.assets_by_state.map((row) => (
                    <tr key={row.state_code} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{row.state_label}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                        {row.state_code}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-900">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-slate-900">Assets by Type</div>
              <div className="mt-1 text-sm text-slate-700">
                Ringkasan aset berdasarkan asset type.
              </div>
            </div>
            <Link href="/assets" className="text-sm font-medium text-cyan-700 hover:underline">
              Open Assets
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.assets_by_type.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td colSpan={3} className="py-6 text-slate-600">
                      No asset type summary.
                    </td>
                  </tr>
                ) : (
                  data.assets_by_type.map((row) => (
                    <tr key={row.asset_type_code} className="border-t border-slate-100">
                      <td className="py-2 pr-4 text-slate-800">{row.asset_type_label}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                        {row.asset_type_code}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-slate-900">
                        {row.total}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

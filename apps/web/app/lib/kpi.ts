import { apiGet, apiPatchJson, apiPostJson } from '@/app/lib/api';

export type KpiRoleCode =
  | 'SUPERADMIN'
  | 'TENANT_ADMIN'
  | 'ITAM_MANAGER'
  | 'AUDITOR'
  | 'PROCUREMENT_CONTRACT_MANAGER'
  | 'SECURITY_OFFICER'
  | 'ASSET_CUSTODIAN'
  | 'SERVICE_DESK_OPERATOR'
  | 'INTEGRATION_USER';

export type KpiSourceType = 'MANUAL' | 'SYSTEM';
export type KpiDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
export type KpiPeriodType = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type KpiStatusCode =
  | 'ON_TRACK'
  | 'WARNING'
  | 'CRITICAL'
  | 'NO_TARGET'
  | 'MISSING';

export type KpiDefinition = {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  description: string | null;
  category_code: string;
  unit_code: string;
  source_type: KpiSourceType;
  metric_key: string | null;
  direction: KpiDirection;
  period_type: KpiPeriodType;
  target_value: number | null;
  warning_value: number | null;
  critical_value: number | null;
  baseline_value: number | null;
  owner_identity_id: number | null;
  is_active: boolean;
  display_order: number;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type KpiMeasurement = {
  id: number;
  tenant_id: number;
  kpi_definition_id: number;
  period_type: KpiPeriodType;
  period_key: string;
  period_start_date: string;
  period_end_date: string;
  target_value_snapshot: number | null;
  warning_value_snapshot: number | null;
  critical_value_snapshot: number | null;
  baseline_value_snapshot: number | null;
  actual_value: number;
  achievement_pct: number | null;
  status_code: KpiStatusCode;
  measurement_source_type: KpiSourceType;
  measurement_note: string | null;
  source_snapshot_json: Record<string, unknown> | null;
  measured_at: string;
  measured_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type KpiMetadataOption = {
  code: string;
  label: string;
  display_order?: number;
};

export type KpiSystemMetric = {
  key: string;
  name: string;
  description: string;
  category_code: string;
  default_unit_code: string;
  default_direction: KpiDirection;
  supported_period_types: KpiPeriodType[];
};

export type KpiMetadata = {
  source_types: KpiMetadataOption[];
  direction_types: KpiMetadataOption[];
  period_types: KpiMetadataOption[];
  status_codes: KpiMetadataOption[];
  category_options: KpiMetadataOption[];
  unit_options: KpiMetadataOption[];
  system_metrics: KpiSystemMetric[];
};

export type PagedResult<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type KpiScorecardItem = {
  kpi_id: number;
  code: string;
  name: string;
  description: string | null;
  category_code: string;
  unit_code: string;
  source_type: KpiSourceType;
  metric_key: string | null;
  direction: KpiDirection;
  period_type: KpiPeriodType;
  period_key: string;
  target_value: number | null;
  warning_value: number | null;
  critical_value: number | null;
  baseline_value: number | null;
  actual_value: number | null;
  achievement_pct: number | null;
  status_code: KpiStatusCode;
  measurement_id: number | null;
  measured_at: string | null;
  measurement_source_type: KpiSourceType | null;
  measurement_note: string | null;
};

export type KpiScorecardSummary = {
  period_type: KpiPeriodType;
  period_key: string;
  period_start_date: string;
  period_end_date: string;
  summary: {
    total_kpis: number;
    on_track_count: number;
    warning_count: number;
    critical_count: number;
    no_target_count: number;
    missing_count: number;
  };
  items: KpiScorecardItem[];
};

export type KpiTrendSeries = {
  kpi: {
    id: number;
    code: string;
    name: string;
    category_code: string;
    unit_code: string;
    source_type: KpiSourceType;
    metric_key: string | null;
    direction: KpiDirection;
    period_type: KpiPeriodType;
    target_value: number | null;
    warning_value: number | null;
    critical_value: number | null;
    baseline_value: number | null;
  };
  items: Array<{
    period_key: string;
    period_start_date: string;
    period_end_date: string;
    actual_value: number;
    target_value: number | null;
    warning_value: number | null;
    critical_value: number | null;
    baseline_value: number | null;
    achievement_pct: number | null;
    status_code: KpiStatusCode;
    measured_at: string;
  }>;
};

export type KpiListQuery = {
  q?: string;
  category_code?: string;
  source_type?: string;
  period_type?: string;
  is_active?: string | boolean;
  page?: number;
  page_size?: number;
};

export type KpiCreatePayload = {
  code: string;
  name: string;
  description?: string | null;
  category_code?: string;
  unit_code?: string;
  source_type: KpiSourceType;
  metric_key?: string | null;
  direction?: KpiDirection;
  period_type: KpiPeriodType;
  target_value?: number | null;
  warning_value?: number | null;
  critical_value?: number | null;
  baseline_value?: number | null;
  is_active?: boolean;
  display_order?: number;
};

export type KpiUpdatePayload = Partial<KpiCreatePayload>;

export type KpiCreateMeasurementPayload = {
  period_key: string;
  period_type?: KpiPeriodType;
  actual_value?: number;
  measurement_note?: string | null;
  source_snapshot_json?: Record<string, unknown> | null;
};

export const KPI_VIEW_ROLES = new Set<KpiRoleCode>([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'AUDITOR',
]);

export const KPI_MANAGE_ROLES = new Set<KpiRoleCode>([
  'SUPERADMIN',
  'TENANT_ADMIN',
  'ITAM_MANAGER',
]);

function unwrapData<T>(response: any): T {
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data as T;
  }
  return response as T;
}

function buildQueryString(params: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function getAuthMe() {
  const response = await apiGet('/api/v1/auth/me');
  return unwrapData<any>(response);
}

export function extractRoleCodes(me: any): KpiRoleCode[] {
  const rawRoles =
    me?.roles ??
    me?.user?.roles ??
    me?.data?.roles ??
    [];

  if (!Array.isArray(rawRoles)) return [];

  return rawRoles
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.role_code) return item.role_code;
      if (item?.code) return item.code;
      return null;
    })
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase()) as KpiRoleCode[];
}

export function canViewKpiModule(roleCodes: string[]) {
  return roleCodes.some((role) => KPI_VIEW_ROLES.has(role as KpiRoleCode));
}

export function canManageKpis(roleCodes: string[]) {
  return roleCodes.some((role) => KPI_MANAGE_ROLES.has(role as KpiRoleCode));
}

export async function getKpiMetadata() {
  const response = await apiGet('/api/v1/kpis/metadata');
  return unwrapData<KpiMetadata>(response);
}

export async function getKpiSystemMetrics() {
  const response = await apiGet('/api/v1/kpis/system-metrics');
  const data = unwrapData<{ items: KpiSystemMetric[] }>(response);
  return data.items;
}

export async function getKpis(query: KpiListQuery) {
  const response = await apiGet(
    `/api/v1/kpis${buildQueryString(query as Record<string, unknown>)}`
  );
  return unwrapData<PagedResult<KpiDefinition>>(response);
}

export async function getKpiDetail(id: number | string) {
  const response = await apiGet(`/api/v1/kpis/${id}`);
  return unwrapData<KpiDefinition>(response);
}

export async function createKpi(payload: KpiCreatePayload) {
  const response = await apiPostJson('/api/v1/kpis', payload);
  return unwrapData<KpiDefinition>(response);
}

export async function updateKpi(id: number | string, payload: KpiUpdatePayload) {
  const response = await apiPatchJson(`/api/v1/kpis/${id}`, payload);
  return unwrapData<KpiDefinition>(response);
}

export async function getKpiMeasurements(
  id: number | string,
  query: {
    period_key_from?: string;
    period_key_to?: string;
    page?: number;
    page_size?: number;
  }
) {
  const response = await apiGet(
    `/api/v1/kpis/${id}/measurements${buildQueryString(query as Record<string, unknown>)}`
  );
  return unwrapData<PagedResult<KpiMeasurement>>(response);
}

export async function createKpiMeasurement(
  id: number | string,
  payload: KpiCreateMeasurementPayload
) {
  const response = await apiPostJson(`/api/v1/kpis/${id}/measurements`, payload);
  return unwrapData<KpiMeasurement>(response);
}

export async function getKpiScorecardSummary(
  period_type: KpiPeriodType,
  period_key: string
) {
  const response = await apiGet(
    `/api/v1/kpis/scorecard-summary${buildQueryString({ period_type, period_key })}`
  );
  return unwrapData<KpiScorecardSummary>(response);
}

export async function getKpiTrend(
  id: number | string,
  query: {
    period_key_from?: string;
    period_key_to?: string;
  }
) {
  const response = await apiGet(
    `/api/v1/kpis/${id}/trend${buildQueryString(query as Record<string, unknown>)}`
  );
  return unwrapData<KpiTrendSeries>(response);
}

export function formatKpiValue(value: number | null | undefined, unitCode?: string | null) {
  if (value == null) return '-';

  if (unitCode === 'PERCENT') {
    return `${Number(value).toFixed(2)}%`;
  }

  if (unitCode === 'CURRENCY') {
    return Number(value).toLocaleString();
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

export function getCurrentPeriodKey(periodType: KpiPeriodType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (periodType === 'MONTHLY') {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  if (periodType === 'QUARTERLY') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  return `${year}`;
}

export type KpiPeriodParts = {
  year: string;
  month: string;
  quarter: string;
};

export function getDefaultPeriodParts(periodType: KpiPeriodType): KpiPeriodParts {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const quarter = String(Math.floor(now.getMonth() / 3) + 1);

  if (periodType === 'MONTHLY') {
    return { year, month, quarter };
  }

  if (periodType === 'QUARTERLY') {
    return { year, month, quarter };
  }

  return { year, month, quarter };
}

export function parsePeriodKeyToParts(
  periodType: KpiPeriodType,
  periodKey?: string | null
): KpiPeriodParts {
  const fallback = getDefaultPeriodParts(periodType);
  const normalized = String(periodKey || '').trim().toUpperCase();

  if (periodType === 'MONTHLY') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(normalized);
    if (!match) return fallback;

    return {
      year: match[1],
      month: match[2],
      quarter: String(Math.floor((Number(match[2]) - 1) / 3) + 1),
    };
  }

  if (periodType === 'QUARTERLY') {
    const match = /^(\d{4})-Q([1-4])$/.exec(normalized);
    if (!match) return fallback;

    return {
      year: match[1],
      month: fallback.month,
      quarter: match[2],
    };
  }

  if (periodType === 'YEARLY') {
    const match = /^(\d{4})$/.exec(normalized);
    if (!match) return fallback;

    return {
      year: match[1],
      month: fallback.month,
      quarter: fallback.quarter,
    };
  }

  return fallback;
}

export function buildPeriodKeyFromParts(
  periodType: KpiPeriodType,
  parts: KpiPeriodParts
) {
  const fallback = getCurrentPeriodKey(periodType);
  const year = String(parts.year || '').trim();
  const month = String(parts.month || '').trim();
  const quarter = String(parts.quarter || '').trim();

  if (!/^\d{4}$/.test(year)) {
    return fallback;
  }

  if (periodType === 'MONTHLY') {
    if (!/^(0[1-9]|1[0-2])$/.test(month)) {
      return fallback;
    }
    return `${year}-${month}`;
  }

  if (periodType === 'QUARTERLY') {
    if (!/^[1-4]$/.test(quarter)) {
      return fallback;
    }
    return `${year}-Q${quarter}`;
  }

  return year;
}

export function getPeriodKeyRangeForYear(year: number, periodType: KpiPeriodType) {
  if (periodType === 'MONTHLY') {
    return {
      period_key_from: `${year}-01`,
      period_key_to: `${year}-12`,
    };
  }

  if (periodType === 'QUARTERLY') {
    return {
      period_key_from: `${year}-Q1`,
      period_key_to: `${year}-Q4`,
    };
  }

  return {
    period_key_from: `${year}`,
    period_key_to: `${year}`,
  };
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

export function getStatusBadgeClass(statusCode: string) {
  switch (statusCode) {
    case 'ON_TRACK':
      return 'bg-green-100 text-green-700 border border-green-200';
    case 'WARNING':
      return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    case 'CRITICAL':
      return 'bg-red-100 text-red-700 border border-red-200';
    case 'NO_TARGET':
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    case 'MISSING':
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}

export function getSourceBadgeClass(sourceType: string) {
  if (sourceType === 'SYSTEM') {
    return 'bg-blue-100 text-blue-700 border border-blue-200';
  }
  return 'bg-purple-100 text-purple-700 border border-purple-200';
}

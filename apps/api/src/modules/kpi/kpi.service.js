import {
  KPI_CATEGORY_OPTIONS,
  KPI_DIRECTION_TYPES,
  KPI_PERIOD_TYPES,
  KPI_SOURCE_TYPES,
  KPI_SYSTEM_METRICS,
  KPI_UNIT_OPTIONS,
  getKpiMetadataCatalog,
} from './kpi.constants.js';
import {
  assertCanManageKpis,
  assertCanViewKpiModule,
} from './kpi.permissions.js';
import {
  calculateSystemKpiMetricRepo,
  createKpiDefinitionRepo,
  createKpiMeasurementRepo,
  getKpiDefinitionByCodeRepo,
  getKpiDefinitionByIdRepo,
  getKpiMeasurementByPeriodRepo,
  getKpiScorecardSummaryRepo,
  identityExistsRepo,
  listKpiDefinitionsRepo,
  listKpiMeasurementsForTrendRepo,
  listKpiMeasurementsRepo,
  updateKpiDefinitionRepo,
} from './kpi.repo.js';

const ALLOWED_PAGE_SIZES = new Set([10, 25, 50, 100]);

function appError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => String(role || '').trim().toUpperCase())
    .filter(Boolean);
}

function resolveTenantId({ tenantId, requestContext }) {
  const resolved = tenantId ?? requestContext?.tenantId ?? null;

  if (resolved == null) {
    throw appError('AUTH_UNAUTHORIZED', 'Tenant context is required.', 401);
  }

  const numeric = Number(resolved);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw appError('VALIDATION_ERROR', 'Invalid tenant context.', 400);
  }

  return numeric;
}

function parsePositiveInteger(value, fallback, fieldName) {
  if (value == null || value === '') return fallback;

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw appError(
      'VALIDATION_ERROR',
      `${fieldName} must be a positive integer.`,
      400
    );
  }

  return numeric;
}

function parsePageSize(value) {
  const pageSize = parsePositiveInteger(value, 25, 'page_size');
  if (!ALLOWED_PAGE_SIZES.has(pageSize)) {
    throw appError('INVALID_PAGE_SIZE', 'page_size is not allowed.', 400);
  }
  return pageSize;
}

function parseOptionalBoolean(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  throw appError('VALIDATION_ERROR', 'is_active must be true or false.', 400);
}

function normalizeNullableString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    throw appError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }
  return normalized;
}

function normalizeCode(value) {
  return normalizeRequiredString(value, 'code')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function normalizeEnum(value, allowedValues, fieldName, { required = true } = {}) {
  if (value == null || value === '') {
    if (!required) return null;
    throw appError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  const normalized = String(value).trim().toUpperCase();
  if (!allowedValues.has(normalized)) {
    throw appError('VALIDATION_ERROR', `${fieldName} is invalid.`, 400);
  }

  return normalized;
}

function normalizeNullableNumeric(value, fieldName) {
  if (value == null || value === '') return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw appError('VALIDATION_ERROR', `${fieldName} must be numeric.`, 400);
  }

  return numeric;
}

function normalizeRequiredNumeric(value, fieldName) {
  if (value == null || value === '') {
    throw appError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw appError('VALIDATION_ERROR', `${fieldName} must be numeric.`, 400);
  }

  return numeric;
}

function normalizeNullableBigIntId(value, fieldName) {
  if (value == null || value === '') return null;

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw appError(
      'VALIDATION_ERROR',
      `${fieldName} must be a positive integer.`,
      400
    );
  }

  return numeric;
}

function normalizeDisplayOrder(value) {
  if (value == null || value === '') return 100;

  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    throw appError('VALIDATION_ERROR', 'display_order must be an integer.', 400);
  }

  return numeric;
}

function getAllowedCodeSet(items, codeKey = 'code') {
  return new Set(items.map((item) => String(item[codeKey]).toUpperCase()));
}

const SOURCE_TYPE_SET = getAllowedCodeSet(KPI_SOURCE_TYPES);
const DIRECTION_SET = getAllowedCodeSet(KPI_DIRECTION_TYPES);
const PERIOD_TYPE_SET = getAllowedCodeSet(KPI_PERIOD_TYPES);
const CATEGORY_SET = getAllowedCodeSet(KPI_CATEGORY_OPTIONS);
const UNIT_SET = getAllowedCodeSet(KPI_UNIT_OPTIONS);

function getSystemMetric(metricKey) {
  const normalizedMetricKey = normalizeRequiredString(metricKey, 'metric_key').toUpperCase();
  return KPI_SYSTEM_METRICS.find((item) => item.key === normalizedMetricKey) || null;
}

function assertThresholdOrder({ direction, targetValue, warningValue, criticalValue }) {
  if (direction === 'HIGHER_IS_BETTER') {
    if (targetValue != null && warningValue != null && warningValue > targetValue) {
      throw appError(
        'VALIDATION_ERROR',
        'warning_value cannot be greater than target_value for HIGHER_IS_BETTER.',
        400
      );
    }

    if (warningValue != null && criticalValue != null && criticalValue > warningValue) {
      throw appError(
        'VALIDATION_ERROR',
        'critical_value cannot be greater than warning_value for HIGHER_IS_BETTER.',
        400
      );
    }
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (targetValue != null && warningValue != null && warningValue < targetValue) {
      throw appError(
        'VALIDATION_ERROR',
        'warning_value cannot be lower than target_value for LOWER_IS_BETTER.',
        400
      );
    }

    if (warningValue != null && criticalValue != null && criticalValue < warningValue) {
      throw appError(
        'VALIDATION_ERROR',
        'critical_value cannot be lower than warning_value for LOWER_IS_BETTER.',
        400
      );
    }
  }
}

async function validateOwnerIdentity(db, { tenantId, ownerIdentityId }) {
  if (ownerIdentityId == null) return;

  const exists = await identityExistsRepo(db, {
    tenantId,
    identityId: ownerIdentityId,
  });

  if (!exists) {
    throw appError(
      'IDENTITY_NOT_FOUND',
      'Owner identity was not found in this tenant.',
      404
    );
  }
}

function buildCreateOrUpdatePayload(input, existing = null) {
  const rawSourceType = input.source_type ?? existing?.source_type ?? null;

  const sourceType = normalizeEnum(rawSourceType, SOURCE_TYPE_SET, 'source_type');

  let metric = null;
  if (sourceType === 'SYSTEM') {
    metric = getSystemMetric(input.metric_key ?? existing?.metric_key ?? null);
    if (!metric) {
      throw appError(
        'VALIDATION_ERROR',
        'metric_key is required and must be one of supported system metrics.',
        400
      );
    }
  }

  if (sourceType === 'MANUAL' && input.metric_key != null && input.metric_key !== '') {
    throw appError(
      'VALIDATION_ERROR',
      'metric_key must be empty for MANUAL KPI.',
      400
    );
  }

  const categoryCode = normalizeEnum(
    input.category_code ?? metric?.category_code ?? existing?.category_code ?? null,
    CATEGORY_SET,
    'category_code'
  );

  const unitCode = normalizeEnum(
    input.unit_code ?? metric?.default_unit_code ?? existing?.unit_code ?? null,
    UNIT_SET,
    'unit_code'
  );

  const direction = normalizeEnum(
    input.direction ?? metric?.default_direction ?? existing?.direction ?? null,
    DIRECTION_SET,
    'direction'
  );

  const periodType = normalizeEnum(
    input.period_type ?? existing?.period_type ?? null,
    PERIOD_TYPE_SET,
    'period_type'
  );

  if (metric && !metric.supported_period_types.includes(periodType)) {
    throw appError(
      'VALIDATION_ERROR',
      'period_type is not supported by the selected metric_key.',
      400
    );
  }

  const targetValue = normalizeNullableNumeric(
    input.target_value ?? existing?.target_value ?? null,
    'target_value'
  );

  const warningValue = normalizeNullableNumeric(
    input.warning_value ?? existing?.warning_value ?? null,
    'warning_value'
  );

  const criticalValue = normalizeNullableNumeric(
    input.critical_value ?? existing?.critical_value ?? null,
    'critical_value'
  );

  const baselineValue = normalizeNullableNumeric(
    input.baseline_value ?? existing?.baseline_value ?? null,
    'baseline_value'
  );

  assertThresholdOrder({
    direction,
    targetValue,
    warningValue,
    criticalValue,
  });

  return {
    code: normalizeCode(input.code ?? existing?.code),
    name: normalizeRequiredString(input.name ?? existing?.name, 'name'),
    description: normalizeNullableString(input.description ?? existing?.description ?? null),
    category_code: categoryCode,
    unit_code: unitCode,
    source_type: sourceType,
    metric_key: sourceType === 'SYSTEM' ? metric.key : null,
    direction,
    period_type: periodType,
    target_value: targetValue,
    warning_value: warningValue,
    critical_value: criticalValue,
    baseline_value: baselineValue,
    owner_identity_id: normalizeNullableBigIntId(
      input.owner_identity_id ?? existing?.owner_identity_id ?? null,
      'owner_identity_id'
    ),
    is_active:
      input.is_active == null
        ? existing?.is_active ?? true
        : parseOptionalBoolean(input.is_active),
    display_order: normalizeDisplayOrder(input.display_order ?? existing?.display_order ?? 100),
  };
}

function buildPagedResult({ items, total, page, pageSize }) {
  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function parsePeriodWindow(periodType, rawPeriodKey) {
  const periodKey = normalizeRequiredString(rawPeriodKey, 'period_key').toUpperCase();

  if (periodType === 'MONTHLY') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
    if (!match) {
      throw appError(
        'VALIDATION_ERROR',
        'period_key for MONTHLY must use format YYYY-MM.',
        400
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));

    return {
      period_key: periodKey,
      period_start_date: formatUtcDate(start),
      period_end_date: formatUtcDate(end),
    };
  }

  if (periodType === 'QUARTERLY') {
    const match = /^(\d{4})-Q([1-4])$/.exec(periodKey);
    if (!match) {
      throw appError(
        'VALIDATION_ERROR',
        'period_key for QUARTERLY must use format YYYY-Q1..Q4.',
        400
      );
    }

    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const startMonth = (quarter - 1) * 3;

    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));

    return {
      period_key: periodKey,
      period_start_date: formatUtcDate(start),
      period_end_date: formatUtcDate(end),
    };
  }

  if (periodType === 'YEARLY') {
    const match = /^(\d{4})$/.exec(periodKey);
    if (!match) {
      throw appError(
        'VALIDATION_ERROR',
        'period_key for YEARLY must use format YYYY.',
        400
      );
    }

    const year = Number(match[1]);
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    return {
      period_key: periodKey,
      period_start_date: formatUtcDate(start),
      period_end_date: formatUtcDate(end),
    };
  }

  throw appError('VALIDATION_ERROR', 'Unsupported period_type.', 400);
}

function roundAchievement(value) {
  return Number(Number(value).toFixed(6));
}

function calculateAchievementPct({ direction, targetValue, actualValue }) {
  if (targetValue == null) return null;

  if (direction === 'HIGHER_IS_BETTER') {
    if (targetValue === 0) return null;
    return roundAchievement((actualValue / targetValue) * 100);
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (actualValue === 0) return 100;
    return roundAchievement((targetValue / actualValue) * 100);
  }

  return null;
}

function evaluateKpiStatus({ direction, targetValue, warningValue, criticalValue, actualValue }) {
  if (targetValue == null) return 'NO_TARGET';

  if (direction === 'HIGHER_IS_BETTER') {
    if (actualValue >= targetValue) return 'ON_TRACK';
    if (warningValue != null) return actualValue >= warningValue ? 'WARNING' : 'CRITICAL';
    if (criticalValue != null) return actualValue >= criticalValue ? 'WARNING' : 'CRITICAL';
    return 'CRITICAL';
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (actualValue <= targetValue) return 'ON_TRACK';
    if (warningValue != null) return actualValue <= warningValue ? 'WARNING' : 'CRITICAL';
    if (criticalValue != null) return actualValue <= criticalValue ? 'WARNING' : 'CRITICAL';
    return 'CRITICAL';
  }

  return 'CRITICAL';
}

async function ensureKpiExists(db, { tenantId, kpiId }) {
  const record = await getKpiDefinitionByIdRepo(db, {
    tenantId,
    id: kpiId,
  });

  if (!record) {
    throw appError('KPI_NOT_FOUND', 'KPI was not found.', 404);
  }

  return record;
}

function normalizePeriodFilter(value, fieldName) {
  if (value == null || value === '') return null;
  return normalizeRequiredString(value, fieldName).toUpperCase();
}

function buildScorecardRow(item, periodType, periodKey) {
  const measurement = item.measurement;
  const kpi = item.kpi_definition;
  const effectiveStatus = measurement?.status_code ?? 'MISSING';

  return {
    kpi_id: kpi.id,
    code: kpi.code,
    name: kpi.name,
    description: kpi.description,
    category_code: kpi.category_code,
    unit_code: kpi.unit_code,
    source_type: kpi.source_type,
    metric_key: kpi.metric_key,
    direction: kpi.direction,
    period_type: periodType,
    period_key: periodKey,
    target_value: measurement?.target_value_snapshot ?? kpi.target_value,
    warning_value: measurement?.warning_value_snapshot ?? kpi.warning_value,
    critical_value: measurement?.critical_value_snapshot ?? kpi.critical_value,
    baseline_value: measurement?.baseline_value_snapshot ?? kpi.baseline_value,
    actual_value: measurement?.actual_value ?? null,
    achievement_pct: measurement?.achievement_pct ?? null,
    status_code: effectiveStatus,
    measurement_id: measurement?.id ?? null,
    measured_at: measurement?.measured_at ?? null,
    measurement_source_type: measurement?.measurement_source_type ?? null,
    measurement_note: measurement?.measurement_note ?? null,
  };
}

function summarizeScorecard(rows) {
  const summary = {
    total_kpis: rows.length,
    on_track_count: 0,
    warning_count: 0,
    critical_count: 0,
    no_target_count: 0,
    missing_count: 0,
  };

  for (const row of rows) {
    switch (row.status_code) {
      case 'ON_TRACK':
        summary.on_track_count += 1;
        break;
      case 'WARNING':
        summary.warning_count += 1;
        break;
      case 'CRITICAL':
        summary.critical_count += 1;
        break;
      case 'NO_TARGET':
        summary.no_target_count += 1;
        break;
      case 'MISSING':
        summary.missing_count += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export async function getKpiMetadataService({ requestContext }) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  return getKpiMetadataCatalog();
}

export async function getKpiSystemMetricsService({ requestContext }) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  return {
    items: KPI_SYSTEM_METRICS,
  };
}

export async function listKpisService({
  db,
  tenantId,
  requestContext,
  query,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });

  const page = parsePositiveInteger(query?.page, 1, 'page');
  const pageSize = parsePageSize(query?.page_size);

  const q = normalizeNullableString(query?.q);
  const categoryCode =
    query?.category_code == null || query?.category_code === ''
      ? null
      : normalizeEnum(query.category_code, CATEGORY_SET, 'category_code');
  const sourceType =
    query?.source_type == null || query?.source_type === ''
      ? null
      : normalizeEnum(query.source_type, SOURCE_TYPE_SET, 'source_type');
  const periodType =
    query?.period_type == null || query?.period_type === ''
      ? null
      : normalizeEnum(query.period_type, PERIOD_TYPE_SET, 'period_type');
  const isActive = parseOptionalBoolean(query?.is_active);

  const result = await listKpiDefinitionsRepo(db, {
    tenantId: resolvedTenantId,
    q,
    categoryCode,
    sourceType,
    periodType,
    isActive,
    page,
    pageSize,
  });

  return buildPagedResult({
    items: result.items,
    total: result.total,
    page,
    pageSize,
  });
}

export async function createKpiService({
  db,
  tenantId,
  requestContext,
  body,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanManageKpis(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const userId = requestContext?.userId == null ? null : Number(requestContext.userId);

  const payload = buildCreateOrUpdatePayload(body);
  await validateOwnerIdentity(db, {
    tenantId: resolvedTenantId,
    ownerIdentityId: payload.owner_identity_id,
  });

  const existingByCode = await getKpiDefinitionByCodeRepo(db, {
    tenantId: resolvedTenantId,
    code: payload.code,
  });

  if (existingByCode) {
    throw appError(
      'KPI_CODE_ALREADY_EXISTS',
      'KPI code already exists in this tenant.',
      409
    );
  }

  return await createKpiDefinitionRepo(db, {
    tenant_id: resolvedTenantId,
    ...payload,
    created_by_user_id: userId,
    updated_by_user_id: userId,
  });
}

export async function getKpiDetailService({
  db,
  tenantId,
  requestContext,
  id,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const kpiId = parsePositiveInteger(id, null, 'id');

  return await ensureKpiExists(db, {
    tenantId: resolvedTenantId,
    kpiId,
  });
}

export async function updateKpiService({
  db,
  tenantId,
  requestContext,
  id,
  body,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanManageKpis(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const kpiId = parsePositiveInteger(id, null, 'id');
  const userId = requestContext?.userId == null ? null : Number(requestContext.userId);

  const existing = await ensureKpiExists(db, {
    tenantId: resolvedTenantId,
    kpiId,
  });

  const merged = buildCreateOrUpdatePayload(body, existing);

  await validateOwnerIdentity(db, {
    tenantId: resolvedTenantId,
    ownerIdentityId: merged.owner_identity_id,
  });

  if (merged.code !== existing.code) {
    const byCode = await getKpiDefinitionByCodeRepo(db, {
      tenantId: resolvedTenantId,
      code: merged.code,
    });

    if (byCode && byCode.id !== existing.id) {
      throw appError(
        'KPI_CODE_ALREADY_EXISTS',
        'KPI code already exists in this tenant.',
        409
      );
    }
  }

  return await updateKpiDefinitionRepo(db, {
    tenantId: resolvedTenantId,
    id: kpiId,
    patch: {
      ...merged,
      updated_by_user_id: userId,
    },
  });
}

export async function listKpiMeasurementsService({
  db,
  tenantId,
  requestContext,
  id,
  query,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const kpiId = parsePositiveInteger(id, null, 'id');
  const page = parsePositiveInteger(query?.page, 1, 'page');
  const pageSize = parsePageSize(query?.page_size);
  const periodKeyFrom = normalizePeriodFilter(query?.period_key_from, 'period_key_from');
  const periodKeyTo = normalizePeriodFilter(query?.period_key_to, 'period_key_to');

  await ensureKpiExists(db, {
    tenantId: resolvedTenantId,
    kpiId,
  });

  const result = await listKpiMeasurementsRepo(db, {
    tenantId: resolvedTenantId,
    kpiDefinitionId: kpiId,
    periodKeyFrom,
    periodKeyTo,
    page,
    pageSize,
  });

  return buildPagedResult({
    items: result.items,
    total: result.total,
    page,
    pageSize,
  });
}

export async function createKpiMeasurementService({
  db,
  tenantId,
  requestContext,
  id,
  body,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanManageKpis(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const kpiId = parsePositiveInteger(id, null, 'id');
  const userId = requestContext?.userId == null ? null : Number(requestContext.userId);

  const kpi = await ensureKpiExists(db, {
    tenantId: resolvedTenantId,
    kpiId,
  });

  const requestedPeriodType =
    body?.period_type == null || body?.period_type === ''
      ? kpi.period_type
      : normalizeEnum(body.period_type, PERIOD_TYPE_SET, 'period_type');

  if (requestedPeriodType !== kpi.period_type) {
    throw appError(
      'VALIDATION_ERROR',
      'period_type must match KPI definition period_type.',
      400
    );
  }

  const window = parsePeriodWindow(requestedPeriodType, body?.period_key);

  const duplicate = await getKpiMeasurementByPeriodRepo(db, {
    tenantId: resolvedTenantId,
    kpiDefinitionId: kpi.id,
    periodType: requestedPeriodType,
    periodKey: window.period_key,
  });

  if (duplicate) {
    throw appError(
      'KPI_MEASUREMENT_ALREADY_EXISTS',
      'Measurement already exists for this KPI and period.',
      409
    );
  }

  const measurementNote = normalizeNullableString(body?.measurement_note);

  let actualValue;
  let sourceSnapshotJson;

  if (kpi.source_type === 'MANUAL') {
    actualValue = normalizeRequiredNumeric(body?.actual_value, 'actual_value');
    sourceSnapshotJson =
      body?.source_snapshot_json == null ? null : body.source_snapshot_json;
  } else {
    const systemResult = await calculateSystemKpiMetricRepo(db, {
      tenantId: resolvedTenantId,
      metricKey: kpi.metric_key,
      anchorDate: window.period_end_date,
    });

    actualValue = Number(systemResult.actual_value);
    sourceSnapshotJson = systemResult.source_snapshot_json ?? null;
  }

  const achievementPct = calculateAchievementPct({
    direction: kpi.direction,
    targetValue: kpi.target_value,
    actualValue,
  });

  const statusCode = evaluateKpiStatus({
    direction: kpi.direction,
    targetValue: kpi.target_value,
    warningValue: kpi.warning_value,
    criticalValue: kpi.critical_value,
    actualValue,
  });

  return await createKpiMeasurementRepo(db, {
    tenant_id: resolvedTenantId,
    kpi_definition_id: kpi.id,
    period_type: kpi.period_type,
    period_key: window.period_key,
    period_start_date: window.period_start_date,
    period_end_date: window.period_end_date,
    target_value_snapshot: kpi.target_value,
    warning_value_snapshot: kpi.warning_value,
    critical_value_snapshot: kpi.critical_value,
    baseline_value_snapshot: kpi.baseline_value,
    actual_value: actualValue,
    achievement_pct: achievementPct,
    status_code: statusCode,
    measurement_source_type: kpi.source_type,
    measurement_note: measurementNote,
    source_snapshot_json: sourceSnapshotJson,
    measured_by_user_id: userId,
  });
}

export async function getKpiScorecardSummaryService({
  db,
  tenantId,
  requestContext,
  query,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const periodType = normalizeEnum(query?.period_type, PERIOD_TYPE_SET, 'period_type');
  const periodWindow = parsePeriodWindow(periodType, query?.period_key);

  const items = await getKpiScorecardSummaryRepo(db, {
    tenantId: resolvedTenantId,
    periodType,
    periodKey: periodWindow.period_key,
  });

  const rows = items.map((item) =>
    buildScorecardRow(item, periodType, periodWindow.period_key)
  );

  return {
    period_type: periodType,
    period_key: periodWindow.period_key,
    period_start_date: periodWindow.period_start_date,
    period_end_date: periodWindow.period_end_date,
    summary: summarizeScorecard(rows),
    items: rows,
  };
}

export async function getKpiTrendService({
  db,
  tenantId,
  requestContext,
  id,
  query,
}) {
  const roles = normalizeRoles(requestContext?.roles);
  assertCanViewKpiModule(roles);

  const resolvedTenantId = resolveTenantId({ tenantId, requestContext });
  const kpiId = parsePositiveInteger(id, null, 'id');
  const periodKeyFrom = normalizePeriodFilter(query?.period_key_from, 'period_key_from');
  const periodKeyTo = normalizePeriodFilter(query?.period_key_to, 'period_key_to');

  const kpi = await ensureKpiExists(db, {
    tenantId: resolvedTenantId,
    kpiId,
  });

  const series = await listKpiMeasurementsForTrendRepo(db, {
    tenantId: resolvedTenantId,
    kpiDefinitionId: kpi.id,
    periodKeyFrom,
    periodKeyTo,
  });

  return {
    kpi: {
      id: kpi.id,
      code: kpi.code,
      name: kpi.name,
      category_code: kpi.category_code,
      unit_code: kpi.unit_code,
      source_type: kpi.source_type,
      metric_key: kpi.metric_key,
      direction: kpi.direction,
      period_type: kpi.period_type,
      target_value: kpi.target_value,
      warning_value: kpi.warning_value,
      critical_value: kpi.critical_value,
      baseline_value: kpi.baseline_value,
    },
    items: series.map((row) => ({
      period_key: row.period_key,
      period_start_date: row.period_start_date,
      period_end_date: row.period_end_date,
      actual_value: row.actual_value,
      target_value: row.target_value_snapshot,
      warning_value: row.warning_value_snapshot,
      critical_value: row.critical_value_snapshot,
      baseline_value: row.baseline_value_snapshot,
      achievement_pct: row.achievement_pct,
      status_code: row.status_code,
      measured_at: row.measured_at,
    })),
  };
}
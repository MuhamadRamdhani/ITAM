function mapKpiDefinitionRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    code: row.code,
    name: row.name,
    description: row.description,
    category_code: row.category_code,
    unit_code: row.unit_code,
    source_type: row.source_type,
    metric_key: row.metric_key,
    direction: row.direction,
    period_type: row.period_type,
    target_value: row.target_value == null ? null : Number(row.target_value),
    warning_value: row.warning_value == null ? null : Number(row.warning_value),
    critical_value: row.critical_value == null ? null : Number(row.critical_value),
    baseline_value: row.baseline_value == null ? null : Number(row.baseline_value),
    owner_identity_id:
      row.owner_identity_id == null ? null : Number(row.owner_identity_id),
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order),
    created_by_user_id:
      row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    updated_by_user_id:
      row.updated_by_user_id == null ? null : Number(row.updated_by_user_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapKpiMeasurementRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    kpi_definition_id: Number(row.kpi_definition_id),
    period_type: row.period_type,
    period_key: row.period_key,
    period_start_date: row.period_start_date,
    period_end_date: row.period_end_date,
    target_value_snapshot:
      row.target_value_snapshot == null ? null : Number(row.target_value_snapshot),
    warning_value_snapshot:
      row.warning_value_snapshot == null ? null : Number(row.warning_value_snapshot),
    critical_value_snapshot:
      row.critical_value_snapshot == null ? null : Number(row.critical_value_snapshot),
    baseline_value_snapshot:
      row.baseline_value_snapshot == null ? null : Number(row.baseline_value_snapshot),
    actual_value: Number(row.actual_value),
    achievement_pct:
      row.achievement_pct == null ? null : Number(row.achievement_pct),
    status_code: row.status_code,
    measurement_source_type: row.measurement_source_type,
    measurement_note: row.measurement_note,
    source_snapshot_json: row.source_snapshot_json,
    measured_at: row.measured_at,
    measured_by_user_id:
      row.measured_by_user_id == null ? null : Number(row.measured_by_user_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapScorecardRow(row) {
  return {
    kpi_definition: {
      id: Number(row.kpi_id),
      tenant_id: Number(row.tenant_id),
      code: row.code,
      name: row.name,
      description: row.description,
      category_code: row.category_code,
      unit_code: row.unit_code,
      source_type: row.source_type,
      metric_key: row.metric_key,
      direction: row.direction,
      period_type: row.period_type,
      target_value: row.target_value == null ? null : Number(row.target_value),
      warning_value: row.warning_value == null ? null : Number(row.warning_value),
      critical_value: row.critical_value == null ? null : Number(row.critical_value),
      baseline_value: row.baseline_value == null ? null : Number(row.baseline_value),
      owner_identity_id:
        row.owner_identity_id == null ? null : Number(row.owner_identity_id),
      is_active: Boolean(row.is_active),
      display_order: Number(row.display_order),
    },
    measurement: row.measurement_id == null
      ? null
      : {
          id: Number(row.measurement_id),
          tenant_id: Number(row.tenant_id),
          kpi_definition_id: Number(row.kpi_id),
          period_type: row.measurement_period_type,
          period_key: row.measurement_period_key,
          period_start_date: row.measurement_period_start_date,
          period_end_date: row.measurement_period_end_date,
          target_value_snapshot:
            row.target_value_snapshot == null ? null : Number(row.target_value_snapshot),
          warning_value_snapshot:
            row.warning_value_snapshot == null ? null : Number(row.warning_value_snapshot),
          critical_value_snapshot:
            row.critical_value_snapshot == null ? null : Number(row.critical_value_snapshot),
          baseline_value_snapshot:
            row.baseline_value_snapshot == null ? null : Number(row.baseline_value_snapshot),
          actual_value:
            row.actual_value == null ? null : Number(row.actual_value),
          achievement_pct:
            row.achievement_pct == null ? null : Number(row.achievement_pct),
          status_code: row.status_code,
          measurement_source_type: row.measurement_source_type,
          measurement_note: row.measurement_note,
          source_snapshot_json: row.source_snapshot_json,
          measured_at: row.measured_at,
          measured_by_user_id:
            row.measured_by_user_id == null ? null : Number(row.measured_by_user_id),
          created_at: row.measurement_created_at,
          updated_at: row.measurement_updated_at,
        },
  };
}

function roundMetricValue(value) {
  return Number(Number(value).toFixed(6));
}

export async function listKpiDefinitionsRepo(db, filters) {
  const {
    tenantId,
    q,
    categoryCode,
    sourceType,
    periodType,
    isActive,
    page,
    pageSize,
  } = filters;

  const where = ['tenant_id = $1'];
  const params = [tenantId];
  let paramIndex = 2;

  if (q) {
    where.push(
      `(code ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR COALESCE(description, '') ILIKE $${paramIndex})`
    );
    params.push(`%${q}%`);
    paramIndex += 1;
  }

  if (categoryCode) {
    where.push(`category_code = $${paramIndex}`);
    params.push(categoryCode);
    paramIndex += 1;
  }

  if (sourceType) {
    where.push(`source_type = $${paramIndex}`);
    params.push(sourceType);
    paramIndex += 1;
  }

  if (periodType) {
    where.push(`period_type = $${paramIndex}`);
    params.push(periodType);
    paramIndex += 1;
  }

  if (typeof isActive === 'boolean') {
    where.push(`is_active = $${paramIndex}`);
    params.push(isActive);
    paramIndex += 1;
  }

  const whereClause = where.join(' AND ');
  const offset = (page - 1) * pageSize;

  const countSql = `
    SELECT COUNT(*)::bigint AS total
    FROM public.kpi_definitions
    WHERE ${whereClause}
  `;

  const listSql = `
    SELECT
      id,
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_definitions
    WHERE ${whereClause}
    ORDER BY display_order ASC, id DESC
    LIMIT $${paramIndex}
    OFFSET $${paramIndex + 1}
  `;

  const countResult = await db.query(countSql, params);
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await db.query(listSql, [...params, pageSize, offset]);

  return {
    items: listResult.rows.map(mapKpiDefinitionRow),
    total,
  };
}

export async function getKpiDefinitionByIdRepo(db, { tenantId, id }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_definitions
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `;

  const result = await db.query(sql, [tenantId, id]);
  return mapKpiDefinitionRow(result.rows[0] || null);
}

export async function getKpiDefinitionByCodeRepo(db, { tenantId, code }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_definitions
    WHERE tenant_id = $1
      AND code = $2
    LIMIT 1
  `;

  const result = await db.query(sql, [tenantId, code]);
  return mapKpiDefinitionRow(result.rows[0] || null);
}

export async function createKpiDefinitionRepo(db, payload) {
  const sql = `
    INSERT INTO public.kpi_definitions (
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    RETURNING
      id,
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
  `;

  const params = [
    payload.tenant_id,
    payload.code,
    payload.name,
    payload.description,
    payload.category_code,
    payload.unit_code,
    payload.source_type,
    payload.metric_key,
    payload.direction,
    payload.period_type,
    payload.target_value,
    payload.warning_value,
    payload.critical_value,
    payload.baseline_value,
    payload.owner_identity_id,
    payload.is_active,
    payload.display_order,
    payload.created_by_user_id,
    payload.updated_by_user_id,
  ];

  const result = await db.query(sql, params);
  return mapKpiDefinitionRow(result.rows[0] || null);
}

export async function updateKpiDefinitionRepo(db, { tenantId, id, patch }) {
  const fields = [];
  const params = [];
  let idx = 1;

  const pushField = (column, value) => {
    fields.push(`${column} = $${idx}`);
    params.push(value);
    idx += 1;
  };

  pushField('code', patch.code);
  pushField('name', patch.name);
  pushField('description', patch.description);
  pushField('category_code', patch.category_code);
  pushField('unit_code', patch.unit_code);
  pushField('source_type', patch.source_type);
  pushField('metric_key', patch.metric_key);
  pushField('direction', patch.direction);
  pushField('period_type', patch.period_type);
  pushField('target_value', patch.target_value);
  pushField('warning_value', patch.warning_value);
  pushField('critical_value', patch.critical_value);
  pushField('baseline_value', patch.baseline_value);
  pushField('owner_identity_id', patch.owner_identity_id);
  pushField('is_active', patch.is_active);
  pushField('display_order', patch.display_order);
  pushField('updated_by_user_id', patch.updated_by_user_id);

  fields.push(`updated_at = NOW()`);

  const sql = `
    UPDATE public.kpi_definitions
    SET ${fields.join(', ')}
    WHERE tenant_id = $${idx}
      AND id = $${idx + 1}
    RETURNING
      id,
      tenant_id,
      code,
      name,
      description,
      category_code,
      unit_code,
      source_type,
      metric_key,
      direction,
      period_type,
      target_value,
      warning_value,
      critical_value,
      baseline_value,
      owner_identity_id,
      is_active,
      display_order,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
  `;

  params.push(tenantId, id);

  const result = await db.query(sql, params);
  return mapKpiDefinitionRow(result.rows[0] || null);
}

export async function identityExistsRepo(db, { tenantId, identityId }) {
  const sql = `
    SELECT 1
    FROM public.identities
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `;

  const result = await db.query(sql, [tenantId, identityId]);
  return result.rowCount > 0;
}

export async function listKpiMeasurementsRepo(db, filters) {
  const {
    tenantId,
    kpiDefinitionId,
    periodKeyFrom,
    periodKeyTo,
    page,
    pageSize,
  } = filters;

  const where = ['tenant_id = $1', 'kpi_definition_id = $2'];
  const params = [tenantId, kpiDefinitionId];
  let paramIndex = 3;

  if (periodKeyFrom) {
    where.push(`period_key >= $${paramIndex}`);
    params.push(periodKeyFrom);
    paramIndex += 1;
  }

  if (periodKeyTo) {
    where.push(`period_key <= $${paramIndex}`);
    params.push(periodKeyTo);
    paramIndex += 1;
  }

  const whereClause = where.join(' AND ');
  const offset = (page - 1) * pageSize;

  const countSql = `
    SELECT COUNT(*)::bigint AS total
    FROM public.kpi_measurements
    WHERE ${whereClause}
  `;

  const listSql = `
    SELECT
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_measurements
    WHERE ${whereClause}
    ORDER BY period_end_date DESC, id DESC
    LIMIT $${paramIndex}
    OFFSET $${paramIndex + 1}
  `;

  const countResult = await db.query(countSql, params);
  const total = Number(countResult.rows[0]?.total || 0);

  const listResult = await db.query(listSql, [...params, pageSize, offset]);

  return {
    items: listResult.rows.map(mapKpiMeasurementRow),
    total,
  };
}

export async function listKpiMeasurementsForTrendRepo(
  db,
  { tenantId, kpiDefinitionId, periodKeyFrom, periodKeyTo }
) {
  const where = ['tenant_id = $1', 'kpi_definition_id = $2'];
  const params = [tenantId, kpiDefinitionId];
  let paramIndex = 3;

  if (periodKeyFrom) {
    where.push(`period_key >= $${paramIndex}`);
    params.push(periodKeyFrom);
    paramIndex += 1;
  }

  if (periodKeyTo) {
    where.push(`period_key <= $${paramIndex}`);
    params.push(periodKeyTo);
    paramIndex += 1;
  }

  const whereClause = where.join(' AND ');

  const sql = `
    SELECT
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_measurements
    WHERE ${whereClause}
    ORDER BY period_start_date ASC, id ASC
  `;

  const result = await db.query(sql, params);
  return result.rows.map(mapKpiMeasurementRow);
}

export async function getKpiMeasurementByPeriodRepo(
  db,
  { tenantId, kpiDefinitionId, periodType, periodKey }
) {
  const sql = `
    SELECT
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_measurements
    WHERE tenant_id = $1
      AND kpi_definition_id = $2
      AND period_type = $3
      AND period_key = $4
    LIMIT 1
  `;

  const result = await db.query(sql, [
    tenantId,
    kpiDefinitionId,
    periodType,
    periodKey,
  ]);

  return mapKpiMeasurementRow(result.rows[0] || null);
}

export async function getKpiMeasurementByIdRepo(db, { tenantId, measurementId }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
    FROM public.kpi_measurements
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `;

  const result = await db.query(sql, [tenantId, measurementId]);
  return mapKpiMeasurementRow(result.rows[0] || null);
}

export async function createKpiMeasurementRepo(db, payload) {
  const sql = `
    INSERT INTO public.kpi_measurements (
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      period_start_date,
      period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16::jsonb, NOW(), $17
    )
    RETURNING
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
  `;

  const params = [
    payload.tenant_id,
    payload.kpi_definition_id,
    payload.period_type,
    payload.period_key,
    payload.period_start_date,
    payload.period_end_date,
    payload.target_value_snapshot,
    payload.warning_value_snapshot,
    payload.critical_value_snapshot,
    payload.baseline_value_snapshot,
    payload.actual_value,
    payload.achievement_pct,
    payload.status_code,
    payload.measurement_source_type,
    payload.measurement_note,
    payload.source_snapshot_json == null
      ? null
      : JSON.stringify(payload.source_snapshot_json),
    payload.measured_by_user_id,
  ];

  const result = await db.query(sql, params);
  return mapKpiMeasurementRow(result.rows[0] || null);
}

export async function updateKpiMeasurementRepo(db, payload) {
  const sql = `
    UPDATE public.kpi_measurements
       SET actual_value = $3,
           achievement_pct = $4,
           status_code = $5,
           measurement_note = $6,
           source_snapshot_json = $7::jsonb,
           measured_by_user_id = $8,
           measured_at = NOW()
     WHERE tenant_id = $1
       AND id = $2
     RETURNING
      id,
      tenant_id,
      kpi_definition_id,
      period_type,
      period_key,
      TO_CHAR(period_start_date, 'YYYY-MM-DD') AS period_start_date,
      TO_CHAR(period_end_date, 'YYYY-MM-DD') AS period_end_date,
      target_value_snapshot,
      warning_value_snapshot,
      critical_value_snapshot,
      baseline_value_snapshot,
      actual_value,
      achievement_pct,
      status_code,
      measurement_source_type,
      measurement_note,
      source_snapshot_json,
      measured_at,
      measured_by_user_id,
      created_at,
      updated_at
  `;

  const result = await db.query(sql, [
    payload.tenant_id,
    payload.id,
    payload.actual_value,
    payload.achievement_pct,
    payload.status_code,
    payload.measurement_note,
    payload.source_snapshot_json == null
      ? null
      : JSON.stringify(payload.source_snapshot_json),
    payload.measured_by_user_id,
  ]);

  return mapKpiMeasurementRow(result.rows[0] || null);
}

export async function getKpiScorecardSummaryRepo(
  db,
  { tenantId, periodType, periodKey }
) {
  const sql = `
    SELECT
      d.id AS kpi_id,
      d.tenant_id,
      d.code,
      d.name,
      d.description,
      d.category_code,
      d.unit_code,
      d.source_type,
      d.metric_key,
      d.direction,
      d.period_type,
      d.target_value,
      d.warning_value,
      d.critical_value,
      d.baseline_value,
      d.owner_identity_id,
      d.is_active,
      d.display_order,

      m.id AS measurement_id,
      m.period_type AS measurement_period_type,
      m.period_key AS measurement_period_key,
      TO_CHAR(m.period_start_date, 'YYYY-MM-DD') AS measurement_period_start_date,
      TO_CHAR(m.period_end_date, 'YYYY-MM-DD') AS measurement_period_end_date,
      m.target_value_snapshot,
      m.warning_value_snapshot,
      m.critical_value_snapshot,
      m.baseline_value_snapshot,
      m.actual_value,
      m.achievement_pct,
      m.status_code,
      m.measurement_source_type,
      m.measurement_note,
      m.source_snapshot_json,
      m.measured_at,
      m.measured_by_user_id,
      m.created_at AS measurement_created_at,
      m.updated_at AS measurement_updated_at
    FROM public.kpi_definitions d
    LEFT JOIN public.kpi_measurements m
      ON m.tenant_id = d.tenant_id
     AND m.kpi_definition_id = d.id
     AND m.period_type = $2
     AND m.period_key = $3
    WHERE d.tenant_id = $1
      AND d.is_active = TRUE
      AND d.period_type = $2
    ORDER BY d.display_order ASC, d.id ASC
  `;

  const result = await db.query(sql, [tenantId, periodType, periodKey]);
  return result.rows.map(mapScorecardRow);
}

async function getAssetCompletenessCountsRepo(db, { tenantId, columnName }) {
  const allowedColumns = new Set([
    'owner_department_id',
    'current_custodian_identity',
    'location_id',
  ]);

  if (!allowedColumns.has(columnName)) {
    throw new Error(`Unsupported asset completeness column: ${columnName}`);
  }

  const sql = `
    SELECT
      COUNT(*)::bigint AS total_count,
      COUNT(*) FILTER (WHERE ${columnName} IS NOT NULL)::bigint AS matched_count
    FROM public.assets
    WHERE tenant_id = $1
  `;

  const result = await db.query(sql, [tenantId]);
  return {
    total_count: Number(result.rows[0]?.total_count || 0),
    matched_count: Number(result.rows[0]?.matched_count || 0),
  };
}

async function calculateAssetOwnerCompletenessRepo(db, { tenantId }) {
  const counts = await getAssetCompletenessCountsRepo(db, {
    tenantId,
    columnName: 'owner_department_id',
  });

  const actualValue =
    counts.total_count === 0
      ? 0
      : roundMetricValue((counts.matched_count / counts.total_count) * 100);

  return {
    actual_value: actualValue,
    source_snapshot_json: {
      metric_key: 'ASSET_OWNER_COMPLETENESS_PCT',
      total_assets: counts.total_count,
      matched_assets: counts.matched_count,
    },
  };
}

async function calculateAssetCustodianCompletenessRepo(db, { tenantId }) {
  const counts = await getAssetCompletenessCountsRepo(db, {
    tenantId,
    columnName: 'current_custodian_identity',
  });

  const actualValue =
    counts.total_count === 0
      ? 0
      : roundMetricValue((counts.matched_count / counts.total_count) * 100);

  return {
    actual_value: actualValue,
    source_snapshot_json: {
      metric_key: 'ASSET_CUSTODIAN_COMPLETENESS_PCT',
      total_assets: counts.total_count,
      matched_assets: counts.matched_count,
    },
  };
}

async function calculateAssetLocationCompletenessRepo(db, { tenantId }) {
  const counts = await getAssetCompletenessCountsRepo(db, {
    tenantId,
    columnName: 'location_id',
  });

  const actualValue =
    counts.total_count === 0
      ? 0
      : roundMetricValue((counts.matched_count / counts.total_count) * 100);

  return {
    actual_value: actualValue,
    source_snapshot_json: {
      metric_key: 'ASSET_LOCATION_COMPLETENESS_PCT',
      total_assets: counts.total_count,
      matched_assets: counts.matched_count,
    },
  };
}

async function calculatePendingApprovalCountRepo(db, { tenantId }) {
  const sql = `
    SELECT COUNT(*)::bigint AS pending_count
    FROM public.approvals
    WHERE tenant_id = $1
      AND status = 'PENDING'
  `;

  const result = await db.query(sql, [tenantId]);
  const pendingCount = Number(result.rows[0]?.pending_count || 0);

  return {
    actual_value: pendingCount,
    source_snapshot_json: {
      metric_key: 'PENDING_APPROVAL_COUNT',
      pending_approvals: pendingCount,
    },
  };
}

async function calculateContractExpiring30dCountRepo(db, { tenantId, anchorDate }) {
  const sql = `
    SELECT COUNT(*)::bigint AS expiring_count
    FROM public.contracts
    WHERE tenant_id = $1
      AND status = 'ACTIVE'
      AND end_date IS NOT NULL
      AND end_date >= $2::date
      AND end_date <= ($2::date + INTERVAL '30 days')
  `;

  const result = await db.query(sql, [tenantId, anchorDate]);
  const expiringCount = Number(result.rows[0]?.expiring_count || 0);

  return {
    actual_value: expiringCount,
    source_snapshot_json: {
      metric_key: 'CONTRACT_EXPIRING_30D_COUNT',
      anchor_date: anchorDate,
      expiring_contracts_30d: expiringCount,
    },
  };
}

export async function calculateSystemKpiMetricRepo(
  db,
  { tenantId, metricKey, anchorDate }
) {
  switch (metricKey) {
    case 'ASSET_OWNER_COMPLETENESS_PCT':
      return await calculateAssetOwnerCompletenessRepo(db, { tenantId });

    case 'ASSET_CUSTODIAN_COMPLETENESS_PCT':
      return await calculateAssetCustodianCompletenessRepo(db, { tenantId });

    case 'ASSET_LOCATION_COMPLETENESS_PCT':
      return await calculateAssetLocationCompletenessRepo(db, { tenantId });

    case 'PENDING_APPROVAL_COUNT':
      return await calculatePendingApprovalCountRepo(db, { tenantId });

    case 'CONTRACT_EXPIRING_30D_COUNT':
      return await calculateContractExpiring30dCountRepo(db, {
        tenantId,
        anchorDate,
      });

    default:
      throw new Error(`Unsupported KPI system metric: ${metricKey}`);
  }
}

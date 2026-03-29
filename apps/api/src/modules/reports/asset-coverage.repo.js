function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateOrNull(v) {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }

  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return s;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toContractPreviewItems(value) {
  const arr = parseJsonArray(value);
  return arr
    .map((item) => ({
      id: toInt(item?.id),
      code: String(item?.code ?? "").trim(),
    }))
    .filter((item) => item.id > 0 && item.code);
}

function toVendorPreviewItems(value) {
  const arr = parseJsonArray(value);
  return arr
    .map((item) => ({
      id: toInt(item?.id),
      name: String(item?.name ?? "").trim(),
    }))
    .filter((item) => item.id > 0 && item.name);
}

function contractHealthSql(alias = "c") {
  return `
    CASE
      WHEN ${alias}.end_date IS NULL THEN 'NO_END_DATE'
      WHEN ${alias}.end_date < CURRENT_DATE THEN 'EXPIRED'
      WHEN ${alias}.end_date <= (CURRENT_DATE + (COALESCE(${alias}.renewal_notice_days, 30) * INTERVAL '1 day')) THEN 'EXPIRING'
      ELSE 'ACTIVE'
    END
  `;
}

function buildBaseFilters(filters) {
  const params = [filters.tenantId];
  const clauses = [`a.tenant_id = $1`];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    clauses.push(
      `(a.asset_tag ILIKE $${params.length} OR a.name ILIKE $${params.length})`
    );
  }

  if (filters.typeCode) {
    params.push(filters.typeCode);
    clauses.push(`at.code = $${params.length}`);
  }

  if (
    filters.vendorId != null ||
    filters.contractId != null ||
    filters.contractHealth != null
  ) {
    const relationClauses = [
      `ca.tenant_id = a.tenant_id`,
      `ca.asset_id = a.id`,
      `c.tenant_id = ca.tenant_id`,
      `c.id = ca.contract_id`,
    ];

    if (filters.vendorId != null) {
      params.push(filters.vendorId);
      relationClauses.push(`c.vendor_id = $${params.length}`);
    }

    if (filters.contractId != null) {
      params.push(filters.contractId);
      relationClauses.push(`c.id = $${params.length}`);
    }

    if (filters.contractHealth) {
      params.push(filters.contractHealth);
      relationClauses.push(`(${contractHealthSql("c")}) = $${params.length}`);
    }

    clauses.push(`
      EXISTS (
        SELECT 1
        FROM public.contract_assets ca
        INNER JOIN public.contracts c
          ON c.tenant_id = ca.tenant_id
         AND c.id = ca.contract_id
        WHERE ${relationClauses.join(" AND ")}
      )
    `);
  }

  return { params, baseWhereSql: clauses.join(" AND ") };
}

function buildOuterFilters(filters, params) {
  const clauses = [`1=1`];

  if (filters.coverageKind) {
    params.push(filters.coverageKind);
    clauses.push(`ce.coverage_kind = $${params.length}`);
  }

  if (filters.health) {
    params.push(filters.health);
    clauses.push(`ce.coverage_health = $${params.length}`);
  }

  if (filters.linkStatus === "LINKED") {
    clauses.push(`ce.has_linked_contract = TRUE`);
  } else if (filters.linkStatus === "NO_LINK") {
    clauses.push(`ce.has_linked_contract = FALSE`);
  }

  if (filters.expiringInDays != null) {
    params.push(filters.expiringInDays);
    clauses.push(
      `ce.days_to_expiry IS NOT NULL AND ce.days_to_expiry BETWEEN 0 AND $${params.length}`
    );
  }

  return { params, outerWhereSql: clauses.join(" AND ") };
}

function buildCoverageCte(baseWhereSql, thresholdDaysParamIndex) {
  return `
    WITH base_asset AS (
      SELECT
        a.id AS asset_id,
        a.asset_tag,
        a.name,
        a.status,
        jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
        CASE
          WHEN ls.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', ls.code, 'label', ls.display_name)
        END AS state,

        a.warranty_start_date,
        a.warranty_end_date,
        a.support_start_date,
        a.support_end_date,
        a.subscription_start_date,
        a.subscription_end_date
      FROM public.assets a
      JOIN public.asset_types at
        ON at.id = a.asset_type_id
      LEFT JOIN public.lifecycle_states ls
        ON ls.id = a.current_state_id
      WHERE ${baseWhereSql}
    ),
    contract_relation_rollup AS (
      SELECT
        ca.tenant_id,
        ca.asset_id,
        COUNT(DISTINCT c.id)::int AS linked_contracts_count,
        COUNT(DISTINCT c.vendor_id)::int AS linked_vendors_count,

        BOOL_OR((${contractHealthSql("c")}) = 'ACTIVE') AS has_active_contract,
        BOOL_OR((${contractHealthSql("c")}) = 'EXPIRING') AS has_expiring_contract,
        BOOL_OR((${contractHealthSql("c")}) = 'EXPIRED') AS has_expired_contract,
        BOOL_OR((${contractHealthSql("c")}) = 'NO_END_DATE') AS has_no_end_date_contract,

        COALESCE(
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.contract_code ORDER BY c.contract_code), NULL),
          ARRAY[]::text[]
        ) AS contract_codes_preview,

        COALESCE(
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT v.vendor_name ORDER BY v.vendor_name), NULL),
          ARRAY[]::text[]
        ) AS vendor_names_preview,

        COALESCE(
          (
            SELECT jsonb_agg(x.obj ORDER BY x.code)
            FROM (
              SELECT DISTINCT
                c2.id,
                c2.contract_code AS code,
                jsonb_build_object(
                  'id', c2.id,
                  'code', c2.contract_code
                ) AS obj
              FROM public.contract_assets ca2
              JOIN public.contracts c2
                ON c2.tenant_id = ca2.tenant_id
               AND c2.id = ca2.contract_id
              WHERE ca2.tenant_id = ca.tenant_id
                AND ca2.asset_id = ca.asset_id
            ) x
          ),
          '[]'::jsonb
        ) AS contract_preview_items,

        COALESCE(
          (
            SELECT jsonb_agg(x.obj ORDER BY x.name)
            FROM (
              SELECT DISTINCT
                v2.id,
                v2.vendor_name AS name,
                jsonb_build_object(
                  'id', v2.id,
                  'name', v2.vendor_name
                ) AS obj
              FROM public.contract_assets ca3
              JOIN public.contracts c3
                ON c3.tenant_id = ca3.tenant_id
               AND c3.id = ca3.contract_id
              JOIN public.vendors v2
                ON v2.tenant_id = c3.tenant_id
               AND v2.id = c3.vendor_id
              WHERE ca3.tenant_id = ca.tenant_id
                AND ca3.asset_id = ca.asset_id
            ) x
          ),
          '[]'::jsonb
        ) AS vendor_preview_items
      FROM public.contract_assets ca
      JOIN public.contracts c
        ON c.tenant_id = ca.tenant_id
       AND c.id = ca.contract_id
      JOIN public.vendors v
        ON v.tenant_id = c.tenant_id
       AND v.id = c.vendor_id
      JOIN base_asset b
        ON b.asset_id = ca.asset_id
      GROUP BY ca.tenant_id, ca.asset_id
    ),
    coverage_rows AS (
      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type,
        b.state,
        'WARRANTY'::text AS coverage_kind,
        b.warranty_start_date AS start_date,
        b.warranty_end_date AS end_date
      FROM base_asset b
      WHERE b.warranty_start_date IS NOT NULL OR b.warranty_end_date IS NOT NULL

      UNION ALL

      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type,
        b.state,
        'SUPPORT'::text AS coverage_kind,
        b.support_start_date AS start_date,
        b.support_end_date AS end_date
      FROM base_asset b
      WHERE b.support_start_date IS NOT NULL OR b.support_end_date IS NOT NULL

      UNION ALL

      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type,
        b.state,
        'SUBSCRIPTION'::text AS coverage_kind,
        b.subscription_start_date AS start_date,
        b.subscription_end_date AS end_date
      FROM base_asset b
      WHERE b.subscription_start_date IS NOT NULL OR b.subscription_end_date IS NOT NULL

      UNION ALL

      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type,
        b.state,
        'NONE'::text AS coverage_kind,
        NULL::date AS start_date,
        NULL::date AS end_date
      FROM base_asset b
      WHERE
        b.warranty_start_date IS NULL
        AND b.warranty_end_date IS NULL
        AND b.support_start_date IS NULL
        AND b.support_end_date IS NULL
        AND b.subscription_start_date IS NULL
        AND b.subscription_end_date IS NULL
    ),
    coverage_enriched AS (
      SELECT
        c.*,
        CASE
          WHEN c.coverage_kind = 'NONE' THEN 'NO_COVERAGE'
          WHEN c.end_date IS NULL THEN 'NO_END_DATE'
          WHEN c.end_date < CURRENT_DATE THEN 'EXPIRED'
          WHEN c.end_date <= (CURRENT_DATE + ($${thresholdDaysParamIndex} * INTERVAL '1 day')) THEN 'EXPIRING'
          ELSE 'ACTIVE'
        END AS coverage_health,
        CASE
          WHEN c.coverage_kind = 'NONE' THEN NULL
          WHEN c.end_date IS NULL THEN NULL
          ELSE (c.end_date - CURRENT_DATE)
        END AS days_to_expiry,

        (COALESCE(rr.linked_contracts_count, 0) > 0) AS has_linked_contract,
        COALESCE(rr.linked_contracts_count, 0) AS linked_contracts_count,
        COALESCE(rr.linked_vendors_count, 0) AS linked_vendors_count,

        COALESCE(rr.has_active_contract, FALSE) AS has_active_contract,
        COALESCE(rr.has_expiring_contract, FALSE) AS has_expiring_contract,
        COALESCE(rr.has_expired_contract, FALSE) AS has_expired_contract,
        COALESCE(rr.has_no_end_date_contract, FALSE) AS has_no_end_date_contract,

        CASE
          WHEN COALESCE(rr.linked_contracts_count, 0) = 0 THEN 'NO_LINK'
          WHEN COALESCE(rr.has_expired_contract, FALSE) THEN 'HAS_EXPIRED'
          WHEN COALESCE(rr.has_expiring_contract, FALSE) THEN 'HAS_EXPIRING'
          WHEN COALESCE(rr.has_no_end_date_contract, FALSE) THEN 'HAS_NO_END_DATE'
          ELSE 'ACTIVE_ONLY'
        END AS contract_health_rollup,

        COALESCE(rr.contract_codes_preview, ARRAY[]::text[]) AS contract_codes_preview,
        COALESCE(rr.vendor_names_preview, ARRAY[]::text[]) AS vendor_names_preview,
        COALESCE(rr.contract_preview_items, '[]'::jsonb) AS contract_preview_items,
        COALESCE(rr.vendor_preview_items, '[]'::jsonb) AS vendor_preview_items
      FROM coverage_rows c
      LEFT JOIN contract_relation_rollup rr
        ON rr.asset_id = c.asset_id
    )
  `;
}

function mapCoverageRow(r) {
  return {
    asset_id: toInt(r.asset_id),
    asset_tag: r.asset_tag,
    name: r.name,
    status: r.status ?? null,
    asset_type: r.asset_type,
    state: r.state ?? null,
    coverage_kind: r.coverage_kind,
    start_date: toDateOrNull(r.start_date),
    end_date: toDateOrNull(r.end_date),
    coverage_health: r.coverage_health,
    days_to_expiry: toIntOrNull(r.days_to_expiry),

    has_linked_contract: Boolean(r.has_linked_contract),
    linked_contracts_count: toInt(r.linked_contracts_count),
    linked_vendors_count: toInt(r.linked_vendors_count),

    has_active_contract: Boolean(r.has_active_contract),
    has_expiring_contract: Boolean(r.has_expiring_contract),
    has_expired_contract: Boolean(r.has_expired_contract),
    has_no_end_date_contract: Boolean(r.has_no_end_date_contract),

    contract_health_rollup: r.contract_health_rollup,
    contract_codes_preview: toStringArray(r.contract_codes_preview),
    vendor_names_preview: toStringArray(r.vendor_names_preview),

    contract_preview_items: toContractPreviewItems(r.contract_preview_items),
    vendor_preview_items: toVendorPreviewItems(r.vendor_preview_items),
  };
}

function buildCoverageSelectSql(
  baseWhereSql,
  thresholdDaysParamIndex,
  outerWhereSql,
  tailSql = ""
) {
  return `
    ${buildCoverageCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT
      ce.asset_id,
      ce.asset_tag,
      ce.name,
      ce.status,
      ce.asset_type,
      ce.state,
      ce.coverage_kind,
      ce.start_date,
      ce.end_date,
      ce.coverage_health,
      ce.days_to_expiry,

      ce.has_linked_contract,
      ce.linked_contracts_count,
      ce.linked_vendors_count,

      ce.has_active_contract,
      ce.has_expiring_contract,
      ce.has_expired_contract,
      ce.has_no_end_date_contract,

      ce.contract_health_rollup,
      ce.contract_codes_preview,
      ce.vendor_names_preview,
      ce.contract_preview_items,
      ce.vendor_preview_items
    FROM coverage_enriched ce
    WHERE ${outerWhereSql}
    ORDER BY
      CASE ce.coverage_health
        WHEN 'EXPIRED' THEN 1
        WHEN 'EXPIRING' THEN 2
        WHEN 'NO_END_DATE' THEN 3
        WHEN 'ACTIVE' THEN 4
        WHEN 'NO_COVERAGE' THEN 5
        ELSE 6
      END,
      ce.end_date ASC NULLS LAST,
      ce.asset_id DESC
    ${tailSql}
  `;
}

export async function listAssetCoverage(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  params.push(filters.limit, filters.offset);
  const limitParamIndex = params.length - 1;
  const offsetParamIndex = params.length;

  const sql = buildCoverageSelectSql(
    baseWhereSql,
    thresholdDaysParamIndex,
    outerWhereSql,
    `LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`
  );

  const { rows } = await app.pg.query(sql, params);
  return (rows || []).map(mapCoverageRow);
}

export async function listAllAssetCoverage(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = buildCoverageSelectSql(
    baseWhereSql,
    thresholdDaysParamIndex,
    outerWhereSql
  );

  const { rows } = await app.pg.query(sql, params);
  return (rows || []).map(mapCoverageRow);
}

export async function countAssetCoverage(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = `
    ${buildCoverageCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT COUNT(*)::int AS total
    FROM coverage_enriched ce
    WHERE ${outerWhereSql}
  `;

  const { rows } = await app.pg.query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

export async function getAssetCoverageSummary(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = `
    ${buildCoverageCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT
      COUNT(*) FILTER (WHERE ce.coverage_health = 'ACTIVE')::int AS active_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'EXPIRING')::int AS expiring_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'EXPIRED')::int AS expired_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'NO_COVERAGE')::int AS no_coverage_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'NO_END_DATE')::int AS no_end_date_count,

      COUNT(*) FILTER (WHERE ce.has_linked_contract)::int AS rows_with_linked_contract,
      COUNT(*) FILTER (WHERE NOT ce.has_linked_contract)::int AS rows_without_linked_contract,
      COUNT(*) FILTER (WHERE ce.has_active_contract)::int AS rows_with_active_contract,
      COUNT(*) FILTER (WHERE ce.has_expiring_contract)::int AS rows_with_expiring_contract,
      COUNT(*) FILTER (WHERE ce.has_expired_contract)::int AS rows_with_expired_contract,
      COUNT(*) FILTER (WHERE ce.has_no_end_date_contract)::int AS rows_with_no_end_date_contract
    FROM coverage_enriched ce
    WHERE ${outerWhereSql}
  `;

  const { rows } = await app.pg.query(sql, params);
  const r = rows[0] || {};

  return {
    active_count: toInt(r.active_count),
    expiring_count: toInt(r.expiring_count),
    expired_count: toInt(r.expired_count),
    no_coverage_count: toInt(r.no_coverage_count),
    no_end_date_count: toInt(r.no_end_date_count),

    rows_with_linked_contract: toInt(r.rows_with_linked_contract),
    rows_without_linked_contract: toInt(r.rows_without_linked_contract),
    rows_with_active_contract: toInt(r.rows_with_active_contract),
    rows_with_expiring_contract: toInt(r.rows_with_expiring_contract),
    rows_with_expired_contract: toInt(r.rows_with_expired_contract),
    rows_with_no_end_date_contract: toInt(r.rows_with_no_end_date_contract),
  };
}
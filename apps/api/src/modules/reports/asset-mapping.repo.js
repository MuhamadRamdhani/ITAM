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
    clauses.push(`
      (
        a.asset_tag ILIKE $${params.length}
        OR a.name ILIKE $${params.length}
        OR at.code ILIKE $${params.length}
        OR at.display_name ILIKE $${params.length}
        OR COALESCE(ls.code, '') ILIKE $${params.length}
        OR COALESCE(ls.display_name, '') ILIKE $${params.length}
        OR COALESCE(d.code, '') ILIKE $${params.length}
        OR COALESCE(d.name, '') ILIKE $${params.length}
        OR COALESCE(l.code, '') ILIKE $${params.length}
        OR COALESCE(l.name, '') ILIKE $${params.length}
        OR COALESCE(i.name, '') ILIKE $${params.length}
        OR COALESCE(i.email, '') ILIKE $${params.length}
      )
    `);
  }

  if (filters.typeCode) {
    params.push(filters.typeCode);
    clauses.push(`at.code = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`a.status = $${params.length}`);
  }

  if (filters.lifecycleState) {
    params.push(filters.lifecycleState);
    clauses.push(`ls.code = $${params.length}`);
  }

  if (filters.departmentId != null) {
    params.push(filters.departmentId);
    clauses.push(`a.owner_department_id = $${params.length}`);
  }

  if (filters.locationId != null) {
    params.push(filters.locationId);
    clauses.push(`a.location_id = $${params.length}`);
  }

  if (filters.ownerIdentityId != null) {
    params.push(filters.ownerIdentityId);
    clauses.push(`a.current_custodian_identity_id = $${params.length}`);
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

function buildMappingCte(baseWhereSql, thresholdDaysParamIndex) {
  return `
    WITH primary_contract AS (
      SELECT
        ca.tenant_id,
        ca.asset_id,
        c.id AS contract_id,
        c.contract_code,
        c.contract_type,
        c.start_date,
        c.end_date,
        c.renewal_notice_days
      FROM public.contract_assets ca
      INNER JOIN public.contracts c
        ON c.tenant_id = ca.tenant_id
       AND c.id = ca.contract_id
      INNER JOIN (
        SELECT tenant_id, asset_id
        FROM public.contract_assets
        GROUP BY tenant_id, asset_id
        HAVING COUNT(DISTINCT contract_id) = 1
      ) single_contract
        ON single_contract.tenant_id = ca.tenant_id
       AND single_contract.asset_id = ca.asset_id
    ),
    base_asset AS (
      SELECT
        a.id AS asset_id,
        a.asset_tag,
        a.name,
        a.status,
        at.code AS asset_type_code,
        jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
        CASE
          WHEN ls.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', ls.code, 'label', ls.display_name)
        END AS state,
        pc.contract_code AS primary_contract_code,
        pc.contract_type AS primary_contract_type,
        pc.start_date AS primary_contract_start_date,
        pc.end_date AS primary_contract_end_date,
        CASE
          WHEN d.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', d.code, 'label', d.name)
        END AS department,
        CASE
          WHEN l.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', l.code, 'label', l.name)
        END AS location,
        CASE
          WHEN i.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', i.id,
            'name', COALESCE(i.name, i.email),
            'email', i.email
          )
        END AS owner_identity,
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
      LEFT JOIN public.departments d
        ON d.tenant_id = a.tenant_id
       AND d.id = a.owner_department_id
      LEFT JOIN public.locations l
        ON l.tenant_id = a.tenant_id
       AND l.id = a.location_id
      LEFT JOIN public.identities i
        ON i.tenant_id = a.tenant_id
       AND i.id = a.current_custodian_identity_id
      LEFT JOIN primary_contract pc
        ON pc.tenant_id = a.tenant_id
       AND pc.asset_id = a.id
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
                jsonb_build_object('id', c2.id, 'code', c2.contract_code) AS obj
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
                jsonb_build_object('id', v2.id, 'name', v2.vendor_name) AS obj
              FROM public.contract_assets ca3
              JOIN public.contracts c3
                ON c3.tenant_id = ca3.tenant_id
               AND c3.id = ca3.contract_id
              LEFT JOIN public.vendors v2
                ON v2.tenant_id = c3.tenant_id
               AND v2.id = c3.vendor_id
              WHERE ca3.tenant_id = ca.tenant_id
                AND ca3.asset_id = ca.asset_id
                AND v2.id IS NOT NULL
            ) x
          ),
          '[]'::jsonb
        ) AS vendor_preview_items
      FROM public.contract_assets ca
      JOIN public.contracts c
        ON c.tenant_id = ca.tenant_id
       AND c.id = ca.contract_id
      LEFT JOIN public.vendors v
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
        b.asset_type_code,
        b.asset_type,
        b.state,
        b.department,
        b.location,
        b.owner_identity,
        'WARRANTY'::text AS coverage_kind,
        CASE
          WHEN b.asset_type_code IN ('HARDWARE', 'NETWORK')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          THEN b.primary_contract_start_date
          ELSE b.warranty_start_date
        END AS start_date,
        CASE
          WHEN b.asset_type_code IN ('HARDWARE', 'NETWORK')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          THEN b.primary_contract_end_date
          ELSE b.warranty_end_date
        END AS end_date
      FROM base_asset b
      WHERE
        b.warranty_start_date IS NOT NULL
        OR b.warranty_end_date IS NOT NULL
        OR (
          b.asset_type_code IN ('HARDWARE', 'NETWORK')
          AND b.primary_contract_start_date IS NOT NULL
          AND b.primary_contract_end_date IS NOT NULL
        )

      UNION ALL

      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type_code,
        b.asset_type,
        b.state,
        b.department,
        b.location,
        b.owner_identity,
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
        b.asset_type_code,
        b.asset_type,
        b.state,
        b.department,
        b.location,
        b.owner_identity,
        'SUBSCRIPTION'::text AS coverage_kind,
        CASE
          WHEN b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          THEN b.primary_contract_start_date
          ELSE b.subscription_start_date
        END AS start_date,
        CASE
          WHEN b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          THEN b.primary_contract_end_date
          ELSE b.subscription_end_date
        END AS end_date
      FROM base_asset b
      WHERE
        b.subscription_start_date IS NOT NULL
        OR b.subscription_end_date IS NOT NULL
        OR (
          b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
          AND b.primary_contract_start_date IS NOT NULL
          AND b.primary_contract_end_date IS NOT NULL
        )

      UNION ALL

      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type_code,
        b.asset_type,
        b.state,
        b.department,
        b.location,
        b.owner_identity,
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
        AND NOT (
          (
            b.asset_type_code IN ('HARDWARE', 'NETWORK')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          )
          OR (
            b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
            AND b.primary_contract_start_date IS NOT NULL
            AND b.primary_contract_end_date IS NOT NULL
          )
        )
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

function mapMappingRow(r) {
  return {
    asset_id: toInt(r.asset_id),
    asset_tag: r.asset_tag,
    name: r.name,
    status: r.status ?? null,
    asset_type: r.asset_type,
    state: r.state ?? null,
    department: r.department ?? null,
    location: r.location ?? null,
    owner_identity: r.owner_identity ?? null,
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

function buildMappingSelectSql(
  baseWhereSql,
  thresholdDaysParamIndex,
  outerWhereSql,
  tailSql = ""
) {
  return `
    ${buildMappingCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT
      ce.asset_id,
      ce.asset_tag,
      ce.name,
      ce.status,
      ce.asset_type,
      ce.state,
      ce.department,
      ce.location,
      ce.owner_identity,
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

export async function listAssetMapping(app, filters) {
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

  const sql = buildMappingSelectSql(
    baseWhereSql,
    thresholdDaysParamIndex,
    outerWhereSql,
    `LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`
  );

  const { rows } = await app.pg.query(sql, params);
  return (rows || []).map(mapMappingRow);
}

export async function listAllAssetMapping(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = buildMappingSelectSql(
    baseWhereSql,
    thresholdDaysParamIndex,
    outerWhereSql
  );

  const { rows } = await app.pg.query(sql, params);
  return (rows || []).map(mapMappingRow);
}

export async function countAssetMapping(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = `
    ${buildMappingCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT COUNT(*)::int AS total
    FROM coverage_enriched ce
    WHERE ${outerWhereSql}
  `;

  const { rows } = await app.pg.query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

export async function getAssetMappingSummary(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildOuterFilters(filters, [...baseParams]);

  const sql = `
    ${buildMappingCte(baseWhereSql, thresholdDaysParamIndex)}
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE ce.department IS NOT NULL)::int AS rows_with_department,
      COUNT(*) FILTER (WHERE ce.location IS NOT NULL)::int AS rows_with_location,
      COUNT(*) FILTER (WHERE ce.owner_identity IS NOT NULL)::int AS rows_with_owner,
      COUNT(*) FILTER (WHERE ce.has_linked_contract)::int AS rows_with_linked_contract,
      COUNT(*) FILTER (WHERE NOT ce.has_linked_contract)::int AS rows_without_linked_contract,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'ACTIVE')::int AS active_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'EXPIRING')::int AS expiring_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'EXPIRED')::int AS expired_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'NO_COVERAGE')::int AS no_coverage_count,
      COUNT(*) FILTER (WHERE ce.coverage_health = 'NO_END_DATE')::int AS no_end_date_count
    FROM coverage_enriched ce
    WHERE ${outerWhereSql}
  `;

  const { rows } = await app.pg.query(sql, params);
  const r = rows[0] || {};

  return {
    total_rows: toInt(r.total_rows),
    rows_with_department: toInt(r.rows_with_department),
    rows_with_location: toInt(r.rows_with_location),
    rows_with_owner: toInt(r.rows_with_owner),
    rows_with_linked_contract: toInt(r.rows_with_linked_contract),
    rows_without_linked_contract: toInt(r.rows_without_linked_contract),
    active_count: toInt(r.active_count),
    expiring_count: toInt(r.expiring_count),
    expired_count: toInt(r.expired_count),
    no_coverage_count: toInt(r.no_coverage_count),
    no_end_date_count: toInt(r.no_end_date_count),
  };
}

/* =========================
   EXPORT KHUSUS: 1 asset_id = 1 row
   ========================= */

function buildCoverageHealthSql(startExpr, endExpr, thresholdDaysParamIndex) {
  return `
    CASE
      WHEN ${startExpr} IS NULL AND ${endExpr} IS NULL THEN 'NO_COVERAGE'
      WHEN ${endExpr} IS NULL THEN 'NO_END_DATE'
      WHEN ${endExpr} < CURRENT_DATE THEN 'EXPIRED'
      WHEN ${endExpr} <= (CURRENT_DATE + ($${thresholdDaysParamIndex} * INTERVAL '1 day')) THEN 'EXPIRING'
      ELSE 'ACTIVE'
    END
  `;
}

function buildDaysToExpirySql(startExpr, endExpr) {
  return `
    CASE
      WHEN ${startExpr} IS NULL AND ${endExpr} IS NULL THEN NULL
      WHEN ${endExpr} IS NULL THEN NULL
      ELSE (${endExpr} - CURRENT_DATE)
    END
  `;
}

function buildExportOuterFiltersByAsset(filters, params) {
  const clauses = [`1=1`];
  const allNoCoverageExpr = `
    (
      ae.warranty_health = 'NO_COVERAGE'
      AND ae.support_health = 'NO_COVERAGE'
      AND ae.subscription_health = 'NO_COVERAGE'
    )
  `;

  const coverageExistsExprByKind = {
    WARRANTY: `ae.warranty_health <> 'NO_COVERAGE'`,
    SUPPORT: `ae.support_health <> 'NO_COVERAGE'`,
    SUBSCRIPTION: `ae.subscription_health <> 'NO_COVERAGE'`,
    NONE: allNoCoverageExpr,
  };

  const healthExprByKind = {
    WARRANTY: `ae.warranty_health`,
    SUPPORT: `ae.support_health`,
    SUBSCRIPTION: `ae.subscription_health`,
  };

  const daysExprByKind = {
    WARRANTY: `ae.warranty_days_to_expiry`,
    SUPPORT: `ae.support_days_to_expiry`,
    SUBSCRIPTION: `ae.subscription_days_to_expiry`,
  };

  if (filters.coverageKind) {
    clauses.push(coverageExistsExprByKind[filters.coverageKind] || `1=0`);
  }

  if (filters.health) {
    if (filters.coverageKind === "NONE") {
      if (filters.health === "NO_COVERAGE") {
        clauses.push(allNoCoverageExpr);
      } else {
        clauses.push(`1=0`);
      }
    } else if (
      filters.coverageKind === "WARRANTY" ||
      filters.coverageKind === "SUPPORT" ||
      filters.coverageKind === "SUBSCRIPTION"
    ) {
      params.push(filters.health);
      clauses.push(`${healthExprByKind[filters.coverageKind]} = $${params.length}`);
    } else {
      if (filters.health === "NO_COVERAGE") {
        clauses.push(allNoCoverageExpr);
      } else {
        params.push(filters.health);
        clauses.push(`
          (
            ae.warranty_health = $${params.length}
            OR ae.support_health = $${params.length}
            OR ae.subscription_health = $${params.length}
          )
        `);
      }
    }
  }

  if (filters.linkStatus === "LINKED") {
    clauses.push(`ae.has_linked_contract = TRUE`);
  } else if (filters.linkStatus === "NO_LINK") {
    clauses.push(`ae.has_linked_contract = FALSE`);
  }

  if (filters.expiringInDays != null) {
    params.push(filters.expiringInDays);
    const idx = params.length;

    if (filters.coverageKind === "NONE") {
      clauses.push(`1=0`);
    } else if (
      filters.coverageKind === "WARRANTY" ||
      filters.coverageKind === "SUPPORT" ||
      filters.coverageKind === "SUBSCRIPTION"
    ) {
      clauses.push(`
        ${daysExprByKind[filters.coverageKind]} IS NOT NULL
        AND ${daysExprByKind[filters.coverageKind]} BETWEEN 0 AND $${idx}
      `);
    } else {
      clauses.push(`
        (
          (ae.warranty_days_to_expiry IS NOT NULL AND ae.warranty_days_to_expiry BETWEEN 0 AND $${idx})
          OR (ae.support_days_to_expiry IS NOT NULL AND ae.support_days_to_expiry BETWEEN 0 AND $${idx})
          OR (ae.subscription_days_to_expiry IS NOT NULL AND ae.subscription_days_to_expiry BETWEEN 0 AND $${idx})
        )
      `);
    }
  }

  return { params, outerWhereSql: clauses.join(" AND ") };
}

function buildMappingExportByAssetSql(
  baseWhereSql,
  thresholdDaysParamIndex,
  outerWhereSql
) {
  const warrantyStartSql = `
    CASE
      WHEN b.asset_type_code IN ('HARDWARE', 'NETWORK')
        AND b.primary_contract_start_date IS NOT NULL
        AND b.primary_contract_end_date IS NOT NULL
      THEN b.primary_contract_start_date
      ELSE b.warranty_start_date
    END
  `;

  const warrantyEndSql = `
    CASE
      WHEN b.asset_type_code IN ('HARDWARE', 'NETWORK')
        AND b.primary_contract_start_date IS NOT NULL
        AND b.primary_contract_end_date IS NOT NULL
      THEN b.primary_contract_end_date
      ELSE b.warranty_end_date
    END
  `;

  const subscriptionStartSql = `
    CASE
      WHEN b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
        AND b.primary_contract_start_date IS NOT NULL
        AND b.primary_contract_end_date IS NOT NULL
      THEN b.primary_contract_start_date
      ELSE b.subscription_start_date
    END
  `;

  const subscriptionEndSql = `
    CASE
      WHEN b.asset_type_code IN ('SOFTWARE', 'SAAS', 'CLOUD', 'VM_CONTAINER')
        AND b.primary_contract_start_date IS NOT NULL
        AND b.primary_contract_end_date IS NOT NULL
      THEN b.primary_contract_end_date
      ELSE b.subscription_end_date
    END
  `;

  return `
    WITH primary_contract AS (
      SELECT
        ca.tenant_id,
        ca.asset_id,
        c.id AS contract_id,
        c.contract_code,
        c.contract_type,
        c.start_date,
        c.end_date,
        c.renewal_notice_days
      FROM public.contract_assets ca
      INNER JOIN public.contracts c
        ON c.tenant_id = ca.tenant_id
       AND c.id = ca.contract_id
      INNER JOIN (
        SELECT tenant_id, asset_id
        FROM public.contract_assets
        GROUP BY tenant_id, asset_id
        HAVING COUNT(DISTINCT contract_id) = 1
      ) single_contract
        ON single_contract.tenant_id = ca.tenant_id
       AND single_contract.asset_id = ca.asset_id
    ),
    base_asset AS (
      SELECT
        a.id AS asset_id,
        a.asset_tag,
        a.name,
        a.status,
        at.code AS asset_type_code,
        jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
        CASE
          WHEN ls.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', ls.code, 'label', ls.display_name)
        END AS state,
        pc.contract_code AS primary_contract_code,
        pc.contract_type AS primary_contract_type,
        pc.start_date AS primary_contract_start_date,
        pc.end_date AS primary_contract_end_date,
        CASE
          WHEN d.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', d.code, 'label', d.name)
        END AS department,
        CASE
          WHEN l.id IS NULL THEN NULL
          ELSE jsonb_build_object('code', l.code, 'label', l.name)
        END AS location,
        CASE
          WHEN i.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', i.id,
            'name', COALESCE(i.name, i.email),
            'email', i.email
          )
        END AS owner_identity,
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
      LEFT JOIN public.departments d
        ON d.tenant_id = a.tenant_id
       AND d.id = a.owner_department_id
      LEFT JOIN public.locations l
        ON l.tenant_id = a.tenant_id
       AND l.id = a.location_id
      LEFT JOIN public.identities i
        ON i.tenant_id = a.tenant_id
       AND i.id = a.current_custodian_identity_id
      LEFT JOIN primary_contract pc
        ON pc.tenant_id = a.tenant_id
       AND pc.asset_id = a.id
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
                jsonb_build_object('id', c2.id, 'code', c2.contract_code) AS obj
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
                jsonb_build_object('id', v2.id, 'name', v2.vendor_name) AS obj
              FROM public.contract_assets ca3
              JOIN public.contracts c3
                ON c3.tenant_id = ca3.tenant_id
               AND c3.id = ca3.contract_id
              LEFT JOIN public.vendors v2
                ON v2.tenant_id = c3.tenant_id
               AND v2.id = c3.vendor_id
              WHERE ca3.tenant_id = ca.tenant_id
                AND ca3.asset_id = ca.asset_id
                AND v2.id IS NOT NULL
            ) x
          ),
          '[]'::jsonb
        ) AS vendor_preview_items
      FROM public.contract_assets ca
      JOIN public.contracts c
        ON c.tenant_id = ca.tenant_id
       AND c.id = ca.contract_id
      LEFT JOIN public.vendors v
        ON v.tenant_id = c.tenant_id
       AND v.id = c.vendor_id
      JOIN base_asset b
        ON b.asset_id = ca.asset_id
      GROUP BY ca.tenant_id, ca.asset_id
    ),
    coverage_pivot AS (
      SELECT
        b.asset_id,
        b.asset_tag,
        b.name,
        b.status,
        b.asset_type,
        b.state,
        b.department,
        b.location,
        b.owner_identity,

        ${warrantyStartSql} AS warranty_start_date,
        ${warrantyEndSql} AS warranty_end_date,

        b.support_start_date AS support_start_date,
        b.support_end_date AS support_end_date,

        ${subscriptionStartSql} AS subscription_start_date,
        ${subscriptionEndSql} AS subscription_end_date,

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
      FROM base_asset b
      LEFT JOIN contract_relation_rollup rr
        ON rr.asset_id = b.asset_id
    ),
    asset_export AS (
      SELECT
        cp.*,

        ${buildCoverageHealthSql(
          "cp.warranty_start_date",
          "cp.warranty_end_date",
          thresholdDaysParamIndex
        )} AS warranty_health,
        ${buildDaysToExpirySql(
          "cp.warranty_start_date",
          "cp.warranty_end_date"
        )} AS warranty_days_to_expiry,

        ${buildCoverageHealthSql(
          "cp.support_start_date",
          "cp.support_end_date",
          thresholdDaysParamIndex
        )} AS support_health,
        ${buildDaysToExpirySql(
          "cp.support_start_date",
          "cp.support_end_date"
        )} AS support_days_to_expiry,

        ${buildCoverageHealthSql(
          "cp.subscription_start_date",
          "cp.subscription_end_date",
          thresholdDaysParamIndex
        )} AS subscription_health,
        ${buildDaysToExpirySql(
          "cp.subscription_start_date",
          "cp.subscription_end_date"
        )} AS subscription_days_to_expiry
      FROM coverage_pivot cp
    )
    SELECT
      ae.asset_id,
      ae.asset_tag,
      ae.name,
      ae.status,
      ae.asset_type,
      ae.state,
      ae.department,
      ae.location,
      ae.owner_identity,

      ae.warranty_start_date,
      ae.warranty_end_date,
      ae.warranty_health,
      ae.warranty_days_to_expiry,

      ae.support_start_date,
      ae.support_end_date,
      ae.support_health,
      ae.support_days_to_expiry,

      ae.subscription_start_date,
      ae.subscription_end_date,
      ae.subscription_health,
      ae.subscription_days_to_expiry,

      ae.has_linked_contract,
      ae.linked_contracts_count,
      ae.linked_vendors_count,
      ae.has_active_contract,
      ae.has_expiring_contract,
      ae.has_expired_contract,
      ae.has_no_end_date_contract,
      ae.contract_health_rollup,
      ae.contract_codes_preview,
      ae.vendor_names_preview,
      ae.contract_preview_items,
      ae.vendor_preview_items
    FROM asset_export ae
    WHERE ${outerWhereSql}
    ORDER BY ae.asset_id ASC
  `;
}

function mapMappingExportByAssetRow(r) {
  return {
    asset_id: toInt(r.asset_id),
    asset_tag: r.asset_tag,
    name: r.name,
    status: r.status ?? null,
    asset_type: r.asset_type ?? null,
    state: r.state ?? null,
    department: r.department ?? null,
    location: r.location ?? null,
    owner_identity: r.owner_identity ?? null,

    warranty_start_date: toDateOrNull(r.warranty_start_date),
    warranty_end_date: toDateOrNull(r.warranty_end_date),
    warranty_health: r.warranty_health ?? "NO_COVERAGE",
    warranty_days_to_expiry: toIntOrNull(r.warranty_days_to_expiry),

    support_start_date: toDateOrNull(r.support_start_date),
    support_end_date: toDateOrNull(r.support_end_date),
    support_health: r.support_health ?? "NO_COVERAGE",
    support_days_to_expiry: toIntOrNull(r.support_days_to_expiry),

    subscription_start_date: toDateOrNull(r.subscription_start_date),
    subscription_end_date: toDateOrNull(r.subscription_end_date),
    subscription_health: r.subscription_health ?? "NO_COVERAGE",
    subscription_days_to_expiry: toIntOrNull(r.subscription_days_to_expiry),

    has_linked_contract: Boolean(r.has_linked_contract),
    linked_contracts_count: toInt(r.linked_contracts_count),
    linked_vendors_count: toInt(r.linked_vendors_count),
    has_active_contract: Boolean(r.has_active_contract),
    has_expiring_contract: Boolean(r.has_expiring_contract),
    has_expired_contract: Boolean(r.has_expired_contract),
    has_no_end_date_contract: Boolean(r.has_no_end_date_contract),
    contract_health_rollup: r.contract_health_rollup ?? "NO_LINK",
    contract_codes_preview: toStringArray(r.contract_codes_preview),
    vendor_names_preview: toStringArray(r.vendor_names_preview),
    contract_preview_items: toContractPreviewItems(r.contract_preview_items),
    vendor_preview_items: toVendorPreviewItems(r.vendor_preview_items),
  };
}

export async function listAllAssetMappingExportByAsset(app, filters) {
  const { params: baseParams, baseWhereSql } = buildBaseFilters(filters);

  const thresholdDays =
    Number.isInteger(filters.expiringInDays) && filters.expiringInDays > 0
      ? filters.expiringInDays
      : 30;

  baseParams.push(thresholdDays);
  const thresholdDaysParamIndex = baseParams.length;

  const { params, outerWhereSql } = buildExportOuterFiltersByAsset(
    filters,
    [...baseParams]
  );

  const sql = buildMappingExportByAssetSql(
    baseWhereSql,
    thresholdDaysParamIndex,
    outerWhereSql
  );

  const { rows } = await app.pg.query(sql, params);
  return (rows || []).map(mapMappingExportByAssetRow);
}
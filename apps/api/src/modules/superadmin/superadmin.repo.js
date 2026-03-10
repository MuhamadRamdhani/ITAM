const ROLE_SEEDS = [
  { code: "SUPERADMIN", display_name: "Superadmin" },
  { code: "TENANT_ADMIN", display_name: "Tenant Admin" },
  { code: "ITAM_MANAGER", display_name: "ITAM Manager" },
  { code: "PROCUREMENT_CONTRACT_MANAGER", display_name: "Procurement/Contract Manager" },
  { code: "SECURITY_OFFICER", display_name: "Security Officer" },
  { code: "ASSET_CUSTODIAN", display_name: "Asset Custodian" },
  { code: "SERVICE_DESK_OPERATOR", display_name: "Service Desk Operator" },
  { code: "AUDITOR", display_name: "Auditor" },
  { code: "INTEGRATION_USER", display_name: "Integration User" },
];

export async function getTenantById(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, code, name, status_code, plan_code, created_at, updated_at
    FROM public.tenants
    WHERE id = $1
    LIMIT 1
    `,
    [tenantId]
  );
  return rows[0] || null;
}

export async function getTenantByCode(app, code) {
  const { rows } = await app.pg.query(
    `
    SELECT id, code, name, status_code, plan_code, created_at, updated_at
    FROM public.tenants
    WHERE code = $1
    LIMIT 1
    `,
    [code]
  );
  return rows[0] || null;
}

export async function listTenants(app, { q, statusCode, page, pageSize }) {
  const off = (page - 1) * pageSize;

  const params = [];
  const where = [];

  let idx = 1;

  if (q) {
    params.push(`%${q}%`);
    where.push(`(t.name ILIKE $${idx} OR t.code ILIKE $${idx})`);
    idx += 1;
  }

  if (statusCode) {
    params.push(statusCode);
    where.push(`t.status_code = $${idx}`);
    idx += 1;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  params.push(pageSize);
  const limitIdx = idx;
  idx += 1;

  params.push(off);
  const offsetIdx = idx;

  const sql = `
    SELECT
      t.id,
      t.code,
      t.name,
      t.status_code,
      t.plan_code,
      t.created_at,
      t.updated_at
    FROM public.tenants t
    ${whereSql}
    ORDER BY t.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countParams = [];
  const countWhere = [];
  let cidx = 1;

  if (q) {
    countParams.push(`%${q}%`);
    countWhere.push(`(t.name ILIKE $${cidx} OR t.code ILIKE $${cidx})`);
    cidx += 1;
  }

  if (statusCode) {
    countParams.push(statusCode);
    countWhere.push(`t.status_code = $${cidx}`);
  }

  const countWhereSql =
    countWhere.length > 0 ? `WHERE ${countWhere.join(" AND ")}` : "";

  const countSql = `
    SELECT count(*)::int AS c
    FROM public.tenants t
    ${countWhereSql}
  `;

  const { rows: crows } = await app.pg.query(countSql, countParams);
  const total = Number(crows?.[0]?.c ?? 0);

  return { items, total };
}

export async function insertTenant(app, { code, name, statusCode, planCode }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.tenants
      (code, name, status_code, plan_code)
    VALUES
      ($1, $2, $3, $4)
    RETURNING id
    `,
    [code, name, statusCode, planCode]
  );
  return Number(rows[0].id);
}

export async function updateTenant(app, tenantId, patch) {
  const sets = [];
  const params = [];
  let idx = 1;

  if (patch.name != null) {
    sets.push(`name = $${idx}`);
    params.push(patch.name);
    idx += 1;
  }

  if (patch.statusCode != null) {
    sets.push(`status_code = $${idx}`);
    params.push(patch.statusCode);
    idx += 1;
  }

  if (patch.planCode != null) {
    sets.push(`plan_code = $${idx}`);
    params.push(patch.planCode);
    idx += 1;
  }

  sets.push(`updated_at = now()`);

  if (sets.length === 1) {
    return 0;
  }

  params.push(tenantId);

  const { rowCount } = await app.pg.query(
    `
    UPDATE public.tenants
    SET ${sets.join(", ")}
    WHERE id = $${idx}
    `,
    params
  );

  return rowCount;
}

export async function seedTenantUiSettings(app, tenantId) {
  await app.pg.query(
    `
    INSERT INTO public.tenant_settings (tenant_id, setting_key, value_json)
    SELECT $1, 'ui.page_size.options', $2::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tenant_settings
      WHERE tenant_id = $1
        AND setting_key = 'ui.page_size.options'
    )
    `,
    [tenantId, JSON.stringify([10, 25, 50, 100])]
  );

  await app.pg.query(
    `
    INSERT INTO public.tenant_settings (tenant_id, setting_key, value_json)
    SELECT $1, 'ui.documents.page_size.default', $2::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tenant_settings
      WHERE tenant_id = $1
        AND setting_key = 'ui.documents.page_size.default'
    )
    `,
    [tenantId, JSON.stringify(50)]
  );
}

export async function seedTenantRoles(app, tenantId) {
  for (const role of ROLE_SEEDS) {
    await app.pg.query(
      `
      INSERT INTO public.roles (tenant_id, code, display_name, is_system)
      SELECT $1, $2, $3, true
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.roles
        WHERE tenant_id = $1
          AND code = $2
      )
      `,
      [tenantId, role.code, role.display_name]
    );
  }
}

export async function countUsersByTenant(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.users
    WHERE tenant_id = $1
    `,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countAssetsByTenant(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.assets
    WHERE tenant_id = $1
    `,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countDocumentsByTenant(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.documents
    WHERE tenant_id = $1
    `,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}

export async function countPendingApprovalsByTenant(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.approvals
    WHERE tenant_id = $1
      AND status_code = 'PENDING'
    `,
    [tenantId]
  );
  return Number(rows?.[0]?.c ?? 0);
}
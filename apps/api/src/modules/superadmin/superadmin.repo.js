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

const ASSET_TYPE_SEEDS = [
  { code: "SAAS", display_name: "Langganan SaaS", active: true },
  { code: "NETWORK", display_name: "Jaringan / Peripheral", active: true },
  { code: "CLOUD", display_name: "Sumber Daya Cloud", active: true },
  { code: "VM_CONTAINER", display_name: "VM / Container", active: true },
  { code: "HARDWARE", display_name: "Perangkat Keras", active: true },
  { code: "SOFTWARE", display_name: "Perangkat Lunak", active: true },
];

function buildTenantWhere({ q, statusCode, contractHealth }, alias = "t") {
  const params = [];
  const where = [];
  let idx = 1;

  if (q) {
    params.push(`%${q}%`);
    where.push(`(${alias}.name ILIKE $${idx} OR ${alias}.code ILIKE $${idx})`);
    idx += 1;
  }

  if (statusCode) {
    params.push(statusCode);
    where.push(`${alias}.status_code = $${idx}`);
    idx += 1;
  }

  if (contractHealth === "NO_CONTRACT") {
    where.push(`${alias}.contract_end_date IS NULL`);
  } else if (contractHealth === "ACTIVE") {
    where.push(
      `${alias}.contract_end_date IS NOT NULL AND ${alias}.contract_end_date > CURRENT_DATE + 30`
    );
  } else if (contractHealth === "EXPIRING") {
    where.push(
      `${alias}.contract_end_date IS NOT NULL AND ${alias}.contract_end_date >= CURRENT_DATE AND ${alias}.contract_end_date <= CURRENT_DATE + 30`
    );
  } else if (contractHealth === "EXPIRED") {
    where.push(
      `${alias}.contract_end_date IS NOT NULL AND ${alias}.contract_end_date < CURRENT_DATE`
    );
  }

  return {
    params,
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    nextIdx: idx,
  };
}

function buildTenantOrderClause(sortBy, sortDir) {
  const dir = String(sortDir || "").toUpperCase() === "DESC" ? "DESC" : "ASC";
  const sort = String(sortBy || "").toUpperCase();

  if (sort === "NAME") {
    return `ORDER BY t.name ${dir}, t.id DESC`;
  }

  if (sort === "CREATED_AT") {
    return `ORDER BY t.created_at ${dir}, t.id DESC`;
  }

  if (sort === "CONTRACT_END_DATE") {
    return `ORDER BY t.contract_end_date ${dir} NULLS LAST, t.id DESC`;
  }

  return `ORDER BY t.id ${dir}`;
}

async function loadPlatformLifecycleStateTemplates(app) {
  const { rows } = await app.pg.query(
    `
    SELECT
      code,
      display_name,
      sort_order,
      is_enabled
    FROM public.platform_lifecycle_state_templates
    WHERE COALESCE(is_enabled, true) = true
    ORDER BY sort_order ASC, id ASC
    `
  );

  return rows;
}

async function loadPlatformLifecycleTransitionTemplates(app) {
  const { rows } = await app.pg.query(
    `
    SELECT
      from_state_code,
      to_state_code,
      is_enabled,
      require_approval,
      require_evidence,
      gate_rules,
      sort_order
    FROM public.platform_lifecycle_transition_templates
    WHERE COALESCE(is_enabled, true) = true
    ORDER BY sort_order ASC, id ASC
    `
  );

  return rows;
}

async function getLifecycleStateCodeMap(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, code
    FROM public.lifecycle_states
    WHERE tenant_id = $1
    `,
    [tenantId]
  );

  const out = new Map();
  for (const row of rows) {
    out.set(String(row.code), Number(row.id));
  }
  return out;
}

export async function getTenantById(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      code,
      name,
      status_code,
      plan_code,
      contract_start_date::text AS contract_start_date,
      contract_end_date::text AS contract_end_date,
      subscription_notes,
      created_at,
      updated_at
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
    SELECT
      id,
      code,
      name,
      status_code,
      plan_code,
      contract_start_date::text AS contract_start_date,
      contract_end_date::text AS contract_end_date,
      subscription_notes,
      created_at,
      updated_at
    FROM public.tenants
    WHERE code = $1
    LIMIT 1
    `,
    [code]
  );
  return rows[0] || null;
}

export async function listTenants(
  app,
  { q, statusCode, contractHealth, sortBy, sortDir, page, pageSize }
) {
  const off = (page - 1) * pageSize;
  const built = buildTenantWhere({ q, statusCode, contractHealth }, "t");
  const params = [...built.params];

  params.push(pageSize);
  const limitIdx = built.nextIdx;

  params.push(off);
  const offsetIdx = built.nextIdx + 1;

  const orderSql = buildTenantOrderClause(sortBy, sortDir);

  const sql = `
    SELECT
      t.id,
      t.code,
      t.name,
      t.status_code,
      t.plan_code,
      t.contract_start_date::text AS contract_start_date,
      t.contract_end_date::text AS contract_end_date,
      t.subscription_notes,
      CASE
        WHEN t.contract_end_date IS NULL THEN 'NO_CONTRACT'
        WHEN t.contract_end_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN t.contract_end_date <= CURRENT_DATE + 30 THEN 'EXPIRING'
        ELSE 'ACTIVE'
      END AS contract_health,
      CASE
        WHEN t.contract_end_date IS NULL THEN NULL
        WHEN CURRENT_DATE <= t.contract_end_date THEN (t.contract_end_date - CURRENT_DATE)::int
        ELSE NULL
      END AS days_to_expiry,
      t.created_at,
      t.updated_at
    FROM public.tenants t
    ${built.whereSql}
    ${orderSql}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countBuilt = buildTenantWhere({ q, statusCode, contractHealth }, "t");
  const countSql = `
    SELECT count(*)::int AS c
    FROM public.tenants t
    ${countBuilt.whereSql}
  `;
  const { rows: crows } = await app.pg.query(countSql, countBuilt.params);
  const total = Number(crows?.[0]?.c ?? 0);

  return { items, total };
}

export async function getTenantSubscriptionSummary(app, { q, statusCode }) {
  const built = buildTenantWhere({ q, statusCode, contractHealth: null }, "t");

  const sql = `
    SELECT
      count(*)::int AS total,
      COALESCE(sum(CASE WHEN t.contract_end_date IS NULL THEN 1 ELSE 0 END), 0)::int AS no_contract,
      COALESCE(sum(CASE WHEN t.contract_end_date IS NOT NULL AND t.contract_end_date > CURRENT_DATE + 30 THEN 1 ELSE 0 END), 0)::int AS active,
      COALESCE(sum(CASE WHEN t.contract_end_date IS NOT NULL AND t.contract_end_date >= CURRENT_DATE AND t.contract_end_date <= CURRENT_DATE + 30 THEN 1 ELSE 0 END), 0)::int AS expiring,
      COALESCE(sum(CASE WHEN t.contract_end_date IS NOT NULL AND t.contract_end_date < CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS expired
    FROM public.tenants t
    ${built.whereSql}
  `;

  const { rows } = await app.pg.query(sql, built.params);
  const row = rows?.[0] || {};

  return {
    total: Number(row.total ?? 0),
    no_contract: Number(row.no_contract ?? 0),
    active: Number(row.active ?? 0),
    expiring: Number(row.expiring ?? 0),
    expired: Number(row.expired ?? 0),
  };
}

export async function insertTenant(
  app,
  {
    code,
    name,
    statusCode,
    planCode,
    contractStartDate,
    contractEndDate,
    subscriptionNotes,
  }
) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.tenants
      (
        code,
        name,
        status_code,
        plan_code,
        contract_start_date,
        contract_end_date,
        subscription_notes
      )
    VALUES
      ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [
      code,
      name,
      statusCode,
      planCode,
      contractStartDate,
      contractEndDate,
      subscriptionNotes,
    ]
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

  if (Object.prototype.hasOwnProperty.call(patch, "contractStartDate")) {
    sets.push(`contract_start_date = $${idx}`);
    params.push(patch.contractStartDate);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "contractEndDate")) {
    sets.push(`contract_end_date = $${idx}`);
    params.push(patch.contractEndDate);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "subscriptionNotes")) {
    sets.push(`subscription_notes = $${idx}`);
    params.push(patch.subscriptionNotes);
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

export async function seedTenantAssetTypes(app, tenantId) {
  for (const item of ASSET_TYPE_SEEDS) {
    await app.pg.query(
      `
      INSERT INTO public.asset_types (tenant_id, code, display_name, active)
      SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.asset_types
        WHERE tenant_id = $1
          AND code = $2
      )
      `,
      [tenantId, item.code, item.display_name, item.active]
    );
  }
}

export async function seedTenantLifecycleStates(app, tenantId) {
  const seeds = await loadPlatformLifecycleStateTemplates(app);

  for (const item of seeds) {
    await app.pg.query(
      `
      INSERT INTO public.lifecycle_states (tenant_id, code, display_name, sort_order)
      SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.lifecycle_states
        WHERE tenant_id = $1
          AND code = $2
      )
      `,
      [tenantId, item.code, item.display_name, item.sort_order]
    );

    await app.pg.query(
      `
      UPDATE public.lifecycle_states
      SET
        display_name = $3,
        sort_order = $4
      WHERE tenant_id = $1
        AND code = $2
      `,
      [tenantId, item.code, item.display_name, item.sort_order]
    );
  }
}

export async function seedTenantLifecycleTransitions(app, tenantId) {
  const seeds = await loadPlatformLifecycleTransitionTemplates(app);
  const stateCodeMap = await getLifecycleStateCodeMap(app, tenantId);

  for (const item of seeds) {
    const fromStateId = Number(stateCodeMap.get(String(item.from_state_code)) || 0);
    const toStateId = Number(stateCodeMap.get(String(item.to_state_code)) || 0);

    if (!fromStateId || !toStateId) {
      continue;
    }

    const isEnabled =
      item.is_enabled == null ? true : Boolean(item.is_enabled);

    const requireApproval = Boolean(item.require_approval);
    const requireEvidence = Boolean(item.require_evidence);
    const gateRulesJson = JSON.stringify(item.gate_rules || {});
    const sortOrder = Number(item.sort_order || 0);

    await app.pg.query(
      `
      INSERT INTO public.lifecycle_transitions
        (
          tenant_id,
          from_state_id,
          to_state_id,
          is_enabled,
          require_approval,
          require_evidence,
          gate_rules,
          sort_order
        )
      SELECT
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.lifecycle_transitions
        WHERE tenant_id = $1
          AND from_state_id = $2
          AND to_state_id = $3
      )
      `,
      [
        tenantId,
        fromStateId,
        toStateId,
        isEnabled,
        requireApproval,
        requireEvidence,
        gateRulesJson,
        sortOrder,
      ]
    );

    await app.pg.query(
      `
      UPDATE public.lifecycle_transitions
      SET
        is_enabled = $4,
        require_approval = $5,
        require_evidence = $6,
        gate_rules = $7::jsonb,
        sort_order = $8
      WHERE tenant_id = $1
        AND from_state_id = $2
        AND to_state_id = $3
      `,
      [
        tenantId,
        fromStateId,
        toStateId,
        isEnabled,
        requireApproval,
        requireEvidence,
        gateRulesJson,
        sortOrder,
      ]
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
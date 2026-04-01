export async function getAssetForTransferById(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      a.id,
      a.tenant_id,
      a.asset_tag,
      a.name,
      a.asset_type_id,
      a.current_state_id,
      a.status,
      a.location_id,
      a.owner_department_id,
      a.current_custodian_identity_id,
      a.created_at,
      a.updated_at
    FROM public.assets a
    WHERE a.tenant_id = $1
      AND a.id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
  );

  return rows[0] || null;
}

export async function getTenantBasicById(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      t.id,
      t.name,
      t.code,
      t.status_code,
      t.plan_code,
      t.contract_start_date,
      t.contract_end_date,
      t.subscription_notes
    FROM public.tenants t
    WHERE t.id = $1
    LIMIT 1
    `,
    [tenantId]
  );

  return rows[0] || null;
}

export async function countContractAssetLinksByAsset(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT COUNT(1)::int AS total
    FROM public.contract_assets ca
    WHERE ca.tenant_id = $1
      AND ca.asset_id = $2
    `,
    [tenantId, assetId]
  );

  return Number(rows[0]?.total ?? 0);
}

export async function findActiveTransferRequestByAsset(
  app,
  tenantId,
  assetId,
  excludeRequestId = null
) {
  const values = [tenantId, assetId];
  let sql = `
    SELECT
      r.id,
      r.tenant_id,
      r.asset_id,
      r.target_tenant_id,
      r.request_code,
      r.status,
      r.reason,
      r.requested_by_user_id,
      r.requested_by_identity_id,
      r.submitted_at,
      r.decided_at,
      r.decided_by_user_id,
      r.decided_by_identity_id,
      r.decision_note,
      r.executed_at,
      r.execution_result_json,
      r.created_at,
      r.updated_at
    FROM public.asset_transfer_requests r
    WHERE r.tenant_id = $1
      AND r.asset_id = $2
      AND r.status IN ('DRAFT', 'SUBMITTED', 'APPROVED')
  `;

  if (excludeRequestId != null) {
    values.push(excludeRequestId);
    sql += ` AND r.id <> $${values.length}`;
  }

  sql += `
    ORDER BY r.id DESC
    LIMIT 1
  `;

  const { rows } = await app.pg.query(sql, values);
  return rows[0] || null;
}

export async function insertAssetTransferRequest(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.asset_transfer_requests (
      tenant_id,
      asset_id,
      target_tenant_id,
      request_code,
      status,
      reason,
      requested_by_user_id,
      requested_by_identity_id,
      submitted_at,
      decided_at,
      decided_by_user_id,
      decided_by_identity_id,
      decision_note,
      executed_at,
      execution_result_json
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15::jsonb
    )
    RETURNING id
    `,
    [
      payload.tenant_id,
      payload.asset_id,
      payload.target_tenant_id,
      payload.request_code,
      payload.status,
      payload.reason ?? null,
      payload.requested_by_user_id ?? null,
      payload.requested_by_identity_id ?? null,
      payload.submitted_at ?? null,
      payload.decided_at ?? null,
      payload.decided_by_user_id ?? null,
      payload.decided_by_identity_id ?? null,
      payload.decision_note ?? null,
      payload.executed_at ?? null,
      JSON.stringify(payload.execution_result_json ?? {}),
    ]
  );

  return rows[0] || null;
}

export async function updateAssetTransferRequest(app, tenantId, requestId, patch) {
  const allowed = new Set([
    "status",
    "reason",
    "submitted_at",
    "decided_at",
    "decided_by_user_id",
    "decided_by_identity_id",
    "decision_note",
    "executed_at",
    "execution_result_json",
  ]);

  const keys = Object.keys(patch).filter((key) => allowed.has(key));
  if (keys.length === 0) return false;

  const values = [];
  const sets = [];

  for (const key of keys) {
    values.push(
      key === "execution_result_json"
        ? JSON.stringify(patch[key] ?? {})
        : patch[key]
    );

    if (key === "execution_result_json") {
      sets.push(`${key} = $${values.length}::jsonb`);
    } else {
      sets.push(`${key} = $${values.length}`);
    }
  }

  values.push(tenantId);
  values.push(requestId);

  const { rowCount } = await app.pg.query(
    `
    UPDATE public.asset_transfer_requests
    SET ${sets.join(", ")}
    WHERE tenant_id = $${values.length - 1}
      AND id = $${values.length}
    `,
    values
  );

  return rowCount > 0;
}

export async function getAssetTransferRequestById(app, tenantId, requestId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      r.id,
      r.tenant_id,
      r.asset_id,
      r.target_tenant_id,
      r.request_code,
      r.status,
      r.reason,
      r.requested_by_user_id,
      r.requested_by_identity_id,
      r.submitted_at,
      r.decided_at,
      r.decided_by_user_id,
      r.decided_by_identity_id,
      r.decision_note,
      r.executed_at,
      r.execution_result_json,
      r.created_at,
      r.updated_at,

      a.asset_tag,
      a.name AS asset_name,
      a.status AS asset_status,
      a.tenant_id AS current_asset_tenant_id,

      tt.name AS target_tenant_name,
      tt.status_code AS target_tenant_status
    FROM public.asset_transfer_requests r
    LEFT JOIN public.assets a
      ON a.id = r.asset_id
    LEFT JOIN public.tenants tt
      ON tt.id = r.target_tenant_id
    WHERE r.tenant_id = $1
      AND r.id = $2
    LIMIT 1
    `,
    [tenantId, requestId]
  );

  return rows[0] || null;
}

export async function listAssetTransferRequests(app, filters) {
  const values = [];
  const where = [];

  values.push(filters.tenantId);
  where.push(`r.tenant_id = $${values.length}`);

  if (filters.status) {
    values.push(filters.status);
    where.push(`r.status = $${values.length}`);
  }

  if (filters.assetId != null) {
    values.push(filters.assetId);
    where.push(`r.asset_id = $${values.length}`);
  }

  if (filters.targetTenantId != null) {
    values.push(filters.targetTenantId);
    where.push(`r.target_tenant_id = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(
      r.request_code ILIKE $${values.length}
      OR a.asset_tag ILIKE $${values.length}
      OR a.name ILIKE $${values.length}
      OR tt.name ILIKE $${values.length}
    )`);
  }

  values.push(filters.limit);
  const limitPos = values.length;

  values.push(filters.offset);
  const offsetPos = values.length;

  const sql = `
    SELECT
      r.id,
      r.tenant_id,
      r.asset_id,
      r.target_tenant_id,
      r.request_code,
      r.status,
      r.reason,
      r.requested_by_user_id,
      r.requested_by_identity_id,
      r.submitted_at,
      r.decided_at,
      r.decided_by_user_id,
      r.decided_by_identity_id,
      r.decision_note,
      r.executed_at,
      r.execution_result_json,
      r.created_at,
      r.updated_at,

      a.asset_tag,
      a.name AS asset_name,
      a.status AS asset_status,
      a.tenant_id AS current_asset_tenant_id,

      tt.name AS target_tenant_name,
      tt.status_code AS target_tenant_status
    FROM public.asset_transfer_requests r
    LEFT JOIN public.assets a
      ON a.id = r.asset_id
    LEFT JOIN public.tenants tt
      ON tt.id = r.target_tenant_id
    WHERE ${where.join(" AND ")}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT $${limitPos}
    OFFSET $${offsetPos}
  `;

  const { rows } = await app.pg.query(sql, values);
  return rows;
}

export async function countAssetTransferRequests(app, filters) {
  const values = [];
  const where = [];

  values.push(filters.tenantId);
  where.push(`r.tenant_id = $${values.length}`);

  if (filters.status) {
    values.push(filters.status);
    where.push(`r.status = $${values.length}`);
  }

  if (filters.assetId != null) {
    values.push(filters.assetId);
    where.push(`r.asset_id = $${values.length}`);
  }

  if (filters.targetTenantId != null) {
    values.push(filters.targetTenantId);
    where.push(`r.target_tenant_id = $${values.length}`);
  }

  if (filters.search) {
    values.push(`%${filters.search}%`);
    where.push(`(
      r.request_code ILIKE $${values.length}
      OR a.asset_tag ILIKE $${values.length}
      OR a.name ILIKE $${values.length}
      OR tt.name ILIKE $${values.length}
    )`);
  }

  const { rows } = await app.pg.query(
    `
    SELECT COUNT(1)::int AS total
    FROM public.asset_transfer_requests r
    LEFT JOIN public.assets a
      ON a.id = r.asset_id
    LEFT JOIN public.tenants tt
      ON tt.id = r.target_tenant_id
    WHERE ${where.join(" AND ")}
    `,
    values
  );

  return Number(rows[0]?.total ?? 0);
}

export async function insertAssetTransferEvent(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.asset_transfer_events (
      tenant_id,
      transfer_request_id,
      event_type,
      event_payload_json,
      created_by_user_id,
      created_by_identity_id
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    RETURNING id
    `,
    [
      payload.tenant_id,
      payload.transfer_request_id,
      payload.event_type,
      JSON.stringify(payload.event_payload_json ?? {}),
      payload.created_by_user_id ?? null,
      payload.created_by_identity_id ?? null,
    ]
  );

  return rows[0] || null;
}

export async function getAssetTransferEventsByRequestId(app, tenantId, requestId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      e.id,
      e.tenant_id,
      e.transfer_request_id,
      e.event_type,
      e.event_payload_json,
      e.created_by_user_id,
      e.created_by_identity_id,
      e.created_at
    FROM public.asset_transfer_events e
    WHERE e.tenant_id = $1
      AND e.transfer_request_id = $2
    ORDER BY e.created_at ASC, e.id ASC
    `,
    [tenantId, requestId]
  );

  return rows;
}

export async function deleteContractAssetLinksByAsset(app, tenantId, assetId) {
  const { rowCount } = await app.pg.query(
    `
    DELETE FROM public.contract_assets
    WHERE tenant_id = $1
      AND asset_id = $2
    `,
    [tenantId, assetId]
  );

  return Number(rowCount ?? 0);
}

export async function updateAssetTenantForTransfer(
  app,
  sourceTenantId,
  assetId,
  targetTenantId
) {
  const { rows } = await app.pg.query(
    `
    UPDATE public.assets
    SET
      tenant_id = $3,
      owner_department_id = NULL,
      current_custodian_identity_id = NULL,
      location_id = NULL
    WHERE tenant_id = $1
      AND id = $2
    RETURNING
      id,
      tenant_id,
      asset_tag,
      name,
      owner_department_id,
      current_custodian_identity_id,
      location_id,
      updated_at
    `,
    [sourceTenantId, assetId, targetTenantId]
  );

  return rows[0] || null;
}

export async function listTargetTenantOptions(app, { sourceTenantId, q = "", limit = 50 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const trimmedQ = String(q || "").trim();

  const params = [sourceTenantId];
  let whereSql = `
    t.status_code = 'ACTIVE'
    AND t.id <> $1
  `;

  if (trimmedQ) {
    params.push(`%${trimmedQ}%`);
    whereSql += ` AND t.name ILIKE $${params.length}`;
  }

  params.push(safeLimit);

  const sql = `
    SELECT
      t.id,
      t.name,
      t.code,
      t.status_code,
      t.contract_start_date,
      t.contract_end_date
    FROM public.tenants t
    WHERE ${whereSql}
    ORDER BY t.name ASC
    LIMIT $${params.length}
  `;

  const { rows } = await app.pg.query(sql, params);

  return rows.map((row) => ({
    id: Number(row.id),
    tenant_name: row.name,
    tenant_code: row.code,
    status: row.status_code,
    contract_start_date: row.contract_start_date,
    contract_end_date: row.contract_end_date,
  }));
}
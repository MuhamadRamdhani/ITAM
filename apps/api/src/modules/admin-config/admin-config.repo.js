export async function listAssetTypesAdmin(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, display_name, active
    FROM public.asset_types
    WHERE tenant_id = $1
    ORDER BY id ASC
    `,
    [tenantId]
  );
  return rows;
}

export async function getAssetTypeByIdAdmin(app, tenantId, id) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, display_name, active
    FROM public.asset_types
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, id]
  );
  return rows[0] || null;
}

export async function updateAssetTypeDisplayName(app, tenantId, id, displayName) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.asset_types
    SET display_name = $3
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, id, displayName]
  );
  return rowCount;
}

export async function listLifecycleStatesAdmin(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, display_name, sort_order
    FROM public.lifecycle_states
    WHERE tenant_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [tenantId]
  );
  return rows;
}

export async function getLifecycleStateByIdAdmin(app, tenantId, id) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, display_name, sort_order
    FROM public.lifecycle_states
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, id]
  );
  return rows[0] || null;
}

export async function updateLifecycleStateDisplayName(app, tenantId, id, displayName) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.lifecycle_states
    SET display_name = $3
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, id, displayName]
  );
  return rowCount;
}
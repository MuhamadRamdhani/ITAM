function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

export async function countAssets(app, tenantId, filters) {
  const { whereSql, params } = buildWhere(tenantId, filters);

  const res = await app.pg.query(
    `
    SELECT COUNT(*)::int AS total
    FROM public.assets a
    JOIN public.asset_types at ON at.id = a.asset_type_id
    LEFT JOIN public.lifecycle_states ls ON ls.id = a.current_state_id
    WHERE ${whereSql}
    `,
    params
  );

  return res.rows[0]?.total ?? 0;
}

export async function listAssets(app, tenantId, filters, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildWhere(tenantId, filters);

  params.push(pageSize, offset);

  const { rows } = await app.pg.query(
    `
    SELECT
      a.id,
      a.asset_tag,
      a.name,
      jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
      jsonb_build_object('code', ls.code, 'label', ls.display_name) AS state
    FROM public.assets a
    JOIN public.asset_types at ON at.id = a.asset_type_id
    LEFT JOIN public.lifecycle_states ls ON ls.id = a.current_state_id
    WHERE ${whereSql}
    ORDER BY a.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return (rows || []).map((r) => ({
    id: toInt(r.id),
    asset_tag: r.asset_tag,
    name: r.name,
    asset_type: r.asset_type,
    state: r.state,
  }));
}

export async function getAssetById(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      a.id,
      a.asset_tag,
      a.name,
      a.status,
      jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
      jsonb_build_object('code', ls.code, 'label', ls.display_name) AS state,
      a.owner_department_id,
      a.current_custodian_identity_id,
      a.location_id,

      a.purchase_date,
      a.warranty_start_date,
      a.warranty_end_date,
      a.support_start_date,
      a.support_end_date,
      a.subscription_start_date,
      a.subscription_end_date
    FROM public.assets a
    JOIN public.asset_types at ON at.id = a.asset_type_id
    LEFT JOIN public.lifecycle_states ls ON ls.id = a.current_state_id
    WHERE a.tenant_id = $1 AND a.id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
  );

  const r = rows[0];
  if (!r) return null;

  return {
    id: toInt(r.id),
    asset_tag: r.asset_tag,
    name: r.name,
    status: r.status ?? null,
    asset_type: r.asset_type,
    state: r.state,
    owner_department_id: toIntOrNull(r.owner_department_id),
    current_custodian_identity_id: toIntOrNull(r.current_custodian_identity_id),
    location_id: toIntOrNull(r.location_id),

    purchase_date: toDateOrNull(r.purchase_date),
    warranty_start_date: toDateOrNull(r.warranty_start_date),
    warranty_end_date: toDateOrNull(r.warranty_end_date),
    support_start_date: toDateOrNull(r.support_start_date),
    support_end_date: toDateOrNull(r.support_end_date),
    subscription_start_date: toDateOrNull(r.subscription_start_date),
    subscription_end_date: toDateOrNull(r.subscription_end_date),
  };
}

export async function insertAsset(app, row) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.assets
      (
        tenant_id,
        asset_tag,
        name,
        status,
        asset_type_id,
        current_state_id,
        owner_department_id,
        current_custodian_identity_id,
        location_id,
        purchase_date,
        warranty_start_date,
        warranty_end_date,
        support_start_date,
        support_end_date,
        subscription_start_date,
        subscription_end_date
      )
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING id
    `,
    [
      row.tenant_id,
      row.asset_tag,
      row.name,
      row.status ?? null,
      row.asset_type_id,
      row.current_state_id,
      row.owner_department_id ?? null,
      row.current_custodian_identity_id ?? null,
      row.location_id ?? null,
      row.purchase_date ?? null,
      row.warranty_start_date ?? null,
      row.warranty_end_date ?? null,
      row.support_start_date ?? null,
      row.support_end_date ?? null,
      row.subscription_start_date ?? null,
      row.subscription_end_date ?? null,
    ]
  );

  return toInt(rows[0].id);
}

export async function updateAsset(app, tenantId, assetId, patch) {
  const sets = [];
  const params = [tenantId, assetId];
  let i = params.length;

  for (const [k, v] of Object.entries(patch)) {
    i += 1;
    sets.push(`${k} = $${i}`);
    params.push(v);
  }

  if (sets.length === 0) return null;

  const { rows } = await app.pg.query(
    `
    UPDATE public.assets
    SET ${sets.join(", ")}, updated_at = NOW()
    WHERE tenant_id = $1 AND id = $2
    RETURNING id
    `,
    params
  );

  return rows[0]?.id != null ? toInt(rows[0].id) : null;
}

function buildWhere(tenantId, filters) {
  const params = [tenantId];
  let whereSql = `a.tenant_id = $1`;

  if (filters.q) {
    params.push(`%${filters.q}%`);
    whereSql += ` AND (a.asset_tag ILIKE $${params.length} OR a.name ILIKE $${params.length})`;
  }
  if (filters.type_code) {
    params.push(filters.type_code);
    whereSql += ` AND at.code = $${params.length}`;
  }
  if (filters.state_code) {
    params.push(filters.state_code);
    whereSql += ` AND ls.code = $${params.length}`;
  }

  return { whereSql, params };
}
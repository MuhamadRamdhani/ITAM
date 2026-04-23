export async function getLocationById(app, tenantId, locationId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, name
    FROM public.locations
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, locationId]
  );
  return rows[0] || null;
}

export async function getLocationByIdForDelete(app, tenantId, locationId) {
  return await getLocationById(app, tenantId, locationId);
}

export async function locationCodeExists(app, tenantId, code, excludeId = null) {
  if (!code) return false;

  const params = [tenantId, code];
  let sql = `
    SELECT 1
    FROM public.locations
    WHERE tenant_id = $1
      AND lower(code) = lower($2)
  `;

  if (excludeId != null) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }

  sql += ` LIMIT 1`;

  const { rowCount } = await app.pg.query(sql, params);
  return rowCount > 0;
}

export async function listLocations(app, tenantId, q, page, pageSize) {
  const off = (page - 1) * pageSize;
  const like = q ? `%${q}%` : null;

  const whereQ = q ? `AND (l.name ILIKE $2 OR l.code ILIKE $2)` : "";
  const params = q
    ? [tenantId, like, pageSize, off]
    : [tenantId, pageSize, off];

  const sql = `
    SELECT
      l.id,
      l.tenant_id,
      l.code,
      l.name
    FROM public.locations l
    WHERE l.tenant_id = $1
    ${whereQ}
    ORDER BY l.id ASC
    LIMIT $${q ? 3 : 2} OFFSET $${q ? 4 : 3}
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countSql = `
    SELECT count(*)::int AS c
    FROM public.locations l
    WHERE l.tenant_id = $1
    ${whereQ}
  `;
  const countParams = q ? [tenantId, like] : [tenantId];
  const { rows: crows } = await app.pg.query(countSql, countParams);

  return {
    items,
    total: Number(crows?.[0]?.c ?? 0),
  };
}

export async function insertLocation(app, { tenantId, code, name }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.locations
      (tenant_id, code, name)
    VALUES
      ($1, $2, $3)
    RETURNING id
    `,
    [tenantId, code, name]
  );

  return Number(rows[0].id);
}

export async function updateLocation(app, tenantId, locationId, { code, name }) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.locations
    SET code = $3,
        name = $4
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, locationId, code, name]
  );

  return rowCount;
}

export async function countLocationDeleteDependencies(app, tenantId, locationId) {
  const [assetRows, historyRows] = await Promise.all([
    app.pg.query(
      `
      SELECT COUNT(1)::int AS total
      FROM public.assets
      WHERE tenant_id = $1
        AND location_id = $2
      `,
      [tenantId, locationId]
    ),
    app.pg.query(
      `
      SELECT COUNT(1)::int AS total
      FROM public.asset_ownership_history
      WHERE tenant_id = $1
        AND location_id = $2
      `,
      [tenantId, locationId]
    ),
  ]);

  const assets = Number(assetRows.rows?.[0]?.total ?? 0);
  const history = Number(historyRows.rows?.[0]?.total ?? 0);

  return {
    assets,
    history,
    total: assets + history,
  };
}

export async function deleteLocationById(app, tenantId, locationId) {
  const { rows } = await app.pg.query(
    `
    DELETE FROM public.locations
    WHERE tenant_id = $1
      AND id = $2
    RETURNING id, tenant_id, code, name
    `,
    [tenantId, locationId]
  );

  return rows[0] || null;
}

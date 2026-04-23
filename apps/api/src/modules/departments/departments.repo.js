export async function getDepartmentById(app, tenantId, departmentId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, code, name
    FROM public.departments
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, departmentId]
  );
  return rows[0] || null;
}

export async function getDepartmentByIdForDelete(app, tenantId, departmentId) {
  return await getDepartmentById(app, tenantId, departmentId);
}

export async function departmentCodeExists(app, tenantId, code, excludeId = null) {
  if (!code) return false;

  const params = [tenantId, code];
  let sql = `
    SELECT 1
    FROM public.departments
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

export async function listDepartments(app, tenantId, q, page, pageSize) {
  const off = (page - 1) * pageSize;
  const like = q ? `%${q}%` : null;

  const whereQ = q ? `AND (d.name ILIKE $2 OR d.code ILIKE $2)` : "";
  const params = q
    ? [tenantId, like, pageSize, off]
    : [tenantId, pageSize, off];

  const sql = `
    SELECT
      d.id,
      d.tenant_id,
      d.code,
      d.name
    FROM public.departments d
    WHERE d.tenant_id = $1
    ${whereQ}
    ORDER BY d.id ASC
    LIMIT $${q ? 3 : 2} OFFSET $${q ? 4 : 3}
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countSql = `
    SELECT count(*)::int AS c
    FROM public.departments d
    WHERE d.tenant_id = $1
    ${whereQ}
  `;
  const countParams = q ? [tenantId, like] : [tenantId];
  const { rows: crows } = await app.pg.query(countSql, countParams);

  return {
    items,
    total: Number(crows?.[0]?.c ?? 0),
  };
}

export async function insertDepartment(app, { tenantId, code, name }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.departments
      (tenant_id, code, name)
    VALUES
      ($1, $2, $3)
    RETURNING id
    `,
    [tenantId, code, name]
  );

  return Number(rows[0].id);
}

export async function updateDepartment(app, tenantId, departmentId, { code, name }) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.departments
    SET code = $3,
        name = $4
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, departmentId, code, name]
  );

  return rowCount;
}

export async function countDepartmentDeleteDependencies(app, tenantId, departmentId) {
  const [assetRows, identityRows, historyRows] = await Promise.all([
    app.pg.query(
      `
      SELECT COUNT(1)::int AS total
      FROM public.assets
      WHERE tenant_id = $1
        AND owner_department_id = $2
      `,
      [tenantId, departmentId]
    ),
    app.pg.query(
      `
      SELECT COUNT(1)::int AS total
      FROM public.identities
      WHERE tenant_id = $1
        AND department_id = $2
      `,
      [tenantId, departmentId]
    ),
    app.pg.query(
      `
      SELECT COUNT(1)::int AS total
      FROM public.asset_ownership_history
      WHERE tenant_id = $1
        AND owner_department_id = $2
      `,
      [tenantId, departmentId]
    ),
  ]);

  const assets = Number(assetRows.rows?.[0]?.total ?? 0);
  const identities = Number(identityRows.rows?.[0]?.total ?? 0);
  const history = Number(historyRows.rows?.[0]?.total ?? 0);

  return {
    assets,
    identities,
    history,
    total: assets + identities + history,
  };
}

export async function deleteDepartmentById(app, tenantId, departmentId) {
  const { rows } = await app.pg.query(
    `
    DELETE FROM public.departments
    WHERE tenant_id = $1
      AND id = $2
    RETURNING id, tenant_id, code, name
    `,
    [tenantId, departmentId]
  );

  return rows[0] || null;
}

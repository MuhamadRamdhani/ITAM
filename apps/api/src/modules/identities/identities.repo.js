export async function getIdentityById(app, tenantId, identityId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      i.id,
      i.tenant_id,
      i.name,
      i.email,
      i.department_id,
      d.name AS department_name
    FROM public.identities i
    LEFT JOIN public.departments d
      ON d.tenant_id = i.tenant_id
     AND d.id = i.department_id
    WHERE i.tenant_id = $1
      AND i.id = $2
    LIMIT 1
    `,
    [tenantId, identityId]
  );
  return rows[0] || null;
}

export async function identityEmailExists(app, tenantId, email, excludeId = null) {
  if (!email) return false;

  const params = [tenantId, email];
  let sql = `
    SELECT 1
    FROM public.identities
    WHERE tenant_id = $1
      AND lower(email) = lower($2)
  `;

  if (excludeId != null) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }

  sql += ` LIMIT 1`;

  const { rowCount } = await app.pg.query(sql, params);
  return rowCount > 0;
}

export async function departmentExistsForTenant(app, tenantId, departmentId) {
  if (departmentId == null) return true;

  const { rowCount } = await app.pg.query(
    `
    SELECT 1
    FROM public.departments
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, departmentId]
  );

  return rowCount > 0;
}

export async function listIdentities(app, tenantId, q, page, pageSize) {
  const off = (page - 1) * pageSize;
  const like = q ? `%${q}%` : null;

  const whereQ = q
    ? `AND (i.name ILIKE $2 OR i.email ILIKE $2 OR d.name ILIKE $2)`
    : "";

  const params = q
    ? [tenantId, like, pageSize, off]
    : [tenantId, pageSize, off];

  const sql = `
    SELECT
      i.id,
      i.tenant_id,
      i.name,
      i.email,
      i.department_id,
      d.name AS department_name
    FROM public.identities i
    LEFT JOIN public.departments d
      ON d.tenant_id = i.tenant_id
     AND d.id = i.department_id
    WHERE i.tenant_id = $1
    ${whereQ}
    ORDER BY i.id ASC
    LIMIT $${q ? 3 : 2} OFFSET $${q ? 4 : 3}
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countSql = `
    SELECT count(*)::int AS c
    FROM public.identities i
    LEFT JOIN public.departments d
      ON d.tenant_id = i.tenant_id
     AND d.id = i.department_id
    WHERE i.tenant_id = $1
    ${whereQ}
  `;

  const countParams = q ? [tenantId, like] : [tenantId];
  const { rows: crows } = await app.pg.query(countSql, countParams);

  return {
    items,
    total: Number(crows?.[0]?.c ?? 0),
  };
}

export async function insertIdentity(app, { tenantId, name, email, departmentId }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.identities
      (tenant_id, name, email, department_id)
    VALUES
      ($1, $2, $3, $4)
    RETURNING id
    `,
    [tenantId, name, email, departmentId]
  );

  return Number(rows[0].id);
}

export async function updateIdentity(app, tenantId, identityId, { name, email, departmentId }) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.identities
    SET name = $3,
        email = $4,
        department_id = $5
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, identityId, name, email, departmentId]
  );

  return rowCount;
}
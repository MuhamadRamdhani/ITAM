export async function getTenantTargetById(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      code,
      name,
      status_code,
      plan_code,
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

export async function listRoles(app, tenantId) {
  const { rows } = await app.pg.query(
    `
    SELECT code, display_name, is_system, created_at
    FROM public.roles
    WHERE tenant_id = $1
    ORDER BY id ASC
    `,
    [tenantId]
  );
  return rows;
}

export async function roleExists(app, tenantId, roleCode) {
  const { rowCount } = await app.pg.query(
    `SELECT 1 FROM public.roles WHERE tenant_id = $1 AND code = $2`,
    [tenantId, roleCode]
  );
  return rowCount > 0;
}

export async function getUserById(app, tenantId, userId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      u.id,
      u.tenant_id,
      u.email,
      u.email_norm,
      u.status_code,
      u.identity_id,
      u.created_at,
      u.last_login_at,
      u.disabled_at,
      COALESCE(
        ARRAY_AGG(ur.role_code ORDER BY ur.role_code)
        FILTER (WHERE ur.role_code IS NOT NULL),
        '{}'
      ) AS roles
    FROM public.users u
    LEFT JOIN public.user_roles ur
      ON ur.tenant_id = u.tenant_id
     AND ur.user_id = u.id
    WHERE u.tenant_id = $1
      AND u.id = $2
    GROUP BY
      u.id,
      u.tenant_id,
      u.email,
      u.email_norm,
      u.status_code,
      u.identity_id,
      u.created_at,
      u.last_login_at,
      u.disabled_at
    LIMIT 1
    `,
    [tenantId, userId]
  );
  return rows[0] || null;
}

export async function listUsers(app, tenantId, q, page, pageSize) {
  const off = (page - 1) * pageSize;
  const like = q ? `%${q}%` : null;

  const whereQ = q ? `AND (u.email ILIKE $2 OR u.email_norm ILIKE $2)` : "";
  const params = q
    ? [tenantId, like, pageSize, off]
    : [tenantId, pageSize, off];

  const sql = `
    WITH filtered_users AS (
      SELECT
        u.id,
        u.tenant_id,
        u.email,
        u.status_code,
        u.identity_id,
        u.created_at,
        u.last_login_at,
        u.disabled_at
      FROM public.users u
      WHERE u.tenant_id = $1
      ${whereQ}
      ORDER BY u.id DESC
      LIMIT $${q ? 3 : 2} OFFSET $${q ? 4 : 3}
    )
    SELECT
      fu.id,
      fu.email,
      fu.status_code,
      fu.identity_id,
      fu.created_at,
      fu.last_login_at,
      fu.disabled_at,
      COALESCE(
        ARRAY_AGG(ur.role_code ORDER BY ur.role_code)
        FILTER (WHERE ur.role_code IS NOT NULL),
        '{}'
      ) AS roles
    FROM filtered_users fu
    LEFT JOIN public.user_roles ur
      ON ur.tenant_id = fu.tenant_id
     AND ur.user_id = fu.id
    GROUP BY
      fu.id,
      fu.email,
      fu.status_code,
      fu.identity_id,
      fu.created_at,
      fu.last_login_at,
      fu.disabled_at
    ORDER BY fu.id DESC
  `;

  const { rows: items } = await app.pg.query(sql, params);

  const countSql = `
    SELECT count(*)::int as c
    FROM public.users u
    WHERE u.tenant_id = $1
    ${whereQ}
  `;
  const countParams = q ? [tenantId, like] : [tenantId];
  const { rows: crows } = await app.pg.query(countSql, countParams);
  const total = Number(crows?.[0]?.c ?? 0);

  return { items, total };
}

export async function insertUser(app, { tenantId, email, emailNorm, passwordHash, statusCode, identityId }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.users
      (tenant_id, email, email_norm, password_hash, status_code, identity_id)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [tenantId, email, emailNorm, passwordHash, statusCode, identityId ?? null]
  );
  return Number(rows[0].id);
}

export async function updateUserStatus(app, { tenantId, userId, statusCode }) {
  const disabledAt = String(statusCode).toUpperCase() === "DISABLED" ? "now()" : "NULL";

  const { rowCount } = await app.pg.query(
    `
    UPDATE public.users
    SET status_code = $3,
        disabled_at = ${disabledAt}
    WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, userId, statusCode]
  );
  return rowCount;
}

export async function updateUserPassword(app, { tenantId, userId, passwordHash }) {
  const { rowCount } = await app.pg.query(
    `
    UPDATE public.users
    SET password_hash = $3
    WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, userId, passwordHash]
  );
  return rowCount;
}

export async function listUserRoleCodes(app, tenantId, userId) {
  const { rows } = await app.pg.query(
    `
    SELECT role_code
    FROM public.user_roles
    WHERE tenant_id = $1 AND user_id = $2
    ORDER BY role_code ASC
    `,
    [tenantId, userId]
  );
  return rows.map((r) => String(r.role_code));
}

export async function addUserRole(app, { tenantId, userId, roleCode }) {
  await app.pg.query(
    `
    INSERT INTO public.user_roles (tenant_id, user_id, role_code)
    VALUES ($1, $2, $3)
    ON CONFLICT DO NOTHING
    `,
    [tenantId, userId, roleCode]
  );
}

export async function removeUserRole(app, { tenantId, userId, roleCode }) {
  await app.pg.query(
    `
    DELETE FROM public.user_roles
    WHERE tenant_id = $1 AND user_id = $2 AND role_code = $3
    `,
    [tenantId, userId, roleCode]
  );
}
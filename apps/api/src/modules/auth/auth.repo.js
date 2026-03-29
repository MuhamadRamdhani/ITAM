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
    [String(code || "").trim().toLowerCase()]
  );

  return rows[0] || null;
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

export async function getUserByEmail(app, tenantId, email) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      email_norm,
      password_hash,
      status_code,
      identity_id,
      created_at,
      last_login_at,
      disabled_at,
      updated_at
    FROM public.users
    WHERE tenant_id = $1
      AND email_norm = $2
    LIMIT 1
    `,
    [tenantId, String(email || "").trim().toLowerCase()]
  );

  return rows[0] || null;
}

export async function listRoleCodesByUser(app, tenantId, userId) {
  const { rows } = await app.pg.query(
    `
    SELECT r.code
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.tenant_id = ur.tenant_id
     AND r.code = ur.role_code
    WHERE ur.tenant_id = $1
      AND ur.user_id = $2
    ORDER BY r.code
    `,
    [tenantId, userId]
  );

  return rows.map((r) => String(r.code));
}

export async function touchLastLogin(app, tenantId, userId) {
  await app.pg.query(
    `
    UPDATE public.users
    SET
      last_login_at = now(),
      updated_at = now()
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, userId]
  );
}

export async function insertRefreshToken(
  app,
  { tenantId, userId, tokenId, tokenHash, expiresAt, userAgent, ip }
) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.refresh_tokens
      (tenant_id, user_id, token_id, token_hash, expires_at, user_agent, ip)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [tenantId, userId, tokenId, tokenHash, expiresAt, userAgent || null, ip || null]
  );

  return Number(rows[0].id);
}

export async function getRefreshTokenByTokenId(app, tokenId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      user_id,
      token_id,
      token_hash,
      expires_at,
      revoked_at,
      user_agent,
      ip,
      created_at
    FROM public.refresh_tokens
    WHERE token_id = $1
    LIMIT 1
    `,
    [tokenId]
  );

  return rows[0] || null;
}

export async function revokeRefreshToken(app, refreshTokenId) {
  await app.pg.query(
    `
    UPDATE public.refresh_tokens
    SET revoked_at = now()
    WHERE id = $1
      AND revoked_at IS NULL
    `,
    [refreshTokenId]
  );
}
export async function getTenantByCode(app, tenantCode) {
  const code = String(tenantCode || "").trim();
  const { rows } = await app.pg.query(
    `
    SELECT id, code, name
    FROM public.tenants
    WHERE code = $1
    LIMIT 1
    `,
    [code]
  );
  return rows[0] || null;
}

export async function getUserByEmail(app, tenantId, emailNorm) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, email, email_norm, password_hash, status_code, identity_id
    FROM public.users
    WHERE tenant_id = $1 AND email_norm = $2
    LIMIT 1
    `,
    [tenantId, emailNorm]
  );
  return rows[0] || null;
}

export async function listRoleCodesByUser(app, tenantId, userId) {
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

export async function touchLastLogin(app, tenantId, userId) {
  await app.pg.query(
    `
    UPDATE public.users
    SET last_login_at = now()
    WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, userId]
  );
}

export async function insertRefreshToken(app, { tenantId, userId, tokenId, tokenHash, expiresAt, userAgent, ip }) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.refresh_tokens
      (tenant_id, user_id, token_id, token_hash, expires_at, user_agent, ip)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [tenantId, userId, tokenId, tokenHash, expiresAt, userAgent ?? null, ip ?? null]
  );
  return rows[0] || null;
}

export async function getRefreshTokenByTokenId(app, tokenId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, user_id, token_id, token_hash, expires_at, revoked_at
    FROM public.refresh_tokens
    WHERE token_id = $1
    LIMIT 1
    `,
    [String(tokenId)]
  );
  return rows[0] || null;
}

export async function revokeRefreshToken(app, tokenRowId) {
  await app.pg.query(
    `
    UPDATE public.refresh_tokens
    SET revoked_at = now()
    WHERE id = $1
    `,
    [tokenRowId]
  );
}
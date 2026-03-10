import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { insertAuditEvent } from "../../lib/audit.js";
import {
  getTenantByCode,
  getUserByEmail,
  listRoleCodesByUser,
  touchLastLogin,
  insertRefreshToken,
  getRefreshTokenByTokenId,
  revokeRefreshToken,
} from "./auth.repo.js";

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function authError(statusCode, code, message, details) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  e.details = details;
  return e;
}

function parseDays(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.floor(x);
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function makeRefreshTokenRaw() {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  const raw = `${tokenId}.${secret}`;
  return { tokenId, raw, hash: sha256Hex(raw) };
}

function refreshExpiresAt() {
  const days = parseDays(process.env.AUTH_REFRESH_DAYS, 30);
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

function accessTtl() {
  return String(process.env.AUTH_ACCESS_TTL || "15m");
}

export async function loginService(app, { tenantCode, email, password, userAgent, ip }) {
  const tenant = await getTenantByCode(app, tenantCode);

  // jangan leak tenant existence
  if (!tenant) {
    throw authError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const tenantId = Number(tenant.id);
  const emailNorm = normEmail(email);

  const user = await getUserByEmail(app, tenantId, emailNorm);
  if (!user) {
    await insertAuditEvent(app, {
      tenantId,
      actor: "SYSTEM",
      action: "AUTH_LOGIN_FAILED",
      entityType: "USER",
      entityId: null,
      payload: { email: emailNorm, reason: "USER_NOT_FOUND", ip, user_agent: userAgent },
    });
    throw authError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (String(user.status_code || "").toUpperCase() !== "ACTIVE") {
    await insertAuditEvent(app, {
      tenantId,
      actor: `USER:${user.id}`,
      action: "AUTH_LOGIN_FAILED",
      entityType: "USER",
      entityId: Number(user.id),
      payload: { email: emailNorm, reason: "USER_NOT_ACTIVE", ip, user_agent: userAgent },
    });
    throw authError(403, "USER_DISABLED", "User is disabled");
  }

  const ok = await bcrypt.compare(String(password || ""), String(user.password_hash || ""));
  if (!ok) {
    await insertAuditEvent(app, {
      tenantId,
      actor: `USER:${user.id}`,
      action: "AUTH_LOGIN_FAILED",
      entityType: "USER",
      entityId: Number(user.id),
      payload: { email: emailNorm, reason: "BAD_PASSWORD", ip, user_agent: userAgent },
    });
    throw authError(401, "AUTH_INVALID_CREDENTIALS", "Invalid credentials");
  }

  const roles = await listRoleCodesByUser(app, tenantId, Number(user.id));

  const accessToken = app.jwt.sign(
    {
      tenant_id: tenantId,
      user_id: Number(user.id),
      roles,
      identity_id: user.identity_id ?? null,
    },
    { expiresIn: accessTtl() }
  );

  const rt = makeRefreshTokenRaw();
  await insertRefreshToken(app, {
    tenantId,
    userId: Number(user.id),
    tokenId: rt.tokenId,
    tokenHash: rt.hash,
    expiresAt: refreshExpiresAt(),
    userAgent,
    ip,
  });

  await touchLastLogin(app, tenantId, Number(user.id));

  await insertAuditEvent(app, {
    tenantId,
    actor: `USER:${user.id}`,
    action: "AUTH_LOGIN_SUCCESS",
    entityType: "USER",
    entityId: Number(user.id),
    payload: { email: emailNorm, roles, ip, user_agent: userAgent },
  });

  return {
    tenant: { id: tenantId, code: tenant.code, name: tenant.name },
    user: {
      id: Number(user.id),
      tenant_id: tenantId,
      email: user.email,
      status_code: user.status_code,
      identity_id: user.identity_id ?? null,
    },
    roles,
    accessToken,
    refreshTokenRaw: rt.raw,
  };
}

export async function meService(app, { tenantId, userId }) {
  if (!tenantId || !userId) throw authError(401, "AUTH_REQUIRED", "Authentication required");

  const roles = await listRoleCodesByUser(app, tenantId, userId);
  return { tenant_id: tenantId, user_id: userId, roles };
}

export async function refreshService(app, { refreshTokenRaw, userAgent, ip }) {
  const raw = String(refreshTokenRaw || "").trim();
  if (!raw || !raw.includes(".")) throw authError(401, "AUTH_INVALID_REFRESH", "Invalid refresh token");

  const tokenId = raw.split(".")[0];
  const row = await getRefreshTokenByTokenId(app, tokenId);
  if (!row) throw authError(401, "AUTH_INVALID_REFRESH", "Invalid refresh token");

  if (row.revoked_at) throw authError(401, "AUTH_REFRESH_REVOKED", "Refresh token revoked");

  const now = Date.now();
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(exp) || exp <= now) throw authError(401, "AUTH_REFRESH_EXPIRED", "Refresh token expired");

  const hash = sha256Hex(raw);
  if (hash !== String(row.token_hash)) throw authError(401, "AUTH_INVALID_REFRESH", "Invalid refresh token");

  // rotate: revoke old + issue new
  await revokeRefreshToken(app, Number(row.id));

  const tenantId = Number(row.tenant_id);
  const userId = Number(row.user_id);
  const roles = await listRoleCodesByUser(app, tenantId, userId);

  const accessToken = app.jwt.sign(
    { tenant_id: tenantId, user_id: userId, roles },
    { expiresIn: accessTtl() }
  );

  const rt = makeRefreshTokenRaw();
  await insertRefreshToken(app, {
    tenantId,
    userId,
    tokenId: rt.tokenId,
    tokenHash: rt.hash,
    expiresAt: refreshExpiresAt(),
    userAgent,
    ip,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: `USER:${userId}`,
    action: "AUTH_REFRESH",
    entityType: "USER",
    entityId: userId,
    payload: { token_id_old: tokenId, token_id_new: rt.tokenId, ip, user_agent: userAgent },
  });

  return { tenantId, userId, roles, accessToken, refreshTokenRaw: rt.raw };
}

export async function logoutService(app, { refreshTokenRaw, ip, userAgent }) {
  const raw = String(refreshTokenRaw || "").trim();
  if (!raw || !raw.includes(".")) return { ok: true };

  const tokenId = raw.split(".")[0];
  const row = await getRefreshTokenByTokenId(app, tokenId);
  if (!row) return { ok: true };

  if (!row.revoked_at) {
    await revokeRefreshToken(app, Number(row.id));
    await insertAuditEvent(app, {
      tenantId: Number(row.tenant_id),
      actor: `USER:${Number(row.user_id)}`,
      action: "AUTH_LOGOUT",
      entityType: "USER",
      entityId: Number(row.user_id),
      payload: { token_id: tokenId, ip, user_agent: userAgent },
    });
  }

  return { ok: true };
}
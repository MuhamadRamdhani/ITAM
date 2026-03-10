import bcrypt from "bcryptjs";

import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

import {
  listRoles,
  roleExists,
  getUserById,
  listUsers,
  insertUser,
  updateUserStatus,
  updateUserPassword,
  listUserRoleCodes,
  addUserRole,
  removeUserRole,
} from "./iam.repo.js";

function mustTenantId(req) {
  const tenantId = req.tenantId ?? req.requestContext?.tenantId;
  if (!tenantId) {
    const e = new Error("Missing tenantId in request context");
    e.statusCode = 500;
    e.code = "TENANT_CONTEXT_MISSING";
    throw e;
  }
  return Number(tenantId);
}

function actorStr(req) {
  const a = req.actor;
  if (a?.type === "USER" && a?.id) return `USER:${a.id}`;
  return "SYSTEM";
}

function mustHaveAnyRole(req, allowed) {
  const roles = Array.isArray(req.requestContext?.roles) ? req.requestContext.roles : [];
  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowed, got: roles };
    throw e;
  }
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function resolvePageSizeStrict(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options) ? cfg.page_size_options : [];
  const def = Number(cfg.documents_page_size_default);

  if (requested == null) return def;

  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error("Invalid page_size");
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { got: requested };
    throw e;
  }
  if (!options.includes(n)) {
    const e = new Error(`page_size must be one of: ${options.join(", ")}`);
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { allowed: options, got: n };
    throw e;
  }
  return n;
}

// ===== Roles =====
export async function listRolesService(app, req) {
  const tenantId = mustTenantId(req);
  // list roles boleh dibuka untuk semua authenticated user (atau bisa dibatasi admin, terserah)
  return await listRoles(app, tenantId);
}

// ===== Users =====
export async function listUsersService(app, req, { q, page, pageSize }) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listUsers(app, tenantId, q ? String(q).trim() : null, p, ps);
  return { items: out.items, total: out.total, page: p, page_size: ps };
}

export async function createUserService(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const emailNorm = normEmail(body.email);
  if (!emailNorm || !emailNorm.includes("@")) {
    const e = new Error("Invalid email");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const password = String(body.password || "");
  if (password.length < 6) {
    const e = new Error("Password too short (min 6)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const statusCode = String(body.status_code || "ACTIVE").toUpperCase();
  if (statusCode !== "ACTIVE" && statusCode !== "DISABLED") {
    const e = new Error("Invalid status_code (must be ACTIVE|DISABLED)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const userId = await insertUser(app, {
      tenantId,
      email: String(body.email).trim(),
      emailNorm,
      passwordHash,
      statusCode,
      identityId: body.identity_id ?? null,
    });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_CREATED",
      entityType: "USER",
      entityId: userId,
      payload: { email: emailNorm, status_code: statusCode },
    });

    return await getUserById(app, tenantId, userId);
  } catch (err) {
    if (String(err?.code) === "23505") {
      const e = new Error("Email already exists for tenant");
      e.statusCode = 409;
      e.code = "USER_EMAIL_TAKEN";
      e.details = { email: emailNorm };
      throw e;
    }
    throw err;
  }
}

export async function patchUserService(app, req, userId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const user = await getUserById(app, tenantId, userId);
  if (!user) {
    const e = new Error("User not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  if (body.status_code) {
    const to = String(body.status_code).toUpperCase();
    if (to !== "ACTIVE" && to !== "DISABLED") {
      const e = new Error("Invalid status_code (must be ACTIVE|DISABLED)");
      e.statusCode = 400;
      e.code = "BAD_REQUEST";
      throw e;
    }

    const from = String(user.status_code || "").toUpperCase();
    await updateUserStatus(app, { tenantId, userId, statusCode: to });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_STATUS_CHANGED",
      entityType: "USER",
      entityId: userId,
      payload: { from, to },
    });
  }

  if (body.password) {
    const password = String(body.password || "");
    if (password.length < 6) {
      const e = new Error("Password too short (min 6)");
      e.statusCode = 400;
      e.code = "BAD_REQUEST";
      throw e;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await updateUserPassword(app, { tenantId, userId, passwordHash });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_PASSWORD_RESET",
      entityType: "USER",
      entityId: userId,
      payload: { by: actorStr(req) },
    });
  }

  return await getUserById(app, tenantId, userId);
}

export async function changeUserRoleService(app, req, userId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const user = await getUserById(app, tenantId, userId);
  if (!user) {
    const e = new Error("User not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const op = String(body.op || "").toUpperCase();
  const roleCode = String(body.role_code || "").toUpperCase();

  if (op !== "ADD" && op !== "REMOVE") {
    const e = new Error("Invalid op (must be ADD|REMOVE)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  if (!roleCode) {
    const e = new Error("Missing role_code");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const okRole = await roleExists(app, tenantId, roleCode);
  if (!okRole) {
    const e = new Error("Role not found");
    e.statusCode = 400;
    e.code = "ROLE_NOT_FOUND";
    e.details = { role_code: roleCode };
    throw e;
  }

  // ---- prevent remove last role
  if (op === "REMOVE") {
    const currentRoles = await listUserRoleCodes(app, tenantId, userId);
    const willRemoveExisting = currentRoles.includes(roleCode);

    if (willRemoveExisting && currentRoles.length <= 1) {
      const e = new Error("User must have at least one role");
      e.statusCode = 400;
      e.code = "MIN_ROLE_REQUIRED";
      e.details = { user_id: userId, role_code: roleCode };
      throw e;
    }
  }

  if (op === "ADD") {
    await addUserRole(app, { tenantId, userId, roleCode });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_ROLE_ADDED",
      entityType: "USER",
      entityId: userId,
      payload: { role_code: roleCode },
    });
  } else {
    await removeUserRole(app, { tenantId, userId, roleCode });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_ROLE_REMOVED",
      entityType: "USER",
      entityId: userId,
      payload: { role_code: roleCode },
    });
  }

  const roles = await listUserRoleCodes(app, tenantId, userId);
  return { user_id: userId, roles };
}
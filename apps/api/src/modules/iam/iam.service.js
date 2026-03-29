import bcrypt from "bcryptjs";

import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

import {
  getTenantTargetById,
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

const RESERVED_PLATFORM_ROLES = ["SUPERADMIN"];

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

function readRoleCodes(req) {
  const raw = Array.isArray(req.requestContext?.roles) ? req.requestContext.roles : [];
  return raw
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        return x.code ?? x.role_code ?? x.roleCode ?? "";
      }
      return "";
    })
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
}

function mustHaveAnyRole(req, allowed) {
  const roles = readRoleCodes(req);
  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowed, got: roles };
    throw e;
  }
}

function isReqSuperadmin(req) {
  return readRoleCodes(req).includes("SUPERADMIN");
}

function mustSuperadmin(req) {
  mustHaveAnyRole(req, ["SUPERADMIN"]);
}

function isReservedPlatformRole(roleCode) {
  return RESERVED_PLATFORM_ROLES.includes(String(roleCode || "").trim().toUpperCase());
}

function assertCanManageRole(req, roleCode) {
  if (isReservedPlatformRole(roleCode) && !isReqSuperadmin(req)) {
    const e = new Error("Forbidden to manage reserved platform role");
    e.statusCode = 403;
    e.code = "FORBIDDEN_ROLE_SCOPE";
    e.details = {
      role_code: String(roleCode || "").trim().toUpperCase(),
      reason: "ROLE_RESERVED_FOR_SUPERADMIN",
    };
    throw e;
  }
}

async function assertCanManageTargetUser(app, req, tenantId, userId) {
  const roles = await listUserRoleCodes(app, tenantId, userId);

  const targetHasReservedRole = roles.some((r) => isReservedPlatformRole(r));
  if (targetHasReservedRole && !isReqSuperadmin(req)) {
    const e = new Error("Forbidden to manage user with reserved platform role");
    e.statusCode = 403;
    e.code = "FORBIDDEN_TARGET_USER_SCOPE";
    e.details = {
      user_id: userId,
      target_roles: roles,
      reason: "TARGET_USER_HAS_RESERVED_ROLE",
    };
    throw e;
  }

  return roles;
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function mustPositiveId(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error(`Invalid ${label}`);
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { [String(label).replace(/\s+/g, "_")]: value };
    throw e;
  }
  return Math.trunc(n);
}

async function mustTargetTenant(app, tenantId) {
  const id = mustPositiveId(tenantId, "tenant id");
  const tenant = await getTenantTargetById(app, id);
  if (!tenant) {
    const e = new Error("Tenant not found");
    e.statusCode = 404;
    e.code = "TENANT_NOT_FOUND";
    e.details = { tenant_id: id };
    throw e;
  }
  return tenant;
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

function superadminAuditMeta(req, targetTenant) {
  return {
    managed_by_superadmin: true,
    source_tenant_id: req.tenantId ?? req.requestContext?.tenantId ?? null,
    target_tenant_id: Number(targetTenant.id),
    target_tenant_code: targetTenant.code ?? null,
  };
}

async function listRolesForTenantService(app, tenantId) {
  return await listRoles(app, tenantId);
}

async function listUsersForTenantService(app, tenantId, { q, page, pageSize }) {
  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listUsers(app, tenantId, q ? String(q).trim() : null, p, ps);
  return { items: out.items, total: out.total, page: p, page_size: ps };
}

async function createUserForTenantService(app, req, tenantId, body, auditExtra = {}) {
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
      payload: {
        email: emailNorm,
        status_code: statusCode,
        ...auditExtra,
      },
    });

    return await getUserById(app, tenantId, userId);
  } catch (err) {
    if (String(err?.code) === "23505") {
      const e = new Error("Email already exists for tenant");
      e.statusCode = 409;
      e.code = "USER_EMAIL_TAKEN";
      e.details = { email: emailNorm, tenant_id: tenantId };
      throw e;
    }
    throw err;
  }
}

async function patchUserForTenantService(app, req, tenantId, userId, body, auditExtra = {}) {
  const normalizedUserId = mustPositiveId(userId, "user id");

  const user = await getUserById(app, tenantId, normalizedUserId);
  if (!user) {
    const e = new Error("User not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await assertCanManageTargetUser(app, req, tenantId, normalizedUserId);

  if (body.status_code) {
    const to = String(body.status_code).toUpperCase();
    if (to !== "ACTIVE" && to !== "DISABLED") {
      const e = new Error("Invalid status_code (must be ACTIVE|DISABLED)");
      e.statusCode = 400;
      e.code = "BAD_REQUEST";
      throw e;
    }

    const from = String(user.status_code || "").toUpperCase();
    await updateUserStatus(app, { tenantId, userId: normalizedUserId, statusCode: to });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_STATUS_CHANGED",
      entityType: "USER",
      entityId: normalizedUserId,
      payload: {
        from,
        to,
        ...auditExtra,
      },
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
    await updateUserPassword(app, { tenantId, userId: normalizedUserId, passwordHash });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_PASSWORD_RESET",
      entityType: "USER",
      entityId: normalizedUserId,
      payload: {
        by: actorStr(req),
        ...auditExtra,
      },
    });
  }

  return await getUserById(app, tenantId, normalizedUserId);
}

async function changeUserRoleForTenantService(app, req, tenantId, userId, body, auditExtra = {}) {
  const normalizedUserId = mustPositiveId(userId, "user id");

  const user = await getUserById(app, tenantId, normalizedUserId);
  if (!user) {
    const e = new Error("User not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await assertCanManageTargetUser(app, req, tenantId, normalizedUserId);

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

  assertCanManageRole(req, roleCode);

  const okRole = await roleExists(app, tenantId, roleCode);
  if (!okRole) {
    const e = new Error("Role not found");
    e.statusCode = 400;
    e.code = "ROLE_NOT_FOUND";
    e.details = { role_code: roleCode, tenant_id: tenantId };
    throw e;
  }

  if (op === "REMOVE") {
    const currentRoles = await listUserRoleCodes(app, tenantId, normalizedUserId);
    const willRemoveExisting = currentRoles.includes(roleCode);

    if (willRemoveExisting && currentRoles.length <= 1) {
      const e = new Error("User must have at least one role");
      e.statusCode = 400;
      e.code = "MIN_ROLE_REQUIRED";
      e.details = { user_id: normalizedUserId, role_code: roleCode, tenant_id: tenantId };
      throw e;
    }
  }

  if (op === "ADD") {
    await addUserRole(app, { tenantId, userId: normalizedUserId, roleCode });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_ROLE_ADDED",
      entityType: "USER",
      entityId: normalizedUserId,
      payload: {
        role_code: roleCode,
        ...auditExtra,
      },
    });
  } else {
    await removeUserRole(app, { tenantId, userId: normalizedUserId, roleCode });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "USER_ROLE_REMOVED",
      entityType: "USER",
      entityId: normalizedUserId,
      payload: {
        role_code: roleCode,
        ...auditExtra,
      },
    });
  }

  const roles = await listUserRoleCodes(app, tenantId, normalizedUserId);
  return { user_id: normalizedUserId, roles };
}

// ===== Roles =====
export async function listRolesService(app, req) {
  const tenantId = mustTenantId(req);
  const items = await listRolesForTenantService(app, tenantId);

  if (isReqSuperadmin(req)) return items;

  return items.filter((r) => !isReservedPlatformRole(r.code));
}

// ===== Users (tenant-scoped existing) =====
export async function listUsersService(app, req, { q, page, pageSize }) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await listUsersForTenantService(app, tenantId, { q, page, pageSize });
}

export async function createUserService(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await createUserForTenantService(app, req, tenantId, body);
}

export async function patchUserService(app, req, userId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await patchUserForTenantService(app, req, tenantId, userId, body);
}

export async function changeUserRoleService(app, req, userId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await changeUserRoleForTenantService(app, req, tenantId, userId, body);
}

// ===== Superadmin target-tenant mode =====
export async function listRolesByTenantService(app, req, targetTenantId) {
  mustSuperadmin(req);
  const targetTenant = await mustTargetTenant(app, targetTenantId);
  return await listRolesForTenantService(app, Number(targetTenant.id));
}

export async function listUsersByTenantService(app, req, targetTenantId, { q, page, pageSize }) {
  mustSuperadmin(req);
  const targetTenant = await mustTargetTenant(app, targetTenantId);
  return await listUsersForTenantService(app, Number(targetTenant.id), { q, page, pageSize });
}

export async function createUserByTenantService(app, req, targetTenantId, body) {
  mustSuperadmin(req);
  const targetTenant = await mustTargetTenant(app, targetTenantId);
  return await createUserForTenantService(
    app,
    req,
    Number(targetTenant.id),
    body,
    superadminAuditMeta(req, targetTenant)
  );
}

export async function patchUserByTenantService(app, req, targetTenantId, userId, body) {
  mustSuperadmin(req);
  const targetTenant = await mustTargetTenant(app, targetTenantId);
  return await patchUserForTenantService(
    app,
    req,
    Number(targetTenant.id),
    userId,
    body,
    superadminAuditMeta(req, targetTenant)
  );
}

export async function changeUserRoleByTenantService(app, req, targetTenantId, userId, body) {
  mustSuperadmin(req);
  const targetTenant = await mustTargetTenant(app, targetTenantId);
  return await changeUserRoleForTenantService(
    app,
    req,
    Number(targetTenant.id),
    userId,
    body,
    superadminAuditMeta(req, targetTenant)
  );
}
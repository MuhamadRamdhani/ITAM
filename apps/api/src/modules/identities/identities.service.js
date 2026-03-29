import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";
import {
  getIdentityById,
  identityEmailExists,
  departmentExistsForTenant,
  listIdentities,
  insertIdentity,
  updateIdentity,
} from "./identities.repo.js";

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
  const raw = Array.isArray(req.requestContext?.roles)
    ? req.requestContext.roles
    : [];
  const roles = raw
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        return x.code ?? x.role_code ?? x.roleCode ?? "";
      }
      return "";
    })
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowed, got: roles };
    throw e;
  }
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

function validateName(name) {
  const v = String(name || "").trim();
  if (!v) {
    const e = new Error("Identity name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return v;
}

function normalizeEmailOrNull(email) {
  const v = String(email || "").trim().toLowerCase();
  return v || null;
}

function validateEmailOrNull(email) {
  if (email == null) return null;
  const v = normalizeEmailOrNull(email);
  if (!v) return null;

  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!ok) {
    const e = new Error("Invalid email format");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { email: v };
    throw e;
  }

  return v;
}

function validateDepartmentIdOrNull(departmentId) {
  if (departmentId == null || departmentId === "") return null;

  const n = Number(departmentId);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error("Invalid department_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  return n;
}

export async function listIdentitiesService(app, req, { q, page, pageSize }) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listIdentities(
    app,
    tenantId,
    q ? String(q).trim() : null,
    p,
    ps
  );

  return {
    items: out.items,
    total: out.total,
    page: p,
    page_size: ps,
  };
}

export async function createIdentityService(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const name = validateName(body.name);
  const email = validateEmailOrNull(body.email);
  const departmentId = validateDepartmentIdOrNull(body.department_id);

  if (email) {
    const exists = await identityEmailExists(app, tenantId, email);
    if (exists) {
      const e = new Error("Identity email already exists in tenant");
      e.statusCode = 409;
      e.code = "IDENTITY_EMAIL_TAKEN";
      e.details = { email };
      throw e;
    }
  }

  if (departmentId != null) {
    const okDepartment = await departmentExistsForTenant(app, tenantId, departmentId);
    if (!okDepartment) {
      const e = new Error("Department not found");
      e.statusCode = 400;
      e.code = "DEPARTMENT_NOT_FOUND";
      e.details = { department_id: departmentId };
      throw e;
    }
  }

  const identityId = await insertIdentity(app, {
    tenantId,
    name,
    email,
    departmentId,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "IDENTITY_CREATED",
    entityType: "IDENTITY",
    entityId: identityId,
    payload: {
      name,
      email,
      department_id: departmentId,
    },
  });

  return await getIdentityById(app, tenantId, identityId);
}

export async function patchIdentityService(app, req, identityId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getIdentityById(app, tenantId, identityId);
  if (!current) {
    const e = new Error("Identity not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const name = validateName(body.name);
  const email = validateEmailOrNull(body.email);
  const departmentId = validateDepartmentIdOrNull(body.department_id);

  if (email) {
    const exists = await identityEmailExists(app, tenantId, email, identityId);
    if (exists) {
      const e = new Error("Identity email already exists in tenant");
      e.statusCode = 409;
      e.code = "IDENTITY_EMAIL_TAKEN";
      e.details = { email };
      throw e;
    }
  }

  if (departmentId != null) {
    const okDepartment = await departmentExistsForTenant(app, tenantId, departmentId);
    if (!okDepartment) {
      const e = new Error("Department not found");
      e.statusCode = 400;
      e.code = "DEPARTMENT_NOT_FOUND";
      e.details = { department_id: departmentId };
      throw e;
    }
  }

  await updateIdentity(app, tenantId, identityId, {
    name,
    email,
    departmentId,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "IDENTITY_UPDATED",
    entityType: "IDENTITY",
    entityId: identityId,
    payload: {
      from: {
        name: current.name,
        email: current.email,
        department_id: current.department_id,
      },
      to: {
        name,
        email,
        department_id: departmentId,
      },
    },
  });

  return await getIdentityById(app, tenantId, identityId);
}
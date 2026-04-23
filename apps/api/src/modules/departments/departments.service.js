import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";
import {
  getDepartmentById,
  getDepartmentByIdForDelete,
  departmentCodeExists,
  listDepartments,
  insertDepartment,
  updateDepartment,
  countDepartmentDeleteDependencies,
  deleteDepartmentById,
} from "./departments.repo.js";

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

function normalizeCode(code) {
  const v = String(code || "").trim().toUpperCase();
  return v || null;
}

function validateCodeOrNull(code) {
  if (code == null) return null;
  const v = normalizeCode(code);
  if (!v) return null;

  if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(v)) {
    const e = new Error(
      "Invalid department code. Use uppercase letters, numbers, underscore, or dash (max 50 chars)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { code: v };
    throw e;
  }

  return v;
}

function validateName(name) {
  const v = String(name || "").trim();
  if (!v) {
    const e = new Error("Department name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return v;
}

export async function listDepartmentsService(app, req, { q, page, pageSize }) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listDepartments(
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

export async function createDepartmentService(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const code = validateCodeOrNull(body.code);
  const name = validateName(body.name);

  if (code) {
    const exists = await departmentCodeExists(app, tenantId, code);
    if (exists) {
      const e = new Error("Department code already exists in tenant");
      e.statusCode = 409;
      e.code = "DEPARTMENT_CODE_TAKEN";
      e.details = { code };
      throw e;
    }
  }

  const departmentId = await insertDepartment(app, {
    tenantId,
    code,
    name,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "DEPARTMENT_CREATED",
    entityType: "DEPARTMENT",
    entityId: departmentId,
    payload: {
      code,
      name,
    },
  });

  return await getDepartmentById(app, tenantId, departmentId);
}

export async function patchDepartmentService(app, req, departmentId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getDepartmentById(app, tenantId, departmentId);
  if (!current) {
    const e = new Error("Department not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const code = validateCodeOrNull(body.code);
  const name = validateName(body.name);

  if (code) {
    const exists = await departmentCodeExists(app, tenantId, code, departmentId);
    if (exists) {
      const e = new Error("Department code already exists in tenant");
      e.statusCode = 409;
      e.code = "DEPARTMENT_CODE_TAKEN";
      e.details = { code };
      throw e;
    }
  }

  await updateDepartment(app, tenantId, departmentId, {
    code,
    name,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "DEPARTMENT_UPDATED",
    entityType: "DEPARTMENT",
    entityId: departmentId,
    payload: {
      from: {
        code: current.code,
        name: current.name,
      },
      to: {
        code,
        name,
      },
    },
  });

  return await getDepartmentById(app, tenantId, departmentId);
}

export async function deleteDepartmentService(app, req, departmentId) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getDepartmentByIdForDelete(app, tenantId, departmentId);
  if (!current) {
    const e = new Error("Department not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const dependencies = await countDepartmentDeleteDependencies(app, tenantId, departmentId);
  if (dependencies.total > 0) {
    const e = new Error("Department is still in use");
    e.statusCode = 409;
    e.code = "DEPARTMENT_IN_USE";
    e.details = dependencies;
    throw e;
  }

  await app.pg.query("BEGIN");
  try {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "DEPARTMENT_DELETED",
      entityType: "DEPARTMENT",
      entityId: departmentId,
      payload: {
        id: Number(current.id),
        tenant_id: Number(current.tenant_id),
        code: current.code,
        name: current.name,
      },
    });

    const deleted = await deleteDepartmentById(app, tenantId, departmentId);
    if (!deleted) {
      throw Object.assign(new Error("Department not found"), {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    await app.pg.query("COMMIT");
    return deleted;
  } catch (error) {
    await app.pg.query("ROLLBACK");
    throw error;
  }
}

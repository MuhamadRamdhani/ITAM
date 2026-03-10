import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

import {
  getTenantById,
  getTenantByCode,
  listTenants,
  insertTenant,
  updateTenant,
  seedTenantUiSettings,
  seedTenantRoles,
  countUsersByTenant,
  countAssetsByTenant,
  countDocumentsByTenant,
  countPendingApprovalsByTenant,
} from "./superadmin.repo.js";

function actorStr(req) {
  const a = req.actor;
  if (a?.type === "USER" && a?.id) return `USER:${a.id}`;
  return "SYSTEM";
}

function mustBeSuperadmin(req) {
  const roles = Array.isArray(req.requestContext?.roles)
    ? req.requestContext.roles
    : [];

  if (!roles.includes("SUPERADMIN")) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: ["SUPERADMIN"], got: roles };
    throw e;
  }
}

function toUpperOrNull(v) {
  if (v == null) return null;
  return String(v).trim().toUpperCase();
}

function normCode(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function validateTenantCode(code) {
  if (!code) {
    const e = new Error("Tenant code is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,49}$/.test(code)) {
    const e = new Error(
      "Invalid tenant code. Use lowercase letters, numbers, underscore, or dash (2-50 chars)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { code };
    throw e;
  }
}

function validateStatusCode(statusCode) {
  const s = toUpperOrNull(statusCode) || "ACTIVE";
  if (s !== "ACTIVE" && s !== "SUSPENDED") {
    const e = new Error("Invalid status_code (must be ACTIVE|SUSPENDED)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return s;
}

function validatePlanCode(planCode) {
  const p = toUpperOrNull(planCode) || "STANDARD";
  if (p !== "FREE" && p !== "STANDARD" && p !== "ENTERPRISE") {
    const e = new Error(
      "Invalid plan_code (must be FREE|STANDARD|ENTERPRISE)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return p;
}

function validateName(name) {
  const v = String(name || "").trim();
  if (!v) {
    const e = new Error("Tenant name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return v;
}

async function resolvePageSizeStrict(app, actorTenantId, requested) {
  const cfg = await getUiConfig(app, actorTenantId);
  const options = Array.isArray(cfg.page_size_options)
    ? cfg.page_size_options
    : [];
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

export async function listTenantsService(app, req, { q, statusCode, page, pageSize }) {
  mustBeSuperadmin(req);

  const actorTenantId = Number(req.tenantId || req.requestContext?.tenantId || 1);
  const ps = await resolvePageSizeStrict(app, actorTenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listTenants(app, {
    q: q ? String(q).trim() : null,
    statusCode: statusCode ? String(statusCode).trim().toUpperCase() : null,
    page: p,
    pageSize: ps,
  });

  return {
    items: out.items,
    total: out.total,
    page: p,
    page_size: ps,
  };
}

export async function createTenantService(app, req, body) {
  mustBeSuperadmin(req);

  const code = normCode(body.code);
  const name = validateName(body.name);
  const statusCode = validateStatusCode(body.status_code);
  const planCode = validatePlanCode(body.plan_code);

  validateTenantCode(code);

  const existing = await getTenantByCode(app, code);
  if (existing) {
    const e = new Error("Tenant code already exists");
    e.statusCode = 409;
    e.code = "TENANT_CODE_TAKEN";
    e.details = { code };
    throw e;
  }

  const tenantId = await insertTenant(app, {
    code,
    name,
    statusCode,
    planCode,
  });

  await seedTenantUiSettings(app, tenantId);
  await seedTenantRoles(app, tenantId);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "TENANT_CREATED",
    entityType: "TENANT",
    entityId: tenantId,
    payload: {
      code,
      name,
      status_code: statusCode,
      plan_code: planCode,
    },
  });

  return await getTenantById(app, tenantId);
}

export async function patchTenantService(app, req, tenantId, body) {
  mustBeSuperadmin(req);

  const current = await getTenantById(app, tenantId);
  if (!current) {
    const e = new Error("Tenant not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const patch = {};

  if (body.name != null) {
    patch.name = validateName(body.name);
  }

  if (body.status_code != null) {
    patch.statusCode = validateStatusCode(body.status_code);
  }

  if (body.plan_code != null) {
    patch.planCode = validatePlanCode(body.plan_code);
  }

  await updateTenant(app, tenantId, patch);

  if (patch.name != null && patch.name !== current.name) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "TENANT_UPDATED",
      entityType: "TENANT",
      entityId: tenantId,
      payload: { field: "name", from: current.name, to: patch.name },
    });
  }

  if (patch.statusCode != null && patch.statusCode !== current.status_code) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "TENANT_STATUS_CHANGED",
      entityType: "TENANT",
      entityId: tenantId,
      payload: { from: current.status_code, to: patch.statusCode },
    });
  }

  if (patch.planCode != null && patch.planCode !== current.plan_code) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "TENANT_PLAN_CHANGED",
      entityType: "TENANT",
      entityId: tenantId,
      payload: { from: current.plan_code, to: patch.planCode },
    });
  }

  return await getTenantById(app, tenantId);
}

export async function getTenantSummaryService(app, req, tenantId) {
  mustBeSuperadmin(req);

  const tenant = await getTenantById(app, tenantId);
  if (!tenant) {
    const e = new Error("Tenant not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const [
    usersTotal,
    assetsTotal,
    documentsTotal,
    pendingApprovalsTotal,
  ] = await Promise.all([
    countUsersByTenant(app, tenantId),
    countAssetsByTenant(app, tenantId),
    countDocumentsByTenant(app, tenantId),
    countPendingApprovalsByTenant(app, tenantId),
  ]);

  return {
    tenant,
    summary: {
      users_total: usersTotal,
      assets_total: assetsTotal,
      documents_total: documentsTotal,
      pending_approvals_total: pendingApprovalsTotal,
    },
  };
}
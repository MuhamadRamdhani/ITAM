import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

import {
  getTenantById,
  getTenantByCode,
  listTenants,
  getTenantSubscriptionSummary,
  insertTenant,
  updateTenant,
  seedTenantUiSettings,
  seedTenantRoles,
  seedTenantAssetTypes,
  seedTenantLifecycleStates,
  seedTenantLifecycleTransitions,
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

function validateContractHealthFilter(v) {
  const s = toUpperOrNull(v);
  if (!s) return null;

  const allowed = ["NO_CONTRACT", "ACTIVE", "EXPIRING", "EXPIRED"];
  if (!allowed.includes(s)) {
    const e = new Error(
      "Invalid contract_health (must be NO_CONTRACT|ACTIVE|EXPIRING|EXPIRED)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { contract_health: s };
    throw e;
  }

  return s;
}

function validateTenantSortBy(v) {
  const s = toUpperOrNull(v) || "CONTRACT_END_DATE";
  const allowed = ["ID", "NAME", "CREATED_AT", "CONTRACT_END_DATE"];

  if (!allowed.includes(s)) {
    const e = new Error(
      "Invalid sort_by (must be ID|NAME|CREATED_AT|CONTRACT_END_DATE)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { sort_by: s };
    throw e;
  }

  return s;
}

function validateSortDir(v, fallback = "ASC") {
  const s = toUpperOrNull(v) || fallback;
  if (s !== "ASC" && s !== "DESC") {
    const e = new Error("Invalid sort_dir (must be ASC|DESC)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { sort_dir: s };
    throw e;
  }
  return s;
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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeNullableText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function validateSubscriptionNotes(v) {
  const s = normalizeNullableText(v);
  if (s == null) return null;

  if (s.length > 5000) {
    const e = new Error("subscription_notes is too long (max 5000 chars)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  return s;
}

function parseDateOnly(value) {
  if (!value) return null;
  if (typeof value !== "string") return null;

  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const [y, m, day] = s.split("-").map(Number);
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() + 1 !== m ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  return d;
}

function normalizeDateOnlyInput(value, fieldName) {
  if (value == null) return null;

  const s = String(value).trim();
  if (s === "") return null;

  const d = parseDateOnly(s);
  if (!d) {
    const e = new Error(
      `${fieldName} must be a valid date in YYYY-MM-DD format`
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { field: fieldName, got: value };
    throw e;
  }

  return s;
}

function validateRequiredDateOnly(value, fieldName) {
  const s = normalizeDateOnlyInput(value, fieldName);
  if (!s) {
    const e = new Error(`${fieldName} is required`);
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { field: fieldName };
    throw e;
  }
  return s;
}

function validateContractWindow({
  contractStartDate,
  contractEndDate,
}) {
  const start = parseDateOnly(contractStartDate);
  const end = parseDateOnly(contractEndDate);

  if (start && end && start.getTime() > end.getTime()) {
    const e = new Error(
      "contract_start_date must be less than or equal to contract_end_date"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
}

function todayUtcDateOnly() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function diffDaysUtc(fromDate, toDate) {
  const ms = toDate.getTime() - fromDate.getTime();
  return Math.floor(ms / 86400000);
}

function computeTenantContractHealth(tenant) {
  const end = parseDateOnly(tenant?.contract_end_date ?? null);
  const today = todayUtcDateOnly();

  if (!end) {
    return {
      contract_health: "NO_CONTRACT",
      days_to_expiry: null,
    };
  }

  if (today.getTime() <= end.getTime()) {
    const daysToExpiry = diffDaysUtc(today, end);
    return {
      contract_health: daysToExpiry <= 30 ? "EXPIRING" : "ACTIVE",
      days_to_expiry: daysToExpiry,
    };
  }

  return {
    contract_health: "EXPIRED",
    days_to_expiry: null,
  };
}

function enrichTenant(tenant) {
  if (!tenant) return tenant;
  return {
    ...tenant,
    ...computeTenantContractHealth(tenant),
  };
}

function buildSubscriptionBlock(tenant) {
  const computed = computeTenantContractHealth(tenant);
  return {
    contract_start_date: tenant?.contract_start_date ?? null,
    contract_end_date: tenant?.contract_end_date ?? null,
    subscription_notes: tenant?.subscription_notes ?? null,
    contract_health: computed.contract_health,
    days_to_expiry: computed.days_to_expiry,
  };
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

export async function listTenantsService(
  app,
  req,
  { q, statusCode, contractHealth, sortBy, sortDir, page, pageSize }
) {
  mustBeSuperadmin(req);

  const actorTenantId = Number(req.tenantId || req.requestContext?.tenantId || 1);
  const ps = await resolvePageSizeStrict(app, actorTenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const normalizedStatusCode = statusCode
    ? String(statusCode).trim().toUpperCase()
    : null;

  const normalizedContractHealth = validateContractHealthFilter(contractHealth);
  const normalizedSortBy = validateTenantSortBy(sortBy);
  const normalizedSortDir = validateSortDir(sortDir, "ASC");

  const out = await listTenants(app, {
    q: q ? String(q).trim() : null,
    statusCode: normalizedStatusCode,
    contractHealth: normalizedContractHealth,
    sortBy: normalizedSortBy,
    sortDir: normalizedSortDir,
    page: p,
    pageSize: ps,
  });

  const summary = await getTenantSubscriptionSummary(app, {
    q: q ? String(q).trim() : null,
    statusCode: normalizedStatusCode,
  });

  return {
    items: (out.items || []).map((item) => enrichTenant(item)),
    total: out.total,
    page: p,
    page_size: ps,
    filters: {
      q: q ? String(q).trim() : "",
      status_code: normalizedStatusCode,
      contract_health: normalizedContractHealth,
      sort_by: normalizedSortBy,
      sort_dir: normalizedSortDir,
    },
    summary,
  };
}

export async function createTenantService(app, req, body) {
  mustBeSuperadmin(req);

  const code = normCode(body.code);
  const name = validateName(body.name);
  const statusCode = validateStatusCode(body.status_code);
  const planCode = validatePlanCode(body.plan_code);

  validateTenantCode(code);

  const contractStartDate = validateRequiredDateOnly(
    body.contract_start_date,
    "contract_start_date"
  );

  const contractEndDate = validateRequiredDateOnly(
    body.contract_end_date,
    "contract_end_date"
  );

  const subscriptionNotes = validateSubscriptionNotes(body.subscription_notes);

  validateContractWindow({
    contractStartDate,
    contractEndDate,
  });

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
    contractStartDate,
    contractEndDate,
    subscriptionNotes,
  });

  await seedTenantUiSettings(app, tenantId);
  await seedTenantRoles(app, tenantId);
  await seedTenantAssetTypes(app, tenantId);
  await seedTenantLifecycleStates(app, tenantId);
  await seedTenantLifecycleTransitions(app, tenantId);

  

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
  contract_start_date: contractStartDate,
  contract_end_date: contractEndDate,
  subscription_notes: subscriptionNotes,
  seeded_asset_types: true,
  seeded_lifecycle_states: true,
  seeded_lifecycle_transitions: true,
},
  });

  const tenant = await getTenantById(app, tenantId);
  return enrichTenant(tenant);
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

  if (hasOwn(body, "contract_start_date")) {
    patch.contractStartDate = normalizeDateOnlyInput(
      body.contract_start_date,
      "contract_start_date"
    );
  }

  if (hasOwn(body, "contract_end_date")) {
    patch.contractEndDate = normalizeDateOnlyInput(
      body.contract_end_date,
      "contract_end_date"
    );
  }

  if (hasOwn(body, "subscription_notes")) {
    patch.subscriptionNotes = validateSubscriptionNotes(
      body.subscription_notes
    );
  }

  const nextContractStartDate = hasOwn(patch, "contractStartDate")
    ? patch.contractStartDate
    : current.contract_start_date;

  const nextContractEndDate = hasOwn(patch, "contractEndDate")
    ? patch.contractEndDate
    : current.contract_end_date;

  validateContractWindow({
    contractStartDate: nextContractStartDate,
    contractEndDate: nextContractEndDate,
  });

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

  const subscriptionChanged =
    (hasOwn(patch, "contractStartDate") &&
      patch.contractStartDate !== current.contract_start_date) ||
    (hasOwn(patch, "contractEndDate") &&
      patch.contractEndDate !== current.contract_end_date) ||
    (hasOwn(patch, "subscriptionNotes") &&
      patch.subscriptionNotes !== current.subscription_notes);

  if (subscriptionChanged) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "TENANT_SUBSCRIPTION_UPDATED",
      entityType: "TENANT",
      entityId: tenantId,
      payload: {
        from: {
          contract_start_date: current.contract_start_date,
          contract_end_date: current.contract_end_date,
          subscription_notes: current.subscription_notes,
        },
        to: {
          contract_start_date: nextContractStartDate,
          contract_end_date: nextContractEndDate,
          subscription_notes: hasOwn(patch, "subscriptionNotes")
            ? patch.subscriptionNotes
            : current.subscription_notes,
        },
      },
    });
  }

  const tenant = await getTenantById(app, tenantId);
  return enrichTenant(tenant);
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
    tenant: enrichTenant(tenant),
    subscription: buildSubscriptionBlock(tenant),
    summary: {
      users_total: usersTotal,
      assets_total: assetsTotal,
      documents_total: documentsTotal,
      pending_approvals_total: pendingApprovalsTotal,
    },
  };
}
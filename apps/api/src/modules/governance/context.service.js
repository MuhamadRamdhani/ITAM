import {
  listContextRegisters,
  getContextRegisterById,
  getContextRegisterByIdForDelete,
  insertContextRegister,
  updateContextRegister,
  countContextRegisterDeleteDependencies,
  deleteContextRegisterById,
} from "./context.repo.js";
import { insertAuditEventDb } from "../../lib/audit.js";

function makeError(message, statusCode = 400, code = "BAD_REQUEST", details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}

function getAuthContext(request) {
  return {
    tenant_id:
      request?.tenantId ??
      request?.requestContext?.tenantId ??
      null,
    user_id:
      request?.requestContext?.userId ??
      null,
    roles:
      Array.isArray(request?.requestContext?.roles)
        ? request.requestContext.roles
        : [],
    identity_id:
      request?.requestContext?.identityId ??
      null,
  };
}

function getRoleCodes(request) {
  const auth = getAuthContext(request);
  const raw = Array.isArray(auth?.roles) ? auth.roles : [];

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

function getTenantIdFromRequest(request) {
  const auth = getAuthContext(request);
  const tenantId = Number(auth?.tenant_id);

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw makeError("Tenant context missing", 401, "AUTH_REQUIRED");
  }

  return tenantId;
}

function getActorUserIdFromRequest(request) {
  const auth = getAuthContext(request);
  const userId = Number(auth?.user_id);

  if (!Number.isFinite(userId) || userId <= 0) return null;
  return userId;
}

function actorFromUserId(userId) {
  if (Number.isFinite(userId) && userId > 0) return `USER:${userId}`;
  return "SYSTEM";
}

function assertCanReadContext(request) {
  const roles = getRoleCodes(request);
  const allowed = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER", "AUDITOR"];

  if (!roles.some((r) => allowed.includes(r))) {
    throw makeError("Forbidden", 403, "FORBIDDEN", {
      roles_seen: roles,
    });
  }
}

function assertCanManageContext(request) {
  const roles = getRoleCodes(request);
  const allowed = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

  if (!roles.some((r) => allowed.includes(r))) {
    throw makeError("Forbidden", 403, "FORBIDDEN", {
      roles_seen: roles,
    });
  }
}

function validateCategoryCode(v) {
  const value = String(v ?? "").trim().toUpperCase();
  const allowed = ["INTERNAL", "EXTERNAL"];
  if (!allowed.includes(value)) {
    throw makeError("category_code must be INTERNAL or EXTERNAL", 400, "VALIDATION_ERROR");
  }
  return value;
}

function validatePriorityCode(v) {
  const value = String(v ?? "").trim().toUpperCase();
  const allowed = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (!allowed.includes(value)) {
    throw makeError("priority_code must be LOW, MEDIUM, HIGH, or CRITICAL", 400, "VALIDATION_ERROR");
  }
  return value;
}

function validateStatusCode(v) {
  const value = String(v ?? "").trim().toUpperCase();
  const allowed = ["OPEN", "MONITORING", "CLOSED"];
  if (!allowed.includes(value)) {
    throw makeError("status_code must be OPEN, MONITORING, or CLOSED", 400, "VALIDATION_ERROR");
  }
  return value;
}

function normalizeOptionalIdentityId(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw makeError("owner_identity_id must be a positive integer", 400, "VALIDATION_ERROR");
  }
  return n;
}

function normalizeOptionalReviewDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw makeError("review_date must be in YYYY-MM-DD format", 400, "VALIDATION_ERROR");
  }
  return s;
}

function normalizeTitle(v) {
  const s = String(v ?? "").trim();
  if (!s) {
    throw makeError("title is required", 400, "VALIDATION_ERROR");
  }
  if (s.length > 255) {
    throw makeError("title max length is 255", 400, "VALIDATION_ERROR");
  }
  return s;
}

function normalizeDescription(v) {
  return String(v ?? "").trim();
}

async function withTransaction(db, fn) {
  const canConnect = typeof db.connect === "function";
  const client = canConnect ? await db.connect() : db;

  try {
    if (canConnect) await client.query("BEGIN");
    const result = await fn(client);
    if (canConnect) await client.query("COMMIT");
    return result;
  } catch (err) {
    if (canConnect) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    throw err;
  } finally {
    if (canConnect && typeof client.release === "function") {
      client.release();
    }
  }
}

export async function listContextRegistersService(db, request, query) {
  assertCanReadContext(request);

  const tenantId = getTenantIdFromRequest(request);
  const page = Math.max(1, Number.parseInt(String(query?.page ?? "1"), 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(String(query?.page_size ?? "20"), 10) || 20);

  const statusRaw = String(query?.status ?? "").trim().toUpperCase();
  const categoryRaw = String(query?.category ?? "").trim().toUpperCase();
  const q = String(query?.q ?? "").trim();

  const statusCode = statusRaw && statusRaw !== "ALL" ? statusRaw : "";
  const categoryCode = categoryRaw && categoryRaw !== "ALL" ? categoryRaw : "";

  const offset = (page - 1) * pageSize;

  const data = await listContextRegisters(db, {
    tenantId,
    statusCode,
    categoryCode,
    q,
    limit: pageSize,
    offset,
  });

  return {
    items: data.items,
    total: data.total,
    page,
    page_size: pageSize,
  };
}

export async function getContextRegisterDetailService(db, request, id) {
  assertCanReadContext(request);

  const tenantId = getTenantIdFromRequest(request);
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid context id", 400, "VALIDATION_ERROR");
  }

  const item = await getContextRegisterById(db, {
    tenantId,
    id: numericId,
  });

  if (!item) {
    throw makeError("Context register not found", 404, "NOT_FOUND");
  }

  return item;
}

export async function createContextRegisterService(db, request, body) {
  assertCanManageContext(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);

  const title = normalizeTitle(body?.title);
  const categoryCode = validateCategoryCode(body?.category_code);
  const priorityCode = validatePriorityCode(body?.priority_code ?? "MEDIUM");
  const statusCode = validateStatusCode(body?.status_code ?? "OPEN");
  const description = normalizeDescription(body?.description);
  const ownerIdentityId = normalizeOptionalIdentityId(body?.owner_identity_id);
  const reviewDate = normalizeOptionalReviewDate(body?.review_date);

  const created = await insertContextRegister(db, {
    tenantId,
    title,
    categoryCode,
    priorityCode,
    statusCode,
    description,
    ownerIdentityId,
    reviewDate,
    actorUserId,
  });

  await insertAuditEventDb(db, {
    tenantId,
    actor: actorFromUserId(actorUserId),
    action: "CONTEXT_CREATED",
    entityType: "CONTEXT",
    entityId: created?.id ?? null,
    payload: {
      title,
      category_code: categoryCode,
      priority_code: priorityCode,
      status_code: statusCode,
      owner_identity_id: ownerIdentityId,
      review_date: reviewDate,
    },
  });

  return created;
}

export async function updateContextRegisterService(db, request, id, body) {
  assertCanManageContext(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid context id", 400, "VALIDATION_ERROR");
  }

  const existing = await getContextRegisterById(db, {
    tenantId,
    id: numericId,
  });

  if (!existing) {
    throw makeError("Context register not found", 404, "NOT_FOUND");
  }

  const title = normalizeTitle(body?.title);
  const categoryCode = validateCategoryCode(body?.category_code);
  const priorityCode = validatePriorityCode(body?.priority_code ?? "MEDIUM");
  const statusCode = validateStatusCode(body?.status_code ?? "OPEN");
  const description = normalizeDescription(body?.description);
  const ownerIdentityId = normalizeOptionalIdentityId(body?.owner_identity_id);
  const reviewDate = normalizeOptionalReviewDate(body?.review_date);

  const updated = await updateContextRegister(db, {
    tenantId,
    id: numericId,
    title,
    categoryCode,
    priorityCode,
    statusCode,
    description,
    ownerIdentityId,
    reviewDate,
    actorUserId,
  });

  await insertAuditEventDb(db, {
    tenantId,
    actor: actorFromUserId(actorUserId),
    action: "CONTEXT_UPDATED",
    entityType: "CONTEXT",
    entityId: updated?.id ?? numericId,
    payload: {
      before: {
        title: existing.title,
        category_code: existing.category_code,
        priority_code: existing.priority_code,
        status_code: existing.status_code,
        owner_identity_id: existing.owner_identity_id,
        review_date: existing.review_date,
      },
      after: {
        title,
        category_code: categoryCode,
        priority_code: priorityCode,
        status_code: statusCode,
        owner_identity_id: ownerIdentityId,
        review_date: reviewDate,
      },
    },
  });

  return updated;
}

export async function deleteContextRegisterService(db, request, id) {
  assertCanManageContext(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid context id", 400, "VALIDATION_ERROR");
  }

  return withTransaction(db, async (trx) => {
    const current = await getContextRegisterByIdForDelete(trx, {
      tenantId,
      id: numericId,
    });

    if (!current) {
      throw makeError("Context register not found", 404, "NOT_FOUND");
    }

    const dependencies = await countContextRegisterDeleteDependencies(trx, {
      tenantId,
      id: numericId,
    });
    if (dependencies.total > 0) {
      throw makeError(
        "Context register is still in use",
        409,
        "CONTEXT_REGISTER_IN_USE",
        dependencies
      );
    }

    await insertAuditEventDb(trx, {
      tenantId,
      actor: actorFromUserId(actorUserId),
      action: "CONTEXT_REGISTER_DELETED",
      entityType: "CONTEXT_REGISTER",
      entityId: numericId,
      payload: {
        id: Number(current.id),
        tenant_id: Number(current.tenant_id),
        title: current.title ?? null,
        category_code: current.category_code ?? null,
        priority_code: current.priority_code ?? null,
        status_code: current.status_code ?? null,
        owner_identity_id: current.owner_identity_id ?? null,
        review_date: current.review_date ?? null,
      },
    });

    const deleted = await deleteContextRegisterById(trx, {
      tenantId,
      id: numericId,
    });

    if (!deleted) {
      throw makeError("Context register not found", 404, "NOT_FOUND");
    }

    return deleted;
  });
}

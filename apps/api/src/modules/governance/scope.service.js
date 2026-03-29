import {
  listScopeVersions,
  getScopeVersionById,
  listScopeEventsByVersionId,
  getNextScopeVersionNo,
  insertScopeVersion,
  updateScopeVersionStatus,
  getActiveScopeVersion,
  markScopeVersionSuperseded,
  forceScopeVersionActive,
  insertScopeEvent,
} from "./scope.repo.js";
import { insertAuditEventDb } from "../../lib/audit.js";

function makeError(message, statusCode = 400, code = "BAD_REQUEST", details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw makeError(`${fieldName} must be a JSON object`, 400, "VALIDATION_ERROR");
  }
}

export function getAuthContext(request) {
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

export function getRoleCodes(request) {
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

export function getTenantIdFromRequest(request) {
  const auth = getAuthContext(request);
  const tenantId = Number(auth?.tenant_id);

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw makeError("Tenant context missing", 401, "AUTH_REQUIRED");
  }

  return tenantId;
}

export function getActorUserIdFromRequest(request) {
  const auth = getAuthContext(request);
  const userId = Number(auth?.user_id);

  if (!Number.isFinite(userId) || userId <= 0) return null;
  return userId;
}

function actorFromUserId(userId) {
  if (Number.isFinite(userId) && userId > 0) return `USER:${userId}`;
  return "SYSTEM";
}

export function assertCanReadScope(request) {
  const roles = getRoleCodes(request);
  const allowed = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER", "AUDITOR"];

  if (!roles.some((r) => allowed.includes(r))) {
    throw makeError("Forbidden", 403, "FORBIDDEN", {
      roles_seen: roles,
    });
  }
}

export function assertCanManageScope(request) {
  const roles = getRoleCodes(request);
  const allowed = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];

  if (!roles.some((r) => allowed.includes(r))) {
    throw makeError("Forbidden", 403, "FORBIDDEN", {
      roles_seen: roles,
    });
  }
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

export async function listScopeVersionsService(db, request, query) {
  assertCanReadScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const page = Math.max(1, Number.parseInt(String(query?.page ?? "1"), 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(String(query?.page_size ?? "20"), 10) || 20);
  const statusRaw = String(query?.status ?? "").trim().toUpperCase();
  const status = statusRaw && statusRaw !== "ALL" ? statusRaw : "";

  const offset = (page - 1) * pageSize;

  const data = await listScopeVersions(db, {
    tenantId,
    status,
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

export async function getScopeVersionDetailService(db, request, id) {
  assertCanReadScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid scope version id", 400, "VALIDATION_ERROR");
  }

  const version = await getScopeVersionById(db, {
    tenantId,
    id: numericId,
  });

  if (!version) {
    throw makeError("Scope version not found", 404, "NOT_FOUND");
  }

  const events = await listScopeEventsByVersionId(db, {
    tenantId,
    scopeVersionId: numericId,
  });

  return {
    version,
    events,
  };
}

export async function createScopeVersionService(db, request, body) {
  assertCanManageScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);

  const scopeJson = body?.scope_json ?? {};
  const note = body?.note ?? null;

  assertObject(scopeJson, "scope_json");

  return withTransaction(db, async (trx) => {
    const versionNo = await getNextScopeVersionNo(trx, { tenantId });

    const created = await insertScopeVersion(trx, {
      tenantId,
      versionNo,
      scopeJson,
      note,
      actorUserId,
    });

    await insertScopeEvent(trx, {
      tenantId,
      scopeVersionId: created.id,
      eventType: "SCOPE_VERSION_CREATED",
      actorUserId,
      note,
      eventPayload: {
        status: created.status,
        version_no: created.version_no,
      },
    });

    await insertAuditEventDb(trx, {
      tenantId,
      actor: actorFromUserId(actorUserId),
      action: "SCOPE_VERSION_CREATED",
      entityType: "SCOPE_VERSION",
      entityId: created.id,
      payload: {
        status: created.status,
        version_no: created.version_no,
      },
    });

    return created;
  });
}

export async function submitScopeVersionService(db, request, id, body) {
  assertCanManageScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);
  const numericId = Number(id);
  const note = body?.note ?? null;

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid scope version id", 400, "VALIDATION_ERROR");
  }

  return withTransaction(db, async (trx) => {
    const updated = await updateScopeVersionStatus(trx, {
      tenantId,
      id: numericId,
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actorUserId,
      note,
      setSubmittedAt: true,
    });

    if (!updated) {
      throw makeError("Only DRAFT scope version can be submitted", 409, "INVALID_STATE");
    }

    await insertScopeEvent(trx, {
      tenantId,
      scopeVersionId: numericId,
      eventType: "SCOPE_VERSION_SUBMITTED",
      actorUserId,
      note,
      eventPayload: {
        from_status: "DRAFT",
        to_status: "SUBMITTED",
      },
    });

    await insertAuditEventDb(trx, {
      tenantId,
      actor: actorFromUserId(actorUserId),
      action: "SCOPE_VERSION_SUBMITTED",
      entityType: "SCOPE_VERSION",
      entityId: numericId,
      payload: { from_status: "DRAFT", to_status: "SUBMITTED", note: note ?? null },
    });

    return updated;
  });
}

export async function approveScopeVersionService(db, request, id, body) {
  assertCanManageScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);
  const numericId = Number(id);
  const note = body?.note ?? null;

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid scope version id", 400, "VALIDATION_ERROR");
  }

  return withTransaction(db, async (trx) => {
    const updated = await updateScopeVersionStatus(trx, {
      tenantId,
      id: numericId,
      fromStatus: "SUBMITTED",
      toStatus: "APPROVED",
      actorUserId,
      note,
      setApprovedAt: true,
    });

    if (!updated) {
      throw makeError("Only SUBMITTED scope version can be approved", 409, "INVALID_STATE");
    }

    await insertScopeEvent(trx, {
      tenantId,
      scopeVersionId: numericId,
      eventType: "SCOPE_VERSION_APPROVED",
      actorUserId,
      note,
      eventPayload: {
        from_status: "SUBMITTED",
        to_status: "APPROVED",
      },
    });

    await insertAuditEventDb(trx, {
      tenantId,
      actor: actorFromUserId(actorUserId),
      action: "SCOPE_VERSION_APPROVED",
      entityType: "SCOPE_VERSION",
      entityId: numericId,
      payload: { from_status: "SUBMITTED", to_status: "APPROVED", note: note ?? null },
    });

    return updated;
  });
}

export async function activateScopeVersionService(db, request, id, body) {
  assertCanManageScope(request);

  const tenantId = getTenantIdFromRequest(request);
  const actorUserId = getActorUserIdFromRequest(request);
  const numericId = Number(id);
  const note = body?.note ?? null;

  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw makeError("Invalid scope version id", 400, "VALIDATION_ERROR");
  }

  return withTransaction(db, async (trx) => {
    const target = await getScopeVersionById(trx, {
      tenantId,
      id: numericId,
    });

    if (!target) {
      throw makeError("Scope version not found", 404, "NOT_FOUND");
    }

    if (String(target.status).toUpperCase() !== "APPROVED") {
      throw makeError("Only APPROVED scope version can be activated", 409, "INVALID_STATE");
    }

    const currentActive = await getActiveScopeVersion(trx, { tenantId });

    if (currentActive && Number(currentActive.id) !== numericId) {
      const superseded = await markScopeVersionSuperseded(trx, {
        tenantId,
        id: currentActive.id,
        actorUserId,
        note: "Auto-superseded by new active scope version",
      });

      if (superseded) {
        await insertScopeEvent(trx, {
          tenantId,
          scopeVersionId: superseded.id,
          eventType: "SCOPE_VERSION_SUPERSEDED",
          actorUserId,
          note: "Auto-superseded by new active scope version",
          eventPayload: {
            replaced_by_scope_version_id: numericId,
          },
        });

        await insertAuditEventDb(trx, {
          tenantId,
          actor: actorFromUserId(actorUserId),
          action: "SCOPE_VERSION_SUPERSEDED",
          entityType: "SCOPE_VERSION",
          entityId: superseded.id,
          payload: { replaced_by_scope_version_id: numericId },
        });
      }
    }

    const activated = await forceScopeVersionActive(trx, {
      tenantId,
      id: numericId,
      actorUserId,
      note,
    });

    if (!activated) {
      throw makeError("Failed to activate scope version", 409, "INVALID_STATE");
    }

    await insertScopeEvent(trx, {
      tenantId,
      scopeVersionId: numericId,
      eventType: "SCOPE_VERSION_ACTIVATED",
      actorUserId,
      note,
      eventPayload: {
        from_status: "APPROVED",
        to_status: "ACTIVE",
      },
    });

    await insertAuditEventDb(trx, {
      tenantId,
      actor: actorFromUserId(actorUserId),
      action: "SCOPE_VERSION_ACTIVATED",
      entityType: "SCOPE_VERSION",
      entityId: numericId,
      payload: { from_status: "APPROVED", to_status: "ACTIVE", note: note ?? null },
    });

    return activated;
  });
}

import { listAuditEvents } from "./audit-events.repo.js";

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

function assertCanReadAuditEvents(request) {
  const roles = getRoleCodes(request);
  const allowed = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER", "AUDITOR"];

  if (!roles.some((r) => allowed.includes(r))) {
    throw makeError("Forbidden", 403, "FORBIDDEN", {
      roles_seen: roles,
    });
  }
}

function normalizeUpperOrEmpty(v) {
  const s = String(v ?? "").trim().toUpperCase();
  return s || "";
}

function normalizeOptionalPositiveInt(v, fieldName) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw makeError(`${fieldName} must be a positive integer`, 400, "VALIDATION_ERROR");
  }
  return n;
}

function normalizeOptionalDate(v, fieldName) {
  if (!v) return "";
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw makeError(`${fieldName} must be in YYYY-MM-DD format`, 400, "VALIDATION_ERROR");
  }
  return s;
}

export async function listAuditEventsService(db, request, query) {
  assertCanReadAuditEvents(request);

  const tenantId = getTenantIdFromRequest(request);

  const page = Math.max(1, Number.parseInt(String(query?.page ?? "1"), 10) || 1);
  const pageSize = Math.max(1, Number.parseInt(String(query?.page_size ?? "20"), 10) || 20);

  const actor = String(query?.actor ?? "").trim();
  const action = normalizeUpperOrEmpty(query?.action);
  const entityType = normalizeUpperOrEmpty(query?.entity_type);
  const entityId = normalizeOptionalPositiveInt(query?.entity_id, "entity_id");
  const dateFrom = normalizeOptionalDate(query?.date_from, "date_from");
  const dateTo = normalizeOptionalDate(query?.date_to, "date_to");
  const q = String(query?.q ?? "").trim();

  const offset = (page - 1) * pageSize;

  const data = await listAuditEvents(db, {
    tenantId,
    actor,
    action,
    entityType,
    entityId,
    dateFrom,
    dateTo,
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
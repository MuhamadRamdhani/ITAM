import { getDashboardSummary } from "./dashboard.repo.js";

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

function getTenantIdFromRequest(request) {
  const auth = getAuthContext(request);
  const tenantId = Number(auth?.tenant_id);

  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw makeError("Tenant context missing", 401, "AUTH_REQUIRED");
  }

  return tenantId;
}

/**
 * Dashboard summary saya buka untuk semua user yang sudah authenticated
 * supaya homepage tidak pecah untuk role-role operasional.
 * Kalau nanti ingin dipersempit, tinggal tambah role check di sini.
 */
export async function getDashboardSummaryService(db, request) {
  const tenantId = getTenantIdFromRequest(request);
  const data = await getDashboardSummary(db, { tenantId });
  return data;
}
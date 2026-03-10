import { insertAuditEvent } from "../../lib/audit.js";
import {
  listAssetTypesAdmin,
  getAssetTypeByIdAdmin,
  updateAssetTypeDisplayName,
  listLifecycleStatesAdmin,
  getLifecycleStateByIdAdmin,
  updateLifecycleStateDisplayName,
} from "./admin-config.repo.js.js";

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
  const roles = Array.isArray(req.requestContext?.roles)
    ? req.requestContext.roles
    : [];
  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowed, got: roles };
    throw e;
  }
}

function validateDisplayName(displayName, label) {
  const v = String(displayName || "").trim();
  if (!v) {
    const e = new Error(`${label} display_name is required`);
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return v;
}

export async function listAssetTypesAdminService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await listAssetTypesAdmin(app, tenantId);
}

export async function patchAssetTypeAdminService(app, req, id, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getAssetTypeByIdAdmin(app, tenantId, id);
  if (!current) {
    const e = new Error("Asset type not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const displayName = validateDisplayName(body.display_name, "Asset type");

  await updateAssetTypeDisplayName(app, tenantId, id, displayName);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "ASSET_TYPE_UPDATED",
    entityType: "ASSET_TYPE",
    entityId: id,
    payload: {
      code: current.code,
      from_display_name: current.display_name,
      to_display_name: displayName,
    },
  });

  return await getAssetTypeByIdAdmin(app, tenantId, id);
}

export async function listLifecycleStatesAdminService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);
  return await listLifecycleStatesAdmin(app, tenantId);
}

export async function patchLifecycleStateAdminService(app, req, id, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getLifecycleStateByIdAdmin(app, tenantId, id);
  if (!current) {
    const e = new Error("Lifecycle state not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const displayName = validateDisplayName(body.display_name, "Lifecycle state");

  await updateLifecycleStateDisplayName(app, tenantId, id, displayName);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "LIFECYCLE_STATE_UPDATED",
    entityType: "LIFECYCLE_STATE",
    entityId: id,
    payload: {
      code: current.code,
      from_display_name: current.display_name,
      to_display_name: displayName,
      sort_order: current.sort_order,
    },
  });

  return await getLifecycleStateByIdAdmin(app, tenantId, id);
}
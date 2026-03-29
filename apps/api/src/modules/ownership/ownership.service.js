import { insertAuditEvent } from "../../lib/audit.js";
import {
  getAssetById,
  getOwnershipHistory,
  getCurrentOwnershipHistory,
  departmentExists,
  identityExists,
  locationExists,
  changeOwnership,
} from "./ownership.repo.js";

// ===== HELPERS =====

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

function validateDepartmentIdOrNull(v) {
  if (v == null) return null;
  const id = Number(v);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error("Invalid owner_department_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return id;
}

function validateIdentityIdOrNull(v) {
  if (v == null) return null;
  const id = Number(v);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error("Invalid custodian_identity_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return id;
}

function validateLocationIdOrNull(v) {
  if (v == null) return null;
  const id = Number(v);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error("Invalid location_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return id;
}

function validateReasonOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

// ===== SERVICES =====

export async function listOwnershipHistoryService(app, req, assetId) {
  const tenantId = mustTenantId(req);
  const assetIdNum = Number(assetId);

  if (!Number.isFinite(assetIdNum) || assetIdNum <= 0) {
    const e = new Error("Invalid asset_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  // Verify asset exists
  const asset = await getAssetById(app, tenantId, assetIdNum);
  if (!asset) {
    const e = new Error("Asset not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const histories = await getOwnershipHistory(app, tenantId, assetIdNum);
  return { items: histories };
}

export async function changeOwnershipService(
  app,
  req,
  assetId,
  body
) {
  const tenantId = mustTenantId(req);

  // RBAC: Only TENANT_ADMIN, ITAM_MANAGER, or ASSET_CUSTODIAN can change ownership
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"]);

  const assetIdNum = Number(assetId);
  if (!Number.isFinite(assetIdNum) || assetIdNum <= 0) {
    const e = new Error("Invalid asset_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  // Validate body
  const bodyObj = body || {};
  const ownerDepartmentId = validateDepartmentIdOrNull(
    bodyObj.owner_department_id
  );
  const custodianIdentityId = validateIdentityIdOrNull(
    bodyObj.custodian_identity_id
  );
  const locationId = validateLocationIdOrNull(bodyObj.location_id);
  const changeReason = validateReasonOrNull(bodyObj.change_reason);

  // At least one field must be provided
  if (
    ownerDepartmentId == null &&
    custodianIdentityId == null &&
    locationId == null
  ) {
    const e = new Error(
      "At least one of owner_department_id, custodian_identity_id, or location_id must be provided"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  // Verify asset exists
  const asset = await getAssetById(app, tenantId, assetIdNum);
  if (!asset) {
    const e = new Error("Asset not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  // Verify references
  if (ownerDepartmentId != null) {
    const ok = await departmentExists(app, tenantId, ownerDepartmentId);
    if (!ok) {
      const e = new Error("owner_department_id not found");
      e.statusCode = 400;
      e.code = "INVALID_REF";
      throw e;
    }
  }

  if (custodianIdentityId != null) {
    const ok = await identityExists(app, tenantId, custodianIdentityId);
    if (!ok) {
      const e = new Error("custodian_identity_id not found");
      e.statusCode = 400;
      e.code = "INVALID_REF";
      throw e;
    }
  }

  if (locationId != null) {
    const ok = await locationExists(app, tenantId, locationId);
    if (!ok) {
      const e = new Error("location_id not found");
      e.statusCode = 400;
      e.code = "INVALID_REF";
      throw e;
    }
  }

  // Get current state for audit payload
  const currentOwnership = await getCurrentOwnershipHistory(
    app,
    tenantId,
    assetIdNum
  );

  // Perform change
  const result = await changeOwnership(app, {
    tenantId,
    assetId: assetIdNum,
    ownerDepartmentId: ownerDepartmentId ?? asset.owner_department_id,
    custodianIdentityId:
      custodianIdentityId ?? asset.current_custodian_identity_id,
    locationId: locationId ?? asset.location_id,
    changeReason,
    changedBy: actorStr(req),
  });

  // Audit: ownership changed
  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "OWNERSHIP_CHANGED",
    entityType: "ASSET",
    entityId: assetIdNum,
    payload: {
      ownership_history_id: result.id,
      from_owner_department_id: currentOwnership?.owner_department_id ?? null,
      to_owner_department_id: ownerDepartmentId ?? asset.owner_department_id,
      from_custodian_identity_id:
        currentOwnership?.custodian_identity_id ?? null,
      to_custodian_identity_id:
        custodianIdentityId ?? asset.current_custodian_identity_id,
      from_location_id: currentOwnership?.location_id ?? null,
      to_location_id: locationId ?? asset.location_id,
      change_reason: changeReason,
    },
  });

  return {
    ok: true,
    data: {
      id: result.id,
      asset_id: assetIdNum,
      effective_from: result.effective_from,
    },
  };
}

// Convenience service for changing just owner
export async function changeOwnerService(app, req, assetId, body) {
  const bodyObj = body || {};
  return changeOwnershipService(app, req, assetId, {
    owner_department_id: bodyObj.owner_department_id,
  });
}

// Convenience service for changing just custodian
export async function changeCustodianService(app, req, assetId, body) {
  const bodyObj = body || {};
  return changeOwnershipService(app, req, assetId, {
    custodian_identity_id: bodyObj.custodian_identity_id,
    change_reason: bodyObj.change_reason,
  });
}

// Convenience service for changing just location
export async function changeLocationService(app, req, assetId, body) {
  const bodyObj = body || {};
  return changeOwnershipService(app, req, assetId, {
    location_id: bodyObj.location_id,
    change_reason: bodyObj.change_reason,
  });
}

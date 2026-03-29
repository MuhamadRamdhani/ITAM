import {
  getSoftwareEntitlementById,
  getAssetById,
  getSoftwareInstallationByAssetAndId,
  getSoftwareAssignmentByAssetAndId,
  getActiveAllocatedQuantityByEntitlement,
  findActiveDuplicateAllocation,
  getEntitlementAllocationByEntitlementAndId,
  getEntitlementAllocationDetailById,
  listEntitlementAllocations,
  createEntitlementAllocation,
  updateEntitlementAllocation,
} from "./software-entitlement-allocations.repo.js";

const READ_ROLES = new Set([
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
  "AUDITOR",
]);

const WRITE_ROLES = new Set([
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
]);

const ALLOWED_BASIS = new Set([
  "INSTALLATION",
  "ASSIGNMENT",
  "ASSET",
  "MANUAL",
]);

const ALLOWED_STATUS = new Set([
  "ACTIVE",
  "RELEASED",
]);

function appError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function getTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId;
  const parsed = Number(tenantId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw appError(401, "UNAUTHORIZED", "Tenant context is missing.");
  }

  return parsed;
}

function getRoleCodes(req) {
  const source = req?.requestContext?.roles;
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return item.role_code || item.roleCode || item.code || null;
      }
      return null;
    })
    .filter(Boolean)
    .map((item) => String(item).trim().toUpperCase());
}

function assertAllowed(req, allowedRoles, actionLabel) {
  const roles = getRoleCodes(req);

  if (roles.length === 0) return;

  const allowed = roles.some((role) => allowedRoles.has(role));
  if (!allowed) {
    throw appError(403, "FORBIDDEN", `You are not allowed to ${actionLabel}.`);
  }
}

function parsePositiveInt(value, code, fieldLabel) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw appError(400, code, `${fieldLabel} is invalid.`);
  }
  return parsed;
}

function normalizeNullableString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeNullableDate(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  if (!text) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw appError(400, "VALIDATION_ERROR", `${fieldName} must be YYYY-MM-DD.`);
  }

  return text;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeBasis(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (!ALLOWED_BASIS.has(text)) {
    throw appError(400, "INVALID_ALLOCATION_BASIS", "allocation_basis is invalid.");
  }
  return text;
}

function normalizeStatus(value, fallback = "ACTIVE") {
  const text = String(value ?? fallback).trim().toUpperCase();
  if (!ALLOWED_STATUS.has(text)) {
    throw appError(400, "INVALID_ALLOCATION_STATUS", "status is invalid.");
  }
  return text;
}

function normalizeCreatePayload(body) {
  const allocationBasis = normalizeBasis(body?.allocation_basis);
  const status = normalizeStatus(body?.status, "ACTIVE");

  let releasedAt = normalizeNullableDate(body?.released_at, "released_at");
  if (status !== "RELEASED") {
    releasedAt = null;
  }

  return {
    asset_id: parsePositiveInt(body?.asset_id, "ASSET_ID_INVALID", "asset_id"),
    software_installation_id:
      body?.software_installation_id == null || body?.software_installation_id === ""
        ? null
        : parsePositiveInt(
            body.software_installation_id,
            "SOFTWARE_INSTALLATION_ID_INVALID",
            "software_installation_id"
          ),
    software_assignment_id:
      body?.software_assignment_id == null || body?.software_assignment_id === ""
        ? null
        : parsePositiveInt(
            body.software_assignment_id,
            "SOFTWARE_ASSIGNMENT_ID_INVALID",
            "software_assignment_id"
          ),
    allocation_basis: allocationBasis,
    allocated_quantity: parsePositiveInt(
      body?.allocated_quantity,
      "ALLOCATED_QUANTITY_INVALID",
      "allocated_quantity"
    ),
    status,
    allocated_at: normalizeNullableDate(body?.allocated_at, "allocated_at"),
    released_at: releasedAt,
    notes: normalizeNullableString(body?.notes),
  };
}

function normalizePatchPayload(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    patch.status = normalizeStatus(body.status);
  }

  if (Object.prototype.hasOwnProperty.call(body, "released_at")) {
    patch.released_at = normalizeNullableDate(body.released_at, "released_at");
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = normalizeNullableString(body.notes);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "status") &&
    patch.status === "RELEASED" &&
    !Object.prototype.hasOwnProperty.call(patch, "released_at")
  ) {
    patch.released_at = todayIsoDate();
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "status") &&
    patch.status === "ACTIVE" &&
    !Object.prototype.hasOwnProperty.call(patch, "released_at")
  ) {
    patch.released_at = null;
  }

  return patch;
}

function validateBasisTargets(payload) {
  const basis = payload.allocation_basis;

  if (basis === "INSTALLATION") {
    if (!payload.software_installation_id) {
      throw appError(
        400,
        "SOFTWARE_INSTALLATION_REQUIRED",
        "software_installation_id is required for INSTALLATION basis."
      );
    }
    if (payload.software_assignment_id) {
      throw appError(
        400,
        "SOFTWARE_ASSIGNMENT_NOT_ALLOWED",
        "software_assignment_id must be null for INSTALLATION basis."
      );
    }
  }

  if (basis === "ASSIGNMENT") {
    if (!payload.software_assignment_id) {
      throw appError(
        400,
        "SOFTWARE_ASSIGNMENT_REQUIRED",
        "software_assignment_id is required for ASSIGNMENT basis."
      );
    }
  }

  if (basis === "ASSET" || basis === "MANUAL") {
    if (payload.software_installation_id || payload.software_assignment_id) {
      throw appError(
        400,
        "TARGET_NOT_ALLOWED",
        "software_installation_id and software_assignment_id must be null for this basis."
      );
    }
  }
}

async function safeWriteAuditEvent(app, req, event) {
  try {
    if (typeof app?.writeAuditEvent === "function") {
      await app.writeAuditEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT_ALLOCATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    if (typeof app?.audit?.writeEvent === "function") {
      await app.audit.writeEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT_ALLOCATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    app.log?.info?.(
      {
        audit_fallback: true,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT_ALLOCATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      },
      "software entitlement allocation audit event"
    );
  } catch (err) {
    app.log?.error?.(err, "failed to write software entitlement allocation audit event");
  }
}

export async function listEntitlementAllocationsService(app, req) {
  assertAllowed(req, READ_ROLES, "read software entitlement allocations");

  const tenantId = getTenantId(req);
  const entitlementId = parsePositiveInt(
    req.params?.id,
    "SOFTWARE_ENTITLEMENT_ID_INVALID",
    "software_entitlement_id"
  );

  const entitlement = await getSoftwareEntitlementById(app, tenantId, entitlementId);
  if (!entitlement) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_NOT_FOUND",
      "Software entitlement not found."
    );
  }

  const items = await listEntitlementAllocations(app, tenantId, entitlementId);
  const allocatedQuantityActive = await getActiveAllocatedQuantityByEntitlement(
    app,
    tenantId,
    entitlementId
  );

  return {
    summary: {
      software_entitlement_id: Number(entitlement.id),
      entitlement_code: entitlement.entitlement_code,
      entitlement_name: entitlement.entitlement_name,
      quantity_purchased: Number(entitlement.quantity_purchased ?? 0),
      allocated_quantity_active: allocatedQuantityActive,
      remaining_quantity:
        Number(entitlement.quantity_purchased ?? 0) - allocatedQuantityActive,
      entitlement_status: entitlement.status,
      software_product_id: Number(entitlement.software_product_id),
      software_product_code: entitlement.software_product_code,
      software_product_name: entitlement.software_product_name,
      contract_id: Number(entitlement.contract_id),
      contract_code: entitlement.contract_code,
      contract_name: entitlement.contract_name,
    },
    items,
    total: items.length,
  };
}

export async function createEntitlementAllocationService(app, req) {
  assertAllowed(req, WRITE_ROLES, "create software entitlement allocations");

  const tenantId = getTenantId(req);
  const entitlementId = parsePositiveInt(
    req.params?.id,
    "SOFTWARE_ENTITLEMENT_ID_INVALID",
    "software_entitlement_id"
  );
  const payload = normalizeCreatePayload(req.body || {});

  validateBasisTargets(payload);

  const entitlement = await getSoftwareEntitlementById(app, tenantId, entitlementId);
  if (!entitlement) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_NOT_FOUND",
      "Software entitlement not found."
    );
  }

  if (String(entitlement.status || "").toUpperCase() !== "ACTIVE" && payload.status === "ACTIVE") {
    throw appError(
      400,
      "SOFTWARE_ENTITLEMENT_NOT_ACTIVE",
      "Cannot create active allocation for inactive entitlement."
    );
  }

  const quantityPurchased = Number(entitlement.quantity_purchased ?? 0);
  if (quantityPurchased <= 0 && payload.status === "ACTIVE") {
    throw appError(
      400,
      "SOFTWARE_ENTITLEMENT_ZERO_QUANTITY",
      "Cannot create active allocation because entitlement quantity is zero."
    );
  }

  const asset = await getAssetById(app, tenantId, payload.asset_id);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  let installation = null;
  if (payload.software_installation_id) {
    installation = await getSoftwareInstallationByAssetAndId(
      app,
      tenantId,
      payload.asset_id,
      payload.software_installation_id
    );
    if (!installation) {
      throw appError(
        404,
        "SOFTWARE_INSTALLATION_NOT_FOUND",
        "Software installation not found."
      );
    }
  }

  let assignment = null;
  if (payload.software_assignment_id) {
    assignment = await getSoftwareAssignmentByAssetAndId(
      app,
      tenantId,
      payload.asset_id,
      payload.software_assignment_id
    );
    if (!assignment) {
      throw appError(
        404,
        "SOFTWARE_ASSIGNMENT_NOT_FOUND",
        "Software assignment not found."
      );
    }

    if (
      payload.software_installation_id &&
      Number(assignment.software_installation_id) !== Number(payload.software_installation_id)
    ) {
      throw appError(
        400,
        "SOFTWARE_ASSIGNMENT_INSTALLATION_MISMATCH",
        "software_assignment_id does not belong to the provided software_installation_id."
      );
    }

    if (!payload.software_installation_id) {
      payload.software_installation_id = Number(assignment.software_installation_id);
      installation = await getSoftwareInstallationByAssetAndId(
        app,
        tenantId,
        payload.asset_id,
        payload.software_installation_id
      );
    }
  }

  if (
    installation &&
    Number(installation.software_product_id) !== Number(entitlement.software_product_id)
  ) {
    throw appError(
      400,
      "SOFTWARE_PRODUCT_MISMATCH",
      "Software installation product does not match entitlement software product."
    );
  }

  if (assignment && String(assignment.assignment_status || "").toUpperCase() !== "ACTIVE") {
    throw appError(
      400,
      "SOFTWARE_ASSIGNMENT_NOT_ACTIVE",
      "Cannot create active allocation for revoked assignment."
    );
  }

  if (payload.status === "ACTIVE") {
    const duplicate = await findActiveDuplicateAllocation(
      app,
      tenantId,
      entitlementId,
      payload.allocation_basis,
      payload.asset_id,
      payload.software_installation_id,
      payload.software_assignment_id
    );

    if (duplicate) {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALLOCATION_ALREADY_EXISTS",
        "Active allocation already exists for this target."
      );
    }

    const activeAllocated = await getActiveAllocatedQuantityByEntitlement(
      app,
      tenantId,
      entitlementId
    );

    if (activeAllocated + payload.allocated_quantity > quantityPurchased) {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALLOCATION_EXCEEDS_AVAILABLE",
        "Allocated quantity exceeds entitlement available quantity."
      );
    }
  }

  const created = await createEntitlementAllocation(app, {
    tenant_id: tenantId,
    software_entitlement_id: entitlementId,
    asset_id: payload.asset_id,
    software_installation_id: payload.software_installation_id,
    software_assignment_id: payload.software_assignment_id,
    allocation_basis: payload.allocation_basis,
    allocated_quantity: payload.allocated_quantity,
    status: payload.status,
    allocated_at: payload.allocated_at,
    released_at: payload.released_at,
    notes: payload.notes,
  });

  const detail = await getEntitlementAllocationDetailById(app, tenantId, created.id);

  await safeWriteAuditEvent(app, req, {
    action_code: "SOFTWARE_ENTITLEMENT_ALLOCATION_CREATED",
    entity_id: created.id,
    metadata: {
      software_entitlement_id: entitlementId,
      asset_id: payload.asset_id,
      software_installation_id: payload.software_installation_id,
      software_assignment_id: payload.software_assignment_id,
      allocation_basis: payload.allocation_basis,
      allocated_quantity: payload.allocated_quantity,
      status: payload.status,
    },
  });

  return detail;
}

export async function updateEntitlementAllocationService(app, req) {
  assertAllowed(req, WRITE_ROLES, "update software entitlement allocations");

  const tenantId = getTenantId(req);
  const entitlementId = parsePositiveInt(
    req.params?.id,
    "SOFTWARE_ENTITLEMENT_ID_INVALID",
    "software_entitlement_id"
  );
  const allocationId = parsePositiveInt(
    req.params?.allocationId,
    "SOFTWARE_ENTITLEMENT_ALLOCATION_ID_INVALID",
    "software_entitlement_allocation_id"
  );

  const entitlement = await getSoftwareEntitlementById(app, tenantId, entitlementId);
  if (!entitlement) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_NOT_FOUND",
      "Software entitlement not found."
    );
  }

  const existing = await getEntitlementAllocationByEntitlementAndId(
    app,
    tenantId,
    entitlementId,
    allocationId
  );
  if (!existing) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_ALLOCATION_NOT_FOUND",
      "Software entitlement allocation not found."
    );
  }

  const patch = normalizePatchPayload(req.body || {});
  if (Object.keys(patch).length === 0) {
    throw appError(400, "EMPTY_PATCH_BODY", "No valid fields to update.");
  }

  if (patch.status === "ACTIVE") {
    if (String(entitlement.status || "").toUpperCase() !== "ACTIVE") {
      throw appError(
        400,
        "SOFTWARE_ENTITLEMENT_NOT_ACTIVE",
        "Cannot reactivate allocation for inactive entitlement."
      );
    }

    const duplicate = await findActiveDuplicateAllocation(
      app,
      tenantId,
      entitlementId,
      existing.allocation_basis,
      existing.asset_id,
      existing.software_installation_id,
      existing.software_assignment_id
    );

    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALLOCATION_ALREADY_EXISTS",
        "Active allocation already exists for this target."
      );
    }

    const activeAllocated = await getActiveAllocatedQuantityByEntitlement(
      app,
      tenantId,
      entitlementId,
      allocationId
    );

    if (activeAllocated + Number(existing.allocated_quantity ?? 0) > Number(entitlement.quantity_purchased ?? 0)) {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALLOCATION_EXCEEDS_AVAILABLE",
        "Allocated quantity exceeds entitlement available quantity."
      );
    }
  }

  const updated = await updateEntitlementAllocation(app, tenantId, allocationId, patch);
  if (!updated) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_ALLOCATION_NOT_FOUND",
      "Software entitlement allocation not found."
    );
  }

  const detail = await getEntitlementAllocationDetailById(app, tenantId, allocationId);

  const actionCode =
    detail?.status === "RELEASED"
      ? "SOFTWARE_ENTITLEMENT_ALLOCATION_RELEASED"
      : "SOFTWARE_ENTITLEMENT_ALLOCATION_UPDATED";

  await safeWriteAuditEvent(app, req, {
    action_code: actionCode,
    entity_id: allocationId,
    metadata: {
      software_entitlement_id: entitlementId,
      asset_id: existing.asset_id,
      software_installation_id: existing.software_installation_id,
      software_assignment_id: existing.software_assignment_id,
      allocation_basis: existing.allocation_basis,
      allocated_quantity: existing.allocated_quantity,
      status: detail?.status,
    },
  });

  return detail;
}
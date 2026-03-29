import {
  getAssetById,
  getSoftwareInstallationByAssetAndId,
  getIdentityById,
  findSoftwareAssignmentByUniqueMapping,
  getSoftwareAssignmentByAssetAndId,
  getSoftwareAssignmentDetailById,
  listSoftwareAssignmentsByAsset,
  createSoftwareAssignment,
  updateSoftwareAssignment,
} from "./software-assignments.repo.js";

const READ_ROLES = new Set([
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "AUDITOR",
]);

const WRITE_ROLES = new Set([
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
]);

const ALLOWED_ASSIGNMENT_ROLES = new Set([
  "PRIMARY_USER",
  "SECONDARY_USER",
  "ADMINISTRATOR",
  "SERVICE_ACCOUNT",
]);

const ALLOWED_ASSIGNMENT_STATUSES = new Set([
  "ACTIVE",
  "REVOKED",
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

  if (roles.length === 0) {
    return;
  }

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

function normalizeNullableString(value, opts = {}) {
  const { upper = false } = opts;

  if (value === undefined) return undefined;
  if (value === null) return null;

  let text = String(value).trim();
  if (!text) return null;
  if (upper) text = text.toUpperCase();

  return text;
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

function normalizeAssignmentRole(value, fallback = "PRIMARY_USER") {
  const text = String(value ?? fallback).trim().toUpperCase();

  if (!ALLOWED_ASSIGNMENT_ROLES.has(text)) {
    throw appError(
      400,
      "INVALID_ASSIGNMENT_ROLE",
      "assignment_role is invalid."
    );
  }

  return text;
}

function normalizeAssignmentStatus(value, fallback = "ACTIVE") {
  const text = String(value ?? fallback).trim().toUpperCase();

  if (!ALLOWED_ASSIGNMENT_STATUSES.has(text)) {
    throw appError(
      400,
      "INVALID_ASSIGNMENT_STATUS",
      "assignment_status is invalid."
    );
  }

  return text;
}

function normalizeCreatePayload(body) {
  const softwareInstallationId = parsePositiveInt(
    body?.software_installation_id,
    "SOFTWARE_INSTALLATION_ID_INVALID",
    "software_installation_id"
  );

  const identityId = parsePositiveInt(
    body?.identity_id,
    "IDENTITY_ID_INVALID",
    "identity_id"
  );

  const assignmentRole = normalizeAssignmentRole(
    body?.assignment_role,
    "PRIMARY_USER"
  );

  const assignmentStatus = normalizeAssignmentStatus(
    body?.assignment_status,
    "ACTIVE"
  );

  let unassignedAt = normalizeNullableDate(
    body?.unassigned_at,
    "unassigned_at"
  );

  if (assignmentStatus !== "REVOKED") {
    unassignedAt = null;
  }

  return {
    software_installation_id: softwareInstallationId,
    identity_id: identityId,
    assignment_role: assignmentRole,
    assignment_status: assignmentStatus,
    assigned_at: normalizeNullableDate(body?.assigned_at, "assigned_at"),
    unassigned_at: unassignedAt,
    notes: normalizeNullableString(body?.notes),
  };
}

function normalizePatchPayload(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "assignment_role")) {
    patch.assignment_role = normalizeAssignmentRole(body.assignment_role);
  }

  if (Object.prototype.hasOwnProperty.call(body, "assignment_status")) {
    patch.assignment_status = normalizeAssignmentStatus(body.assignment_status);
  }

  if (Object.prototype.hasOwnProperty.call(body, "assigned_at")) {
    patch.assigned_at = normalizeNullableDate(body.assigned_at, "assigned_at");
  }

  if (Object.prototype.hasOwnProperty.call(body, "unassigned_at")) {
    patch.unassigned_at = normalizeNullableDate(
      body.unassigned_at,
      "unassigned_at"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = normalizeNullableString(body.notes);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "assignment_status") &&
    patch.assignment_status !== "REVOKED" &&
    !Object.prototype.hasOwnProperty.call(patch, "unassigned_at")
  ) {
    patch.unassigned_at = null;
  }

  return patch;
}

async function safeWriteAuditEvent(app, req, event) {
  try {
    if (typeof app?.writeAuditEvent === "function") {
      await app.writeAuditEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ASSIGNMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    if (typeof app?.audit?.writeEvent === "function") {
      await app.audit.writeEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ASSIGNMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    app.log?.info?.(
      {
        audit_fallback: true,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ASSIGNMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      },
      "software assignment audit event"
    );
  } catch (err) {
    app.log?.error?.(err, "failed to write software assignment audit event");
  }
}

export async function listAssetSoftwareAssignmentsService(app, req) {
  assertAllowed(req, READ_ROLES, "read software assignments");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const items = await listSoftwareAssignmentsByAsset(app, tenantId, assetId);

  return {
    items,
    total: items.length,
  };
}

export async function createAssetSoftwareAssignmentService(app, req) {
  assertAllowed(req, WRITE_ROLES, "create software assignments");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");
  const payload = normalizeCreatePayload(req.body || {});

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const installation = await getSoftwareInstallationByAssetAndId(
    app,
    tenantId,
    assetId,
    payload.software_installation_id
  );
  if (!installation) {
    throw appError(
      404,
      "SOFTWARE_INSTALLATION_NOT_FOUND",
      "Software installation not found."
    );
  }

  const identity = await getIdentityById(app, tenantId, payload.identity_id);
  if (!identity) {
    throw appError(404, "IDENTITY_NOT_FOUND", "Identity not found.");
  }

  if (
    payload.assignment_status === "ACTIVE" &&
    String(installation.installation_status || "").toUpperCase() === "UNINSTALLED"
  ) {
    throw appError(
      400,
      "SOFTWARE_INSTALLATION_NOT_ACTIVE",
      "Cannot create active assignment for uninstalled software."
    );
  }

  const duplicate = await findSoftwareAssignmentByUniqueMapping(
    app,
    tenantId,
    payload.software_installation_id,
    payload.identity_id,
    payload.assignment_role
  );
  if (duplicate) {
    throw appError(
      409,
      "SOFTWARE_ASSIGNMENT_ALREADY_EXISTS",
      "Software assignment already exists for this installation, identity, and role."
    );
  }

  let created;
  try {
    created = await createSoftwareAssignment(app, {
      tenant_id: tenantId,
      asset_id: assetId,
      software_installation_id: payload.software_installation_id,
      identity_id: payload.identity_id,
      assignment_role: payload.assignment_role,
      assignment_status: payload.assignment_status,
      assigned_at: payload.assigned_at,
      unassigned_at: payload.unassigned_at,
      notes: payload.notes,
    });
  } catch (err) {
    if (err?.code === "23505") {
      throw appError(
        409,
        "SOFTWARE_ASSIGNMENT_ALREADY_EXISTS",
        "Software assignment already exists for this installation, identity, and role."
      );
    }
    throw err;
  }

  const detail = await getSoftwareAssignmentDetailById(app, tenantId, created.id);

  await safeWriteAuditEvent(app, req, {
    action_code: "SOFTWARE_ASSIGNMENT_CREATED",
    entity_id: created.id,
    metadata: {
      asset_id: assetId,
      software_installation_id: payload.software_installation_id,
      identity_id: payload.identity_id,
      assignment_role: payload.assignment_role,
      assignment_status: payload.assignment_status,
    },
  });

  return detail;
}

export async function updateAssetSoftwareAssignmentService(app, req) {
  assertAllowed(req, WRITE_ROLES, "update software assignments");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");
  const assignmentId = parsePositiveInt(
    req.params?.assignmentId,
    "SOFTWARE_ASSIGNMENT_ID_INVALID",
    "assignment_id"
  );

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const existing = await getSoftwareAssignmentByAssetAndId(
    app,
    tenantId,
    assetId,
    assignmentId
  );
  if (!existing) {
    throw appError(
      404,
      "SOFTWARE_ASSIGNMENT_NOT_FOUND",
      "Software assignment not found."
    );
  }

  const patch = normalizePatchPayload(req.body || {});
  if (Object.keys(patch).length === 0) {
    throw appError(400, "EMPTY_PATCH_BODY", "No valid fields to update.");
  }

  if (
    patch.assignment_status === "ACTIVE" ||
    (!patch.assignment_status && existing.assignment_status === "ACTIVE")
  ) {
    const installation = await getSoftwareInstallationByAssetAndId(
      app,
      tenantId,
      assetId,
      existing.software_installation_id
    );

    if (
      installation &&
      String(installation.installation_status || "").toUpperCase() === "UNINSTALLED"
    ) {
      throw appError(
        400,
        "SOFTWARE_INSTALLATION_NOT_ACTIVE",
        "Cannot keep active assignment for uninstalled software."
      );
    }
  }

  if (patch.assignment_role && patch.assignment_role !== existing.assignment_role) {
    const duplicate = await findSoftwareAssignmentByUniqueMapping(
      app,
      tenantId,
      existing.software_installation_id,
      existing.identity_id,
      patch.assignment_role
    );

    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
      throw appError(
        409,
        "SOFTWARE_ASSIGNMENT_ALREADY_EXISTS",
        "Software assignment already exists for this installation, identity, and role."
      );
    }
  }

  const updated = await updateSoftwareAssignment(app, tenantId, assignmentId, patch);
  if (!updated) {
    throw appError(
      404,
      "SOFTWARE_ASSIGNMENT_NOT_FOUND",
      "Software assignment not found."
    );
  }

  const detail = await getSoftwareAssignmentDetailById(app, tenantId, assignmentId);

  const actionCode =
    detail?.assignment_status === "REVOKED"
      ? "SOFTWARE_ASSIGNMENT_REVOKED"
      : "SOFTWARE_ASSIGNMENT_UPDATED";

  await safeWriteAuditEvent(app, req, {
    action_code: actionCode,
    entity_id: assignmentId,
    metadata: {
      asset_id: assetId,
      software_installation_id: existing.software_installation_id,
      identity_id: existing.identity_id,
      assignment_role: detail?.assignment_role,
      assignment_status: detail?.assignment_status,
    },
  });

  return detail;
}
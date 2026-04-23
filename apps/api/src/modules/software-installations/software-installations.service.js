import {
  getAssetById,
  getSoftwareProductById,
  findSoftwareInstallationByMapping,
  getSoftwareInstallationByAssetAndId,
  getSoftwareInstallationByAssetAndIdForDelete,
  getSoftwareInstallationDetailById,
  listSoftwareInstallationsByAsset,
  createSoftwareInstallation,
  updateSoftwareInstallation,
  countSoftwareInstallationDeleteDependencies,
  lockSoftwareInstallationDeleteRelatedTables,
  deleteSoftwareInstallationById,
} from "./software-installations.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

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

function appError(statusCode, code, message, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  if (details !== undefined) {
    err.details = details;
  }
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
  const {
    upper = false,
    maxLength = null,
  } = opts;

  if (value === undefined) return undefined;
  if (value === null) return null;

  let text = String(value).trim();

  if (!text) return null;
  if (upper) text = text.toUpperCase();

  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

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

function normalizeInstallationStatus(value, fallback = "INSTALLED") {
  const text = String(value ?? fallback).trim().toUpperCase();

  if (!["INSTALLED", "UNINSTALLED", "DETECTED"].includes(text)) {
    throw appError(
      400,
      "INVALID_INSTALLATION_STATUS",
      "installation_status is invalid."
    );
  }

  return text;
}

function normalizeCreatePayload(body) {
  const softwareProductId = parsePositiveInt(
    body?.software_product_id,
    "SOFTWARE_PRODUCT_ID_INVALID",
    "software_product_id"
  );

  const installationStatus = normalizeInstallationStatus(
    body?.installation_status,
    "INSTALLED"
  );

  let uninstalledDate = normalizeNullableDate(
    body?.uninstalled_date,
    "uninstalled_date"
  );

  if (installationStatus !== "UNINSTALLED") {
    uninstalledDate = null;
  }

  return {
    software_product_id: softwareProductId,
    installation_status: installationStatus,
    installed_version: normalizeNullableString(body?.installed_version, {
      maxLength: 255,
    }),
    installation_date: normalizeNullableDate(
      body?.installation_date,
      "installation_date"
    ),
    uninstalled_date: uninstalledDate,
    discovered_by: normalizeNullableString(body?.discovered_by, {
      upper: true,
      maxLength: 100,
    }),
    discovery_source: normalizeNullableString(body?.discovery_source, {
      upper: true,
      maxLength: 100,
    }),
    notes: normalizeNullableString(body?.notes),
  };
}

function normalizePatchPayload(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "installation_status")) {
    patch.installation_status = normalizeInstallationStatus(
      body.installation_status,
      "INSTALLED"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "installed_version")) {
    patch.installed_version = normalizeNullableString(body.installed_version, {
      maxLength: 255,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "installation_date")) {
    patch.installation_date = normalizeNullableDate(
      body.installation_date,
      "installation_date"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "uninstalled_date")) {
    patch.uninstalled_date = normalizeNullableDate(
      body.uninstalled_date,
      "uninstalled_date"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "discovered_by")) {
    patch.discovered_by = normalizeNullableString(body.discovered_by, {
      upper: true,
      maxLength: 100,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "discovery_source")) {
    patch.discovery_source = normalizeNullableString(body.discovery_source, {
      upper: true,
      maxLength: 100,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = normalizeNullableString(body.notes);
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "installation_status") &&
    patch.installation_status !== "UNINSTALLED" &&
    !Object.prototype.hasOwnProperty.call(patch, "uninstalled_date")
  ) {
    patch.uninstalled_date = null;
  }

  return patch;
}

async function withTransaction(app, fn) {
  const client = await app.pg.connect();

  try {
    await client.query("BEGIN");
    const result = await fn({ pg: client });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function actorFromIdentityId(identityId) {
  if (Number.isFinite(identityId) && identityId > 0) return `IDENTITY:${identityId}`;
  return "SYSTEM";
}

/**
 * Sengaja dibuat safe no-op supaya tidak bentrok dengan helper audit
 * project kamu yang sudah ada. Kalau project kamu punya util audit,
 * sambungkan isi helper ini ke util internal itu.
 */
async function safeWriteAuditEvent(app, req, event) {
  try {
    if (typeof app?.writeAuditEvent === "function") {
      await app.writeAuditEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_INSTALLATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    if (typeof app?.audit?.writeEvent === "function") {
      await app.audit.writeEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_INSTALLATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    app.log?.info?.(
      {
        audit_fallback: true,
        action_code: event.action_code,
        entity_type: "SOFTWARE_INSTALLATION",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      },
      "software installation audit event"
    );
  } catch (err) {
    app.log?.error?.(err, "failed to write software installation audit event");
  }
}

export async function listAssetSoftwareInstallationsService(app, req) {
  assertAllowed(req, READ_ROLES, "read software installations");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const items = await listSoftwareInstallationsByAsset(app, tenantId, assetId);

  return {
    items,
    total: items.length,
  };
}

export async function createAssetSoftwareInstallationService(app, req) {
  assertAllowed(req, WRITE_ROLES, "create software installations");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");
  const payload = normalizeCreatePayload(req.body || {});

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const softwareProduct = await getSoftwareProductById(
    app,
    tenantId,
    payload.software_product_id
  );
  if (!softwareProduct) {
    throw appError(
      404,
      "SOFTWARE_PRODUCT_NOT_FOUND",
      "Software product not found."
    );
  }

  const duplicate = await findSoftwareInstallationByMapping(
    app,
    tenantId,
    assetId,
    payload.software_product_id
  );
  if (duplicate) {
    throw appError(
      409,
      "SOFTWARE_INSTALLATION_ALREADY_EXISTS",
      "Software installation mapping already exists for this asset and product."
    );
  }

  let created;
  try {
    created = await createSoftwareInstallation(app, {
      tenant_id: tenantId,
      asset_id: assetId,
      software_product_id: payload.software_product_id,
      installation_status: payload.installation_status,
      installed_version: payload.installed_version,
      installation_date: payload.installation_date,
      uninstalled_date: payload.uninstalled_date,
      discovered_by: payload.discovered_by,
      discovery_source: payload.discovery_source,
      notes: payload.notes,
    });
  } catch (err) {
    if (err?.code === "23505") {
      throw appError(
        409,
        "SOFTWARE_INSTALLATION_ALREADY_EXISTS",
        "Software installation mapping already exists for this asset and product."
      );
    }
    throw err;
  }

  const detail = await getSoftwareInstallationDetailById(app, tenantId, created.id);

  await safeWriteAuditEvent(app, req, {
    action_code: "SOFTWARE_INSTALLATION_CREATED",
    entity_id: created.id,
    metadata: {
      asset_id: assetId,
      software_product_id: payload.software_product_id,
      installation_status: detail?.installation_status || payload.installation_status,
      installed_version: detail?.installed_version || payload.installed_version,
    },
  });

  return detail;
}

export async function updateAssetSoftwareInstallationService(app, req) {
  assertAllowed(req, WRITE_ROLES, "update software installations");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");
  const installationId = parsePositiveInt(
    req.params?.installationId,
    "SOFTWARE_INSTALLATION_ID_INVALID",
    "installation_id"
  );

  const asset = await getAssetById(app, tenantId, assetId);
  if (!asset) {
    throw appError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  const existing = await getSoftwareInstallationByAssetAndId(
    app,
    tenantId,
    assetId,
    installationId
  );
  if (!existing) {
    throw appError(
      404,
      "SOFTWARE_INSTALLATION_NOT_FOUND",
      "Software installation not found."
    );
  }

  const patch = normalizePatchPayload(req.body || {});
  if (Object.keys(patch).length === 0) {
    throw appError(400, "EMPTY_PATCH_BODY", "No valid fields to update.");
  }

  const updated = await updateSoftwareInstallation(app, tenantId, installationId, patch);
  if (!updated) {
    throw appError(
      404,
      "SOFTWARE_INSTALLATION_NOT_FOUND",
      "Software installation not found."
    );
  }

  const detail = await getSoftwareInstallationDetailById(app, tenantId, installationId);

  const actionCode =
    detail?.installation_status === "UNINSTALLED"
      ? "SOFTWARE_INSTALLATION_MARKED_UNINSTALLED"
      : "SOFTWARE_INSTALLATION_UPDATED";

  await safeWriteAuditEvent(app, req, {
    action_code: actionCode,
    entity_id: installationId,
    metadata: {
      asset_id: assetId,
      software_product_id: existing.software_product_id,
      installation_status: detail?.installation_status,
      installed_version: detail?.installed_version,
    },
  });

  return detail;
}

export async function deleteAssetSoftwareInstallationService(app, req) {
  assertAllowed(req, WRITE_ROLES, "delete software installations");

  const tenantId = getTenantId(req);
  const assetId = parsePositiveInt(req.params?.id, "ASSET_ID_INVALID", "asset_id");
  const installationId = parsePositiveInt(
    req.params?.installationId,
    "SOFTWARE_INSTALLATION_ID_INVALID",
    "installation_id"
  );
  const actorId = req?.requestContext?.identityId ?? null;

  return withTransaction(app, async (tx) => {
    const current = await getSoftwareInstallationByAssetAndIdForDelete(
      tx,
      tenantId,
      assetId,
      installationId
    );

    if (!current) {
      throw appError(
        404,
        "SOFTWARE_INSTALLATION_NOT_FOUND",
        "Software installation not found."
      );
    }

    await lockSoftwareInstallationDeleteRelatedTables(tx);

    const dependencies = await countSoftwareInstallationDeleteDependencies(
      tx,
      tenantId,
      installationId
    );
    if (dependencies.total > 0) {
      throw appError(
        409,
        "SOFTWARE_INSTALLATION_IN_USE",
        "Software installation is still in use.",
        dependencies
      );
    }

    await insertAuditEvent(tx, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "SOFTWARE_INSTALLATION_DELETED",
      entityType: "SOFTWARE_INSTALLATION",
      entityId: installationId,
      payload: {
        id: Number(current.id),
        tenant_id: Number(current.tenant_id),
        asset_id: Number(current.asset_id),
        software_product_id: Number(current.software_product_id),
        installation_status: current.installation_status ?? null,
        installed_version: current.installed_version ?? null,
        installation_date: current.installation_date ?? null,
        uninstalled_date: current.uninstalled_date ?? null,
        discovered_by: current.discovered_by ?? null,
        discovery_source: current.discovery_source ?? null,
      },
    });

    const deleted = await deleteSoftwareInstallationById(tx, tenantId, installationId);
    if (!deleted) {
      throw appError(
        404,
        "SOFTWARE_INSTALLATION_NOT_FOUND",
        "Software installation not found."
      );
    }

    return deleted;
  });
}

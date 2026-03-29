import {
  getContractById,
  getSoftwareProductById,
  findSoftwareEntitlementByUniqueCode,
  getSoftwareEntitlementByContractAndId,
  getSoftwareEntitlementDetailById,
  listSoftwareEntitlementsByContract,
  createSoftwareEntitlement,
  updateSoftwareEntitlement,
} from "./software-entitlements.repo.js";

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

const ALLOWED_STATUS = new Set([
  "ACTIVE",
  "INACTIVE",
  "EXPIRED",
]);

const ALLOWED_LICENSING_METRICS = new Set([
  "SUBSCRIPTION",
  "PER_USER",
  "PER_DEVICE",
  "PER_NAMED_USER",
  "PER_CONCURRENT_USER",
  "PER_CORE",
  "PER_PROCESSOR",
  "SITE",
  "ENTERPRISE",
  "OTHER",
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

function parseNonNegativeInt(value, code, fieldLabel) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw appError(400, code, `${fieldLabel} is invalid.`);
  }
  return parsed;
}

function normalizeNullableString(value, opts = {}) {
  const { upper = false, maxLength = null } = opts;

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

function normalizeStatus(value, fallback = "ACTIVE") {
  const text = String(value ?? fallback).trim().toUpperCase();

  if (!ALLOWED_STATUS.has(text)) {
    throw appError(400, "INVALID_ENTITLEMENT_STATUS", "status is invalid.");
  }

  return text;
}

function normalizeLicensingMetric(value) {
  const text = String(value ?? "").trim().toUpperCase();

  if (!ALLOWED_LICENSING_METRICS.has(text)) {
    throw appError(
      400,
      "INVALID_LICENSING_METRIC",
      "licensing_metric is invalid."
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

  const entitlementCode = normalizeNullableString(body?.entitlement_code, {
    upper: true,
    maxLength: 120,
  });

  if (!entitlementCode) {
    throw appError(
      400,
      "ENTITLEMENT_CODE_REQUIRED",
      "entitlement_code is required."
    );
  }

  return {
    software_product_id: softwareProductId,
    entitlement_code: entitlementCode,
    entitlement_name: normalizeNullableString(body?.entitlement_name, {
      maxLength: 255,
    }),
    licensing_metric: normalizeLicensingMetric(body?.licensing_metric),
    quantity_purchased: parseNonNegativeInt(
      body?.quantity_purchased,
      "QUANTITY_PURCHASED_INVALID",
      "quantity_purchased"
    ),
    start_date: normalizeNullableDate(body?.start_date, "start_date"),
    end_date: normalizeNullableDate(body?.end_date, "end_date"),
    status: normalizeStatus(body?.status, "ACTIVE"),
    notes: normalizeNullableString(body?.notes),
  };
}

function normalizePatchPayload(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "software_product_id")) {
    patch.software_product_id = parsePositiveInt(
      body.software_product_id,
      "SOFTWARE_PRODUCT_ID_INVALID",
      "software_product_id"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "entitlement_code")) {
    const code = normalizeNullableString(body.entitlement_code, {
      upper: true,
      maxLength: 120,
    });

    if (!code) {
      throw appError(
        400,
        "ENTITLEMENT_CODE_REQUIRED",
        "entitlement_code is required."
      );
    }

    patch.entitlement_code = code;
  }

  if (Object.prototype.hasOwnProperty.call(body, "entitlement_name")) {
    patch.entitlement_name = normalizeNullableString(body.entitlement_name, {
      maxLength: 255,
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, "licensing_metric")) {
    patch.licensing_metric = normalizeLicensingMetric(body.licensing_metric);
  }

  if (Object.prototype.hasOwnProperty.call(body, "quantity_purchased")) {
    patch.quantity_purchased = parseNonNegativeInt(
      body.quantity_purchased,
      "QUANTITY_PURCHASED_INVALID",
      "quantity_purchased"
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "start_date")) {
    patch.start_date = normalizeNullableDate(body.start_date, "start_date");
  }

  if (Object.prototype.hasOwnProperty.call(body, "end_date")) {
    patch.end_date = normalizeNullableDate(body.end_date, "end_date");
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    patch.status = normalizeStatus(body.status);
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = normalizeNullableString(body.notes);
  }

  return patch;
}

async function safeWriteAuditEvent(app, req, event) {
  try {
    if (typeof app?.writeAuditEvent === "function") {
      await app.writeAuditEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    if (typeof app?.audit?.writeEvent === "function") {
      await app.audit.writeEvent({
        req,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      });
      return;
    }

    app.log?.info?.(
      {
        audit_fallback: true,
        action_code: event.action_code,
        entity_type: "SOFTWARE_ENTITLEMENT",
        entity_id: event.entity_id,
        metadata: event.metadata || {},
      },
      "software entitlement audit event"
    );
  } catch (err) {
    app.log?.error?.(err, "failed to write software entitlement audit event");
  }
}

export async function listContractSoftwareEntitlementsService(app, req) {
  assertAllowed(req, READ_ROLES, "read software entitlements");

  const tenantId = getTenantId(req);
  const contractId = parsePositiveInt(req.params?.id, "CONTRACT_ID_INVALID", "contract_id");

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw appError(404, "CONTRACT_NOT_FOUND", "Contract not found.");
  }

  const items = await listSoftwareEntitlementsByContract(app, tenantId, contractId);

  return {
    items,
    total: items.length,
  };
}

export async function createContractSoftwareEntitlementService(app, req) {
  assertAllowed(req, WRITE_ROLES, "create software entitlements");

  const tenantId = getTenantId(req);
  const contractId = parsePositiveInt(req.params?.id, "CONTRACT_ID_INVALID", "contract_id");
  const payload = normalizeCreatePayload(req.body || {});

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw appError(404, "CONTRACT_NOT_FOUND", "Contract not found.");
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

  const duplicate = await findSoftwareEntitlementByUniqueCode(
    app,
    tenantId,
    contractId,
    payload.entitlement_code
  );
  if (duplicate) {
    throw appError(
      409,
      "SOFTWARE_ENTITLEMENT_ALREADY_EXISTS",
      "Software entitlement code already exists for this contract."
    );
  }

  let created;
  try {
    created = await createSoftwareEntitlement(app, {
      tenant_id: tenantId,
      contract_id: contractId,
      software_product_id: payload.software_product_id,
      entitlement_code: payload.entitlement_code,
      entitlement_name: payload.entitlement_name,
      licensing_metric: payload.licensing_metric,
      quantity_purchased: payload.quantity_purchased,
      start_date: payload.start_date,
      end_date: payload.end_date,
      status: payload.status,
      notes: payload.notes,
    });
  } catch (err) {
    if (err?.code === "23505") {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALREADY_EXISTS",
        "Software entitlement code already exists for this contract."
      );
    }
    throw err;
  }

  const detail = await getSoftwareEntitlementDetailById(app, tenantId, created.id);

  await safeWriteAuditEvent(app, req, {
    action_code: "SOFTWARE_ENTITLEMENT_CREATED",
    entity_id: created.id,
    metadata: {
      contract_id: contractId,
      software_product_id: payload.software_product_id,
      entitlement_code: payload.entitlement_code,
      licensing_metric: payload.licensing_metric,
      quantity_purchased: payload.quantity_purchased,
      status: payload.status,
    },
  });

  return detail;
}

export async function updateContractSoftwareEntitlementService(app, req) {
  assertAllowed(req, WRITE_ROLES, "update software entitlements");

  const tenantId = getTenantId(req);
  const contractId = parsePositiveInt(req.params?.id, "CONTRACT_ID_INVALID", "contract_id");
  const entitlementId = parsePositiveInt(
    req.params?.entitlementId,
    "SOFTWARE_ENTITLEMENT_ID_INVALID",
    "entitlement_id"
  );

  const contract = await getContractById(app, tenantId, contractId);
  if (!contract) {
    throw appError(404, "CONTRACT_NOT_FOUND", "Contract not found.");
  }

  const existing = await getSoftwareEntitlementByContractAndId(
    app,
    tenantId,
    contractId,
    entitlementId
  );
  if (!existing) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_NOT_FOUND",
      "Software entitlement not found."
    );
  }

  const patch = normalizePatchPayload(req.body || {});
  if (Object.keys(patch).length === 0) {
    throw appError(400, "EMPTY_PATCH_BODY", "No valid fields to update.");
  }

  if (patch.software_product_id) {
    const softwareProduct = await getSoftwareProductById(
      app,
      tenantId,
      patch.software_product_id
    );
    if (!softwareProduct) {
      throw appError(
        404,
        "SOFTWARE_PRODUCT_NOT_FOUND",
        "Software product not found."
      );
    }
  }

  const nextEntitlementCode = patch.entitlement_code || existing.entitlement_code;
  if (nextEntitlementCode !== existing.entitlement_code) {
    const duplicate = await findSoftwareEntitlementByUniqueCode(
      app,
      tenantId,
      contractId,
      nextEntitlementCode
    );

    if (duplicate && Number(duplicate.id) !== Number(existing.id)) {
      throw appError(
        409,
        "SOFTWARE_ENTITLEMENT_ALREADY_EXISTS",
        "Software entitlement code already exists for this contract."
      );
    }
  }

  const updated = await updateSoftwareEntitlement(app, tenantId, entitlementId, patch);
  if (!updated) {
    throw appError(
      404,
      "SOFTWARE_ENTITLEMENT_NOT_FOUND",
      "Software entitlement not found."
    );
  }

  const detail = await getSoftwareEntitlementDetailById(app, tenantId, entitlementId);

  await safeWriteAuditEvent(app, req, {
    action_code: "SOFTWARE_ENTITLEMENT_UPDATED",
    entity_id: entitlementId,
    metadata: {
      contract_id: contractId,
      software_product_id: detail?.software_product_id,
      entitlement_code: detail?.entitlement_code,
      licensing_metric: detail?.licensing_metric,
      quantity_purchased: detail?.quantity_purchased,
      status: detail?.status,
    },
  });

  return detail;
}
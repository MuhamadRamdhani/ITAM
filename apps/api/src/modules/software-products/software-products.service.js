import { insertAuditEvent } from "../../lib/audit.js";
import { findVendorById } from "../vendors/vendors.repo.js";
import {
  countSoftwareProducts,
  listSoftwareProducts,
  findSoftwareProductById,
  findSoftwareProductByCode,
  insertSoftwareProduct,
  updateSoftwareProduct,
} from "./software-products.repo.js";

const CATEGORIES = [
  "OPERATING_SYSTEM",
  "DATABASE",
  "OFFICE_PRODUCTIVITY",
  "SECURITY",
  "DEVELOPER_TOOL",
  "MIDDLEWARE",
  "BUSINESS_APPLICATION",
  "DESIGN_MULTIMEDIA",
  "COLLABORATION",
  "INFRASTRUCTURE_TOOL",
  "OTHER",
];

const DEPLOYMENT_MODELS = [
  "ON_PREMISE",
  "SAAS",
  "HYBRID",
  "CLOUD_MARKETPLACE",
  "OTHER",
];

const LICENSING_METRICS = [
  "USER",
  "NAMED_USER",
  "DEVICE",
  "CONCURRENT_USER",
  "CORE",
  "PROCESSOR",
  "SERVER",
  "INSTANCE",
  "VM",
  "SUBSCRIPTION",
  "SITE",
  "ENTERPRISE",
  "OTHER",
];

const STATUSES = ["ACTIVE", "INACTIVE"];
const VERSION_POLICIES = ["VERSIONED", "VERSIONLESS"];

function actorStr(req) {
  const a = req.actor;
  if (a?.type === "USER" && a?.id) return `USER:${a.id}`;
  return "SYSTEM";
}

function getTenantIdStrict(req) {
  const tenantId = req.tenantId || req.requestContext?.tenantId;
  if (!tenantId) {
    const e = new Error("Missing tenant context");
    e.statusCode = 401;
    e.code = "UNAUTHORIZED";
    throw e;
  }
  return Number(tenantId);
}

function toUpperOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s === "" ? null : s;
}

function normalizeNullableText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizeNullableInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error("publisher_vendor_id must be a positive integer");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { publisher_vendor_id: v };
    throw e;
  }
  return n;
}

function validateProductCode(v) {
  const code = toUpperOrNull(v);
  if (!code) {
    const e = new Error("product_code is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  if (!/^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(code)) {
    const e = new Error(
      "Invalid product_code. Use uppercase letters, numbers, underscore, or dash (2-100 chars)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { product_code: code };
    throw e;
  }

  return code;
}

function validateProductName(v) {
  const name = String(v || "").trim();
  if (!name) {
    const e = new Error("product_name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return name;
}

function validateEnum(name, value, allowed, fallback = null) {
  const normalized = toUpperOrNull(value) || fallback;
  if (!normalized || !allowed.includes(normalized)) {
    const e = new Error(
      `Invalid ${name} (must be ${allowed.join("|")})`
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { [name]: normalized };
    throw e;
  }
  return normalized;
}

function validatePage(v, fallback = 1) {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function validatePageSize(v, fallback = 20) {
  const n = Number(v ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

async function ensureVendorIfPresent(app, tenantId, publisherVendorId) {
  if (publisherVendorId == null) return null;

  const vendor = await findVendorById(app, tenantId, publisherVendorId);
  if (!vendor) {
    const e = new Error("Publisher vendor not found");
    e.statusCode = 404;
    e.code = "VENDOR_NOT_FOUND";
    e.details = { publisher_vendor_id: publisherVendorId };
    throw e;
  }

  return vendor;
}

export async function getSoftwareProductsService(app, req) {
  const tenantId = getTenantIdStrict(req);

  const filters = {
    q: normalizeNullableText(req.query?.q),
    status: req.query?.status
      ? validateEnum("status", req.query.status, STATUSES)
      : null,
    category: req.query?.category
      ? validateEnum("category", req.query.category, CATEGORIES)
      : null,
    deployment_model: req.query?.deployment_model
      ? validateEnum(
          "deployment_model",
          req.query.deployment_model,
          DEPLOYMENT_MODELS
        )
      : null,
    publisher_vendor_id: normalizeNullableInt(req.query?.publisher_vendor_id),
    page: validatePage(req.query?.page, 1),
    pageSize: validatePageSize(req.query?.pageSize, 20),
  };

  const [items, total] = await Promise.all([
    listSoftwareProducts(app, tenantId, filters),
    countSoftwareProducts(app, tenantId, filters),
  ]);

  return {
    items,
    total,
    page: filters.page,
    page_size: filters.pageSize,
    filters: {
      q: filters.q || "",
      status: filters.status,
      category: filters.category,
      deployment_model: filters.deployment_model,
      publisher_vendor_id: filters.publisher_vendor_id,
    },
  };
}

export async function getSoftwareProductDetailService(app, req) {
  const tenantId = getTenantIdStrict(req);
  const softwareProductId = Number(req.params?.id);

  if (!Number.isFinite(softwareProductId) || softwareProductId <= 0) {
    const e = new Error("Invalid software product id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const item = await findSoftwareProductById(app, tenantId, softwareProductId);
  if (!item) {
    const e = new Error("Software product not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  return item;
}

export async function createSoftwareProductService(app, req, body) {
  const tenantId = getTenantIdStrict(req);

  const productCode = validateProductCode(body.product_code);
  const productName = validateProductName(body.product_name);
  const publisherVendorId = normalizeNullableInt(body.publisher_vendor_id);
  const category = validateEnum("category", body.category, CATEGORIES);
  const deploymentModel = validateEnum(
    "deployment_model",
    body.deployment_model,
    DEPLOYMENT_MODELS
  );
  const licensingMetric = validateEnum(
    "licensing_metric",
    body.licensing_metric,
    LICENSING_METRICS
  );
  const status = validateEnum("status", body.status, STATUSES, "ACTIVE");
  const versionPolicy = validateEnum(
    "version_policy",
    body.version_policy,
    VERSION_POLICIES,
    "VERSIONLESS"
  );

  await ensureVendorIfPresent(app, tenantId, publisherVendorId);

  const existing = await findSoftwareProductByCode(app, tenantId, productCode);
  if (existing) {
    const e = new Error("product_code already exists");
    e.statusCode = 409;
    e.code = "SOFTWARE_PRODUCT_CODE_TAKEN";
    e.details = { product_code: productCode };
    throw e;
  }

  const payload = {
    tenant_id: tenantId,
    product_code: productCode,
    product_name: productName,
    publisher_vendor_id: publisherVendorId,
    category,
    deployment_model: deploymentModel,
    licensing_metric: licensingMetric,
    status,
    version_policy: versionPolicy,
    notes: normalizeNullableText(body.notes),
  };

  const created = await insertSoftwareProduct(app, payload);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "SOFTWARE_PRODUCT_CREATED",
    entityType: "SOFTWARE_PRODUCT",
    entityId: created.id,
    payload: {
      product_code: created.product_code,
      product_name: created.product_name,
      publisher_vendor_id: created.publisher_vendor_id,
      category: created.category,
      deployment_model: created.deployment_model,
      licensing_metric: created.licensing_metric,
      status: created.status,
      version_policy: created.version_policy,
    },
  });

  return await findSoftwareProductById(app, tenantId, created.id);
}

export async function patchSoftwareProductService(app, req, softwareProductId, body) {
  const tenantId = getTenantIdStrict(req);
  const idNum = Number(softwareProductId);

  if (!Number.isFinite(idNum) || idNum <= 0) {
    const e = new Error("Invalid software product id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const current = await findSoftwareProductById(app, tenantId, idNum);
  if (!current) {
    const e = new Error("Software product not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "product_code")) {
    patch.product_code = validateProductCode(body.product_code);
  }

  if (Object.prototype.hasOwnProperty.call(body, "product_name")) {
    patch.product_name = validateProductName(body.product_name);
  }

  if (Object.prototype.hasOwnProperty.call(body, "publisher_vendor_id")) {
    patch.publisher_vendor_id = normalizeNullableInt(body.publisher_vendor_id);
    await ensureVendorIfPresent(app, tenantId, patch.publisher_vendor_id);
  }

  if (Object.prototype.hasOwnProperty.call(body, "category")) {
    patch.category = validateEnum("category", body.category, CATEGORIES);
  }

  if (Object.prototype.hasOwnProperty.call(body, "deployment_model")) {
    patch.deployment_model = validateEnum(
      "deployment_model",
      body.deployment_model,
      DEPLOYMENT_MODELS
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "licensing_metric")) {
    patch.licensing_metric = validateEnum(
      "licensing_metric",
      body.licensing_metric,
      LICENSING_METRICS
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    patch.status = validateEnum("status", body.status, STATUSES);
  }

  if (Object.prototype.hasOwnProperty.call(body, "version_policy")) {
    patch.version_policy = validateEnum(
      "version_policy",
      body.version_policy,
      VERSION_POLICIES
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    patch.notes = normalizeNullableText(body.notes);
  }

  if (Object.keys(patch).length === 0) {
    const e = new Error("No changes submitted");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  if (patch.product_code) {
    const duplicate = await findSoftwareProductByCode(
      app,
      tenantId,
      patch.product_code,
      idNum
    );
    if (duplicate) {
      const e = new Error("product_code already exists");
      e.statusCode = 409;
      e.code = "SOFTWARE_PRODUCT_CODE_TAKEN";
      e.details = { product_code: patch.product_code };
      throw e;
    }
  }

  const updated = await updateSoftwareProduct(app, tenantId, idNum, patch);
  if (!updated) {
    const e = new Error("Software product not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const after = await findSoftwareProductById(app, tenantId, idNum);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "SOFTWARE_PRODUCT_UPDATED",
    entityType: "SOFTWARE_PRODUCT",
    entityId: after.id,
    payload: {
      before: {
        product_code: current.product_code,
        product_name: current.product_name,
        publisher_vendor_id: current.publisher_vendor_id,
        category: current.category,
        deployment_model: current.deployment_model,
        licensing_metric: current.licensing_metric,
        status: current.status,
        version_policy: current.version_policy,
        notes: current.notes,
      },
      after: {
        product_code: after.product_code,
        product_name: after.product_name,
        publisher_vendor_id: after.publisher_vendor_id,
        category: after.category,
        deployment_model: after.deployment_model,
        licensing_metric: after.licensing_metric,
        status: after.status,
        version_policy: after.version_policy,
        notes: after.notes,
      },
    },
  });

  return after;
}
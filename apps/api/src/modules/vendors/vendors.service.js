import { insertAuditEvent } from "../../lib/audit.js";
import {
  countVendors,
  listVendors,
  findVendorById,
  findVendorByCode,
  insertVendor,
  updateVendor,
} from "./vendors.repo.js";

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

function validateVendorCode(v) {
  const code = toUpperOrNull(v);
  if (!code) {
    const e = new Error("vendor_code is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  if (!/^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(code)) {
    const e = new Error(
      "Invalid vendor_code. Use uppercase letters, numbers, underscore, or dash (2-100 chars)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { vendor_code: code };
    throw e;
  }

  return code;
}

function validateVendorName(v) {
  const name = String(v || "").trim();
  if (!name) {
    const e = new Error("vendor_name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return name;
}

function validateVendorType(v) {
  const type = toUpperOrNull(v);
  if (!type) {
    const e = new Error("vendor_type is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const allowed = [
    "SOFTWARE_PUBLISHER",
    "HARDWARE_SUPPLIER",
    "SERVICE_PROVIDER",
    "CLOUD_PROVIDER",
    "MSP",
    "OTHER",
  ];

  if (!allowed.includes(type)) {
    const e = new Error(
      "Invalid vendor_type (must be SOFTWARE_PUBLISHER|HARDWARE_SUPPLIER|SERVICE_PROVIDER|CLOUD_PROVIDER|MSP|OTHER)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { vendor_type: type };
    throw e;
  }

  return type;
}

function validateVendorStatus(v) {
  const status = toUpperOrNull(v) || "ACTIVE";
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    const e = new Error("Invalid status (must be ACTIVE|INACTIVE)");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { status };
    throw e;
  }
  return status;
}

function validateEmailIfPresent(v) {
  const email = normalizeNullableText(v);
  if (!email) return null;

  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!ok) {
    const e = new Error("primary_contact_email is invalid");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { primary_contact_email: email };
    throw e;
  }

  return email;
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

export async function getVendorsService(app, req) {
  const tenantId = getTenantIdStrict(req);

  const filters = {
    search: normalizeNullableText(req.query?.search),
    status: req.query?.status ? validateVendorStatus(req.query.status) : null,
    page: validatePage(req.query?.page, 1),
    pageSize: validatePageSize(req.query?.pageSize, 20),
  };

  const [items, total] = await Promise.all([
    listVendors(app, tenantId, filters),
    countVendors(app, tenantId, filters),
  ]);

  return {
    items,
    total,
    page: filters.page,
    page_size: filters.pageSize,
    filters: {
      search: filters.search || "",
      status: filters.status,
    },
  };
}

export async function getVendorDetailService(app, req) {
  const tenantId = getTenantIdStrict(req);
  const vendorId = Number(req.params?.id);

  if (!Number.isFinite(vendorId) || vendorId <= 0) {
    const e = new Error("Invalid vendor id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const vendor = await findVendorById(app, tenantId, vendorId);
  if (!vendor) {
    const e = new Error("Vendor not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  return vendor;
}

export async function createVendorService(app, req, body) {
  const tenantId = getTenantIdStrict(req);

  const vendorCode = validateVendorCode(body.vendor_code);
  const vendorName = validateVendorName(body.vendor_name);
  const vendorType = validateVendorType(body.vendor_type);
  const status = validateVendorStatus(body.status);

  const payload = {
    tenant_id: tenantId,
    vendor_code: vendorCode,
    vendor_name: vendorName,
    vendor_type: vendorType,
    status,
    primary_contact_name: normalizeNullableText(body.primary_contact_name),
    primary_contact_email: validateEmailIfPresent(body.primary_contact_email),
    primary_contact_phone: normalizeNullableText(body.primary_contact_phone),
    notes: normalizeNullableText(body.notes),
  };

  const existing = await findVendorByCode(app, tenantId, vendorCode);
  if (existing) {
    const e = new Error("vendor_code already exists");
    e.statusCode = 409;
    e.code = "VENDOR_CODE_TAKEN";
    e.details = { vendor_code: vendorCode };
    throw e;
  }

  const created = await insertVendor(app, payload);

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "VENDOR_CREATED",
    entityType: "VENDOR",
    entityId: created.id,
    payload: {
      vendor_code: created.vendor_code,
      vendor_name: created.vendor_name,
      vendor_type: created.vendor_type,
      status: created.status,
    },
  });

  return created;
}

export async function patchVendorService(app, req, vendorId, body) {
  const tenantId = getTenantIdStrict(req);
  const idNum = Number(vendorId);

  if (!Number.isFinite(idNum) || idNum <= 0) {
    const e = new Error("Invalid vendor id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const current = await findVendorById(app, tenantId, idNum);
  if (!current) {
    const e = new Error("Vendor not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "vendor_code")) {
    patch.vendor_code = validateVendorCode(body.vendor_code);
  }

  if (Object.prototype.hasOwnProperty.call(body, "vendor_name")) {
    patch.vendor_name = validateVendorName(body.vendor_name);
  }

  if (Object.prototype.hasOwnProperty.call(body, "vendor_type")) {
    patch.vendor_type = validateVendorType(body.vendor_type);
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    patch.status = validateVendorStatus(body.status);
  }

  if (Object.prototype.hasOwnProperty.call(body, "primary_contact_name")) {
    patch.primary_contact_name = normalizeNullableText(body.primary_contact_name);
  }

  if (Object.prototype.hasOwnProperty.call(body, "primary_contact_email")) {
    patch.primary_contact_email = validateEmailIfPresent(body.primary_contact_email);
  }

  if (Object.prototype.hasOwnProperty.call(body, "primary_contact_phone")) {
    patch.primary_contact_phone = normalizeNullableText(body.primary_contact_phone);
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

  if (patch.vendor_code) {
    const duplicate = await findVendorByCode(
      app,
      tenantId,
      patch.vendor_code,
      idNum
    );
    if (duplicate) {
      const e = new Error("vendor_code already exists");
      e.statusCode = 409;
      e.code = "VENDOR_CODE_TAKEN";
      e.details = { vendor_code: patch.vendor_code };
      throw e;
    }
  }

  const updated = await updateVendor(app, tenantId, idNum, patch);
  if (!updated) {
    const e = new Error("Vendor not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "VENDOR_UPDATED",
    entityType: "VENDOR",
    entityId: updated.id,
    payload: {
      before: {
        vendor_code: current.vendor_code,
        vendor_name: current.vendor_name,
        vendor_type: current.vendor_type,
        status: current.status,
        primary_contact_name: current.primary_contact_name,
        primary_contact_email: current.primary_contact_email,
        primary_contact_phone: current.primary_contact_phone,
        notes: current.notes,
      },
      after: {
        vendor_code: updated.vendor_code,
        vendor_name: updated.vendor_name,
        vendor_type: updated.vendor_type,
        status: updated.status,
        primary_contact_name: updated.primary_contact_name,
        primary_contact_email: updated.primary_contact_email,
        primary_contact_phone: updated.primary_contact_phone,
        notes: updated.notes,
      },
    },
  });

  return updated;
}
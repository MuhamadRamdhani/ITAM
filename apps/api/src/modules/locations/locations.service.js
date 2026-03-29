import { getUiConfig } from "../config/config.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";
import {
  getLocationById,
  locationCodeExists,
  listLocations,
  insertLocation,
  updateLocation,
} from "./locations.repo.js";

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

async function resolvePageSizeStrict(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options) ? cfg.page_size_options : [];
  const def = Number(cfg.documents_page_size_default);

  if (requested == null) return def;

  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error("Invalid page_size");
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { got: requested };
    throw e;
  }

  if (!options.includes(n)) {
    const e = new Error(`page_size must be one of: ${options.join(", ")}`);
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { allowed: options, got: n };
    throw e;
  }

  return n;
}

function normalizeCode(code) {
  const v = String(code || "").trim().toUpperCase();
  return v || null;
}

function validateCodeOrNull(code) {
  if (code == null) return null;
  const v = normalizeCode(code);
  if (!v) return null;

  if (!/^[A-Z0-9][A-Z0-9 _-]{0,79}$/.test(v)) {
    const e = new Error(
      "Invalid location code. Use uppercase letters, numbers, space, underscore, or dash (max 80 chars)"
    );
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    e.details = { code: v };
    throw e;
  }

  return v;
}

function validateName(name) {
  const v = String(name || "").trim();
  if (!v) {
    const e = new Error("Location name is required");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return v;
}

export async function listLocationsService(app, req, { q, page, pageSize }) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listLocations(
    app,
    tenantId,
    q ? String(q).trim() : null,
    p,
    ps
  );

  return {
    items: out.items,
    total: out.total,
    page: p,
    page_size: ps,
  };
}

export async function createLocationService(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const code = validateCodeOrNull(body.code);
  const name = validateName(body.name);

  if (code) {
    const exists = await locationCodeExists(app, tenantId, code);
    if (exists) {
      const e = new Error("Location code already exists in tenant");
      e.statusCode = 409;
      e.code = "LOCATION_CODE_TAKEN";
      e.details = { code };
      throw e;
    }
  }

  const locationId = await insertLocation(app, {
    tenantId,
    code,
    name,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "LOCATION_CREATED",
    entityType: "LOCATION",
    entityId: locationId,
    payload: {
      code,
      name,
    },
  });

  return await getLocationById(app, tenantId, locationId);
}

export async function patchLocationService(app, req, locationId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "SUPERADMIN"]);

  const current = await getLocationById(app, tenantId, locationId);
  if (!current) {
    const e = new Error("Location not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const code = validateCodeOrNull(body.code);
  const name = validateName(body.name);

  if (code) {
    const exists = await locationCodeExists(app, tenantId, code, locationId);
    if (exists) {
      const e = new Error("Location code already exists in tenant");
      e.statusCode = 409;
      e.code = "LOCATION_CODE_TAKEN";
      e.details = { code };
      throw e;
    }
  }

  await updateLocation(app, tenantId, locationId, {
    code,
    name,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "LOCATION_UPDATED",
    entityType: "LOCATION",
    entityId: locationId,
    payload: {
      from: {
        code: current.code,
        name: current.name,
      },
      to: {
        code,
        name,
      },
    },
  });

  return await getLocationById(app, tenantId, locationId);
}
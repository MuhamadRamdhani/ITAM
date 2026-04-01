import { resolveIdByCode, requireExistsById } from "../../lib/refIntegrity.js";
import { insertAuditEvent } from "../../lib/audit.js";
import { getUiConfig } from "../config/config.repo.js";
import {
  countAssets,
  listAssets as repoListAssets,
  getAssetById as repoGetAssetById,
  insertAsset,
  updateAsset,
} from "./assets.repo.js";

function makeBadRequest(code, message, details) {
  const e = new Error(message);
  e.statusCode = 400;
  e.code = code;
  e.details = details;
  return e;
}

function mustTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId;
  if (!tenantId) {
    const e = new Error("Missing tenantId in request context");
    e.statusCode = 500;
    e.code = "TENANT_CONTEXT_MISSING";
    throw e;
  }
  return Number(tenantId);
}

function actorStr(req) {
  const a = req?.actor;
  if (a?.type === "USER" && a?.id) return `USER:${a.id}`;
  return "SYSTEM";
}

function mustHaveAnyRole(req, allowed) {
  const raw = Array.isArray(req.requestContext?.roles) ? req.requestContext.roles : [];
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
    throw makeBadRequest("INVALID_PAGE_SIZE", "Invalid page_size", { got: requested });
  }
  if (!options.includes(n)) {
    throw makeBadRequest("INVALID_PAGE_SIZE", `page_size must be one of: ${options.join(", ")}`, {
      allowed: options,
      got: n,
    });
  }
  return n;
}

function normalizeDateInput(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const s = String(value).trim();
  if (s === "") return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw makeBadRequest("INVALID_DATE", `Invalid ${fieldName}`, {
      field: fieldName,
      got: value,
      expected_format: "YYYY-MM-DD",
    });
  }

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw makeBadRequest("INVALID_DATE", `Invalid ${fieldName}`, {
      field: fieldName,
      got: value,
      expected_format: "YYYY-MM-DD",
    });
  }

  return s;
}

function compareDateStrings(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function validateDateRange(startDate, endDate, startField, endField) {
  if (!startDate || !endDate) return;

  if (compareDateStrings(endDate, startDate) < 0) {
    throw makeBadRequest(
      "INVALID_DATE_RANGE",
      `${endField} cannot be earlier than ${startField}`,
      {
        start_field: startField,
        end_field: endField,
        start_date: startDate,
        end_date: endDate,
      }
    );
  }
}

const HARDWARE_TYPE_CODES = new Set(["HARDWARE", "NETWORK"]);
const SUBSCRIPTION_TYPE_CODES = new Set(["SAAS", "CLOUD", "VM_CONTAINER"]);

function normalizeAssetTypeCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function hasAnyDate(...values) {
  return values.some((value) => String(value ?? "").trim() !== "");
}

function requireCoverageDates(assetTypeCode, coverage, contextLabel) {
  const normalizedType = normalizeAssetTypeCode(assetTypeCode);
  const hasWarranty = hasAnyDate(coverage.warrantyStartDate, coverage.warrantyEndDate);
  const hasSupport = hasAnyDate(coverage.supportStartDate, coverage.supportEndDate);
  const hasSubscription = hasAnyDate(
    coverage.subscriptionStartDate,
    coverage.subscriptionEndDate
  );

  if (HARDWARE_TYPE_CODES.has(normalizedType)) {
    if (!coverage.warrantyStartDate || !coverage.warrantyEndDate) {
      throw makeBadRequest(
        "WARRANTY_REQUIRED",
        `Hardware assets require warranty_start_date and warranty_end_date during ${contextLabel}.`,
        {
          asset_type_code: normalizedType,
          required_fields: ["warranty_start_date", "warranty_end_date"],
        }
      );
    }

    if (hasSubscription && !hasSupport) {
      throw makeBadRequest(
        "INVALID_COVERAGE_FIELDS",
        `Hardware assets should not use subscription dates. Use warranty/support dates instead during ${contextLabel}.`,
        {
          asset_type_code: normalizedType,
          allowed_fields: ["warranty_start_date", "warranty_end_date", "support_start_date", "support_end_date"],
        }
      );
    }
  }

  if (SUBSCRIPTION_TYPE_CODES.has(normalizedType)) {
    if (!coverage.subscription_start_date || !coverage.subscription_end_date) {
      throw makeBadRequest(
        "SUBSCRIPTION_REQUIRED",
        `Subscription-based assets require subscription_start_date and subscription_end_date during ${contextLabel}.`,
        {
          asset_type_code: normalizedType,
          required_fields: ["subscription_start_date", "subscription_end_date"],
        }
      );
    }
  }

  if (normalizedType === "SOFTWARE") {
    if (!hasSubscription && !hasSupport && !hasWarranty) {
      return;
    }
  }
}

function pickCreateDate(body, fieldName) {
  return normalizeDateInput(body?.[fieldName], fieldName) ?? null;
}

export async function listAssets(app, req, query) {
  const tenantId = mustTenantId(req);
  const page = Math.max(Number(query.page ?? 1), 1);
  const pageSize = await resolvePageSizeStrict(app, tenantId, query.page_size);

  const filters = {
    q: query.q ? String(query.q).trim() : null,
    type_code: query.type_code ? String(query.type_code) : null,
    state_code: query.state_code ? String(query.state_code) : null,
  };

  const total = await countAssets(app, tenantId, filters);
  const items = await repoListAssets(app, tenantId, filters, page, pageSize);

  return { items, page, page_size: pageSize, total };
}

export async function getAssetDetail(app, req, assetId) {
  const tenantId = mustTenantId(req);
  return await repoGetAssetById(app, tenantId, assetId);
}

export async function createAsset(app, req, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const assetTypeId = await resolveIdByCode(app, tenantId, "asset_types", body.asset_type_code);
  const stateId = await resolveIdByCode(app, tenantId, "lifecycle_states", body.initial_state_code);

  await requireExistsById(app, tenantId, "departments", body.owner_department_id ?? null);
  await requireExistsById(app, tenantId, "identities", body.current_custodian_identity_id ?? null);
  await requireExistsById(app, tenantId, "locations", body.location_id ?? null);

  const purchaseDate = pickCreateDate(body, "purchase_date");
  const warrantyStartDate = pickCreateDate(body, "warranty_start_date");
  const warrantyEndDate = pickCreateDate(body, "warranty_end_date");
  const supportStartDate = pickCreateDate(body, "support_start_date");
  const supportEndDate = pickCreateDate(body, "support_end_date");
  const subscriptionStartDate = pickCreateDate(body, "subscription_start_date");
  const subscriptionEndDate = pickCreateDate(body, "subscription_end_date");

  validateDateRange(
    warrantyStartDate,
    warrantyEndDate,
    "warranty_start_date",
    "warranty_end_date"
  );
  validateDateRange(
    supportStartDate,
    supportEndDate,
    "support_start_date",
    "support_end_date"
  );
  validateDateRange(
    subscriptionStartDate,
    subscriptionEndDate,
    "subscription_start_date",
    "subscription_end_date"
  );

  requireCoverageDates(
    body.asset_type_code,
    {
      warrantyStartDate,
      warrantyEndDate,
      supportStartDate,
      supportEndDate,
      subscriptionStartDate,
      subscriptionEndDate,
    },
    "asset creation"
  );

  const id = await insertAsset(app, {
    tenant_id: tenantId,
    asset_tag: body.asset_tag,
    name: body.name,
    status: body.status ?? null,
    asset_type_id: assetTypeId,
    current_state_id: stateId,
    owner_department_id: body.owner_department_id ?? null,
    current_custodian_identity_id: body.current_custodian_identity_id ?? null,
    location_id: body.location_id ?? null,

    purchase_date: purchaseDate,
    warranty_start_date: warrantyStartDate,
    warranty_end_date: warrantyEndDate,
    support_start_date: supportStartDate,
    support_end_date: supportEndDate,
    subscription_start_date: subscriptionStartDate,
    subscription_end_date: subscriptionEndDate,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorStr(req),
    action: "ASSET_CREATED",
    entityType: "ASSET",
    entityId: id,
    payload: {
      asset_tag: body.asset_tag,
      name: body.name,
      status: body.status ?? null,
      asset_type_id: assetTypeId,
      current_state_id: stateId,
      owner_department_id: body.owner_department_id ?? null,
      current_custodian_identity_id: body.current_custodian_identity_id ?? null,
      location_id: body.location_id ?? null,

      purchase_date: purchaseDate,
      warranty_start_date: warrantyStartDate,
      warranty_end_date: warrantyEndDate,
      support_start_date: supportStartDate,
      support_end_date: supportEndDate,
      subscription_start_date: subscriptionStartDate,
      subscription_end_date: subscriptionEndDate,
    },
  });

  return id;
}

export async function patchAsset(app, req, assetId, body) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const current = await repoGetAssetById(app, tenantId, assetId);
  if (!current) return null;

  if ("owner_department_id" in body) {
    await requireExistsById(app, tenantId, "departments", body.owner_department_id);
  }
  if ("current_custodian_identity_id" in body) {
    await requireExistsById(app, tenantId, "identities", body.current_custodian_identity_id);
  }
  if ("location_id" in body) {
    await requireExistsById(app, tenantId, "locations", body.location_id);
  }

  const nextWarrantyStart =
    "warranty_start_date" in body
      ? normalizeDateInput(body.warranty_start_date, "warranty_start_date") ?? null
      : current.warranty_start_date ?? null;

  const nextWarrantyEnd =
    "warranty_end_date" in body
      ? normalizeDateInput(body.warranty_end_date, "warranty_end_date") ?? null
      : current.warranty_end_date ?? null;

  const nextSupportStart =
    "support_start_date" in body
      ? normalizeDateInput(body.support_start_date, "support_start_date") ?? null
      : current.support_start_date ?? null;

  const nextSupportEnd =
    "support_end_date" in body
      ? normalizeDateInput(body.support_end_date, "support_end_date") ?? null
      : current.support_end_date ?? null;

  const nextSubscriptionStart =
    "subscription_start_date" in body
      ? normalizeDateInput(body.subscription_start_date, "subscription_start_date") ?? null
      : current.subscription_start_date ?? null;

  const nextSubscriptionEnd =
    "subscription_end_date" in body
      ? normalizeDateInput(body.subscription_end_date, "subscription_end_date") ?? null
      : current.subscription_end_date ?? null;

  validateDateRange(
    nextWarrantyStart,
    nextWarrantyEnd,
    "warranty_start_date",
    "warranty_end_date"
  );
  validateDateRange(
    nextSupportStart,
    nextSupportEnd,
    "support_start_date",
    "support_end_date"
  );
  validateDateRange(
    nextSubscriptionStart,
    nextSubscriptionEnd,
    "subscription_start_date",
    "subscription_end_date"
  );

  requireCoverageDates(
    current.asset_type?.code,
    {
      warrantyStartDate: nextWarrantyStart,
      warrantyEndDate: nextWarrantyEnd,
      supportStartDate: nextSupportStart,
      supportEndDate: nextSupportEnd,
      subscriptionStartDate: nextSubscriptionStart,
      subscriptionEndDate: nextSubscriptionEnd,
    },
    "asset update"
  );

  const patch = {};
  if ("name" in body) patch.name = body.name;
  if ("status" in body) patch.status = body.status;
  if ("owner_department_id" in body) patch.owner_department_id = body.owner_department_id;
  if ("current_custodian_identity_id" in body) {
    patch.current_custodian_identity_id = body.current_custodian_identity_id;
  }
  if ("location_id" in body) patch.location_id = body.location_id;

  if ("purchase_date" in body) {
    patch.purchase_date = normalizeDateInput(body.purchase_date, "purchase_date") ?? null;
  }
  if ("warranty_start_date" in body) patch.warranty_start_date = nextWarrantyStart;
  if ("warranty_end_date" in body) patch.warranty_end_date = nextWarrantyEnd;
  if ("support_start_date" in body) patch.support_start_date = nextSupportStart;
  if ("support_end_date" in body) patch.support_end_date = nextSupportEnd;
  if ("subscription_start_date" in body) {
    patch.subscription_start_date = nextSubscriptionStart;
  }
  if ("subscription_end_date" in body) {
    patch.subscription_end_date = nextSubscriptionEnd;
  }

  const updatedId = await updateAsset(app, tenantId, assetId, patch);
  if (updatedId) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorStr(req),
      action: "ASSET_UPDATED",
      entityType: "ASSET",
      entityId: assetId,
      payload: {
        changes: patch,
      },
    });
  }
  return updatedId;
}

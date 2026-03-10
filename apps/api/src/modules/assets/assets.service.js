import { resolveIdByCode, requireExistsById } from "../../lib/refIntegrity.js";
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

async function resolvePageSizeStrict(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options) ? cfg.page_size_options : [];
  const def = Number(cfg.documents_page_size_default);

  // STRICT default from config
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

export async function listAssets(app, tenantId, query) {
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

export async function getAssetDetail(app, tenantId, assetId) {
  return await repoGetAssetById(app, tenantId, assetId);
}

export async function createAsset(app, tenantId, body) {
  const assetTypeId = await resolveIdByCode(app, tenantId, "asset_types", body.asset_type_code);
  const stateId = await resolveIdByCode(app, tenantId, "lifecycle_states", body.initial_state_code);

  await requireExistsById(app, tenantId, "departments", body.owner_department_id ?? null);
  await requireExistsById(app, tenantId, "identities", body.current_custodian_identity_id ?? null);
  await requireExistsById(app, tenantId, "locations", body.location_id ?? null);

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
  });

  return id;
}

export async function patchAsset(app, tenantId, assetId, body) {
  if ("owner_department_id" in body) {
    await requireExistsById(app, tenantId, "departments", body.owner_department_id);
  }
  if ("current_custodian_identity_id" in body) {
    await requireExistsById(app, tenantId, "identities", body.current_custodian_identity_id);
  }
  if ("location_id" in body) {
    await requireExistsById(app, tenantId, "locations", body.location_id);
  }

  const patch = {};
  if ("name" in body) patch.name = body.name;
  if ("status" in body) patch.status = body.status;
  if ("owner_department_id" in body) patch.owner_department_id = body.owner_department_id;
  if ("current_custodian_identity_id" in body)
    patch.current_custodian_identity_id = body.current_custodian_identity_id;
  if ("location_id" in body) patch.location_id = body.location_id;

  const updatedId = await updateAsset(app, tenantId, assetId, patch);
  return updatedId;
}
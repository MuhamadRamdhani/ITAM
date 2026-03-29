import { requireExistsById } from "../../lib/refIntegrity.js";
import { insertAuditEvent } from "../../lib/audit.js";
import {
  listContractDocuments,
  insertContractDocument,
  deleteContractDocument,
  listContractAssets,
  insertContractAsset,
  deleteContractAsset,
} from "./contracts.relations.repo.js";
import {
  attachEvidenceLinkService,
  listEvidenceLinksService,
  detachEvidenceLinkService,
} from "../evidence/evidence.service.js";

function mustTenantId(req) {
  const tenantId = req.tenantId ?? req.requestContext?.tenantId;
  if (!tenantId) {
    const e = new Error("Missing tenantId in request context");
    e.statusCode = 500;
    e.code = "TENANT_CONTEXT_MISSING";
    throw e;
  }
  return tenantId;
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

function mustPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error(`${fieldName} must be a positive integer`);
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  return n;
}

function actorFromIdentityId(identityId) {
  if (Number.isFinite(identityId) && identityId > 0) {
    return `IDENTITY:${identityId}`;
  }
  return "SYSTEM";
}

function pageNum(raw, fallback = 1) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function listContractDocumentsService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  const page = pageNum(req.query?.page, 1);
  const pageSize = pageNum(req.query?.page_size, 20);

  const out = await listContractDocuments(app, tenantId, contractId, page, pageSize);

  return {
    items: out.items,
    total: out.total,
    page,
    page_size: pageSize,
  };
}

export async function attachContractDocumentService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const documentId = mustPositiveInt(req.body?.document_id, "document_id");
  const note = req.body?.note ?? null;

  await requireExistsById(app, tenantId, "contracts", contractId);
  await requireExistsById(app, tenantId, "documents", documentId);

  try {
    const link = await insertContractDocument(app, {
      tenant_id: tenantId,
      contract_id: contractId,
      document_id: documentId,
      note,
      created_by_identity_id: actorId ?? null,
    });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "CONTRACT_DOCUMENT_ATTACHED",
      entityType: "CONTRACT",
      entityId: contractId,
      payload: {
        contract_id: contractId,
        document_id: documentId,
        note,
      },
    });

    return link;
  } catch (e) {
    if (e?.code === "23505") {
      const err = new Error("Document already attached to this contract");
      err.statusCode = 409;
      err.code = "DUPLICATE_RELATION";
      throw err;
    }
    throw e;
  }
}

export async function detachContractDocumentService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const documentId = mustPositiveInt(req.params?.documentId, "document id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  const deleted = await deleteContractDocument(app, tenantId, contractId, documentId);
  if (!deleted) {
    const e = new Error("Contract document relation not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "CONTRACT_DOCUMENT_DETACHED",
    entityType: "CONTRACT",
    entityId: contractId,
    payload: {
      contract_id: contractId,
      document_id: documentId,
    },
  });

  return deleted;
}

export async function listContractAssetsService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  const page = pageNum(req.query?.page, 1);
  const pageSize = pageNum(req.query?.page_size, 20);

  const out = await listContractAssets(app, tenantId, contractId, page, pageSize);

  return {
    items: out.items,
    total: out.total,
    page,
    page_size: pageSize,
  };
}

export async function attachContractAssetService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const assetId = mustPositiveInt(req.body?.asset_id, "asset_id");
  const note = req.body?.note ?? null;

  await requireExistsById(app, tenantId, "contracts", contractId);
  await requireExistsById(app, tenantId, "assets", assetId);

  try {
    const link = await insertContractAsset(app, {
      tenant_id: tenantId,
      contract_id: contractId,
      asset_id: assetId,
      note,
      created_by_identity_id: actorId ?? null,
    });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "CONTRACT_ASSET_ATTACHED",
      entityType: "CONTRACT",
      entityId: contractId,
      payload: {
        contract_id: contractId,
        asset_id: assetId,
        note,
      },
    });

    return link;
  } catch (e) {
    if (e?.code === "23505") {
      const err = new Error("Asset already attached to this contract");
      err.statusCode = 409;
      err.code = "DUPLICATE_RELATION";
      throw err;
    }
    throw e;
  }
}

export async function detachContractAssetService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const assetId = mustPositiveInt(req.params?.assetId, "asset id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  const deleted = await deleteContractAsset(app, tenantId, contractId, assetId);
  if (!deleted) {
    const e = new Error("Contract asset relation not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "CONTRACT_ASSET_DETACHED",
    entityType: "CONTRACT",
    entityId: contractId,
    payload: {
      contract_id: contractId,
      asset_id: assetId,
    },
  });

  return deleted;
}

export async function listContractEvidenceService(app, req) {
  const tenantId = mustTenantId(req);
  const contractId = mustPositiveInt(req.params?.id, "contract id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  return await listEvidenceLinksService(app, {
    tenantId,
    targetType: "CONTRACT",
    targetId: contractId,
    page: req.query?.page,
    pageSize: req.query?.page_size,
  });
}

export async function attachContractEvidenceService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const evidenceFileId = mustPositiveInt(
    req.body?.evidence_file_id,
    "evidence_file_id"
  );

  await requireExistsById(app, tenantId, "contracts", contractId);

  return await attachEvidenceLinkService(app, {
    tenantId,
    actorId,
    body: {
      target_type: "CONTRACT",
      target_id: contractId,
      evidence_file_id: evidenceFileId,
      note: req.body?.note ?? null,
    },
  });
}

export async function detachContractEvidenceService(app, req) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"]);

  const actorId = req.requestContext?.identityId ?? null;
  const contractId = mustPositiveInt(req.params?.id, "contract id");
  const linkId = mustPositiveInt(req.params?.linkId, "link id");

  await requireExistsById(app, tenantId, "contracts", contractId);

  return await detachEvidenceLinkService(app, {
    tenantId,
    actorId,
    linkId,
    targetType: "CONTRACT",
    targetId: contractId,
  });
}
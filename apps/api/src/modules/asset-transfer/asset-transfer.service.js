import {
  countAssetTransferRequests,
  countContractAssetLinksByAsset,
  deleteContractAssetLinksByAsset,
  findActiveTransferRequestByAsset,
  getAssetForTransferById,
  getAssetTransferEventsByRequestId,
  getAssetTransferRequestById,
  deleteAssetTransferRequestById,
  getTenantBasicById,
  insertAssetTransferEvent,
  insertAssetTransferRequest,
  listAssetTransferRequests,
  listTargetTenantOptions,
  updateAssetTenantForTransfer,
  updateAssetTransferRequest,
} from "./asset-transfer.repo.js";

const TRANSFER_REQUEST_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
  "CANCELLED",
]);

const DECISION_ACTIONS = new Set(["APPROVE", "REJECT"]);

const VIEW_ALLOWED_ROLES = ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"];
const CREATE_ALLOWED_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER"];
const SUBMIT_ALLOWED_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER"];
const DECIDE_ALLOWED_ROLES = ["TENANT_ADMIN", "ITAM_MANAGER"];

function httpError(statusCode, message, extra = undefined) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (extra !== undefined) {
    err.details = extra;
  }
  return err;
}

function mustTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId ?? null;
  if (!tenantId) throw httpError(401, "Unauthorized tenant context");
  return Number(tenantId);
}

function getRequestRoles(req) {
  const roles = req?.requestContext?.roles;
  if (!Array.isArray(roles)) return [];
  return roles
    .map((role) => String(role || "").trim().toUpperCase())
    .filter(Boolean);
}

function hasAnyRole(req, allowedRoles) {
  const roles = getRequestRoles(req);
  return roles.some((role) => allowedRoles.includes(role));
}

function assertHasAnyRole(req, allowedRoles, message) {
  if (!hasAnyRole(req, allowedRoles)) {
    const err = httpError(403, message, {
      code: "AUTH_FORBIDDEN",
      allowed_roles: allowedRoles,
    });
    err.code = "FORBIDDEN";
    throw err;
  }
}

function mustPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw httpError(400, `${fieldName} must be a positive integer`);
  }
  return n;
}

function normalizeString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeEnum(value) {
  const s = normalizeString(value);
  return s ? s.toUpperCase() : null;
}

function generateRequestCode(assetId) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `ATR-${assetId}-${stamp}`;
}

async function writeTransferEvent(app, req, transferRequestId, eventType, eventPayload = {}) {
  await insertAssetTransferEvent(app, {
    tenant_id: req?.tenantId ?? req?.requestContext?.tenantId ?? null,
    transfer_request_id: transferRequestId,
    event_type: eventType,
    event_payload_json: eventPayload,
    created_by_user_id: req?.requestContext?.userId ?? null,
    created_by_identity_id: req?.requestContext?.identityId ?? null,
  });
}

async function writeAssetTransferAudit(app, req, payload) {
  const auditPayload = {
    tenant_id: req?.tenantId ?? req?.requestContext?.tenantId ?? null,
    user_id: req?.requestContext?.userId ?? null,
    entity_type: payload?.entity_type ?? "ASSET",
    entity_id:
      payload?.entity_id ??
      payload?.transfer_request_id ??
      payload?.asset_id ??
      null,
    action: payload?.action ?? "ASSET_TRANSFER_EXECUTED",
    payload,
  };

  try {
    if (app?.audit?.logEvent) {
      await app.audit.logEvent(auditPayload);
      return;
    }
    if (typeof app?.logAuditEvent === "function") {
      await app.logAuditEvent(auditPayload);
      return;
    }
    if (typeof app?.createAuditEvent === "function") {
      await app.createAuditEvent(auditPayload);
      return;
    }
  } catch (err) {
    app.log?.warn?.({ err }, "asset transfer audit logging skipped");
  }
}

async function buildTransferPreview(app, sourceTenantId, assetId, targetTenantId, options = {}) {
  const excludeRequestId =
    options?.excludeRequestId == null ? null : Number(options.excludeRequestId);

  const asset = await getAssetForTransferById(app, sourceTenantId, assetId);
  if (!asset) {
    throw httpError(404, "Asset not found");
  }

  const targetTenant = await getTenantBasicById(app, targetTenantId);
  const activeRequest = await findActiveTransferRequestByAsset(
    app,
    sourceTenantId,
    assetId,
    excludeRequestId
  );
  const contractAssetLinkCount = await countContractAssetLinksByAsset(
    app,
    sourceTenantId,
    assetId
  );

  const blockedReasons = [];
  const warnings = [];

  if (!targetTenant) {
    blockedReasons.push("TARGET_TENANT_NOT_FOUND");
  } else {
    const targetStatus = normalizeEnum(targetTenant.status_code);

    if (targetTenantId === sourceTenantId) {
      blockedReasons.push("TARGET_TENANT_SAME_AS_SOURCE");
    }

    if (targetStatus && targetStatus !== "ACTIVE") {
      blockedReasons.push("TARGET_TENANT_NOT_ACTIVE");
    }
  }

  if (activeRequest) {
    blockedReasons.push("ASSET_HAS_ACTIVE_TRANSFER_REQUEST");
  }

  if (asset.owner_department_id != null) {
    warnings.push("OWNER_DEPARTMENT_WILL_BE_RESET");
  }

  if (asset.current_custodian_identity != null) {
    warnings.push("CUSTODIAN_IDENTITY_WILL_BE_RESET");
  }

  if (asset.location_id != null) {
    warnings.push("LOCATION_WILL_BE_RESET");
  }

  if (contractAssetLinkCount > 0) {
    warnings.push("CONTRACT_ASSET_LINKS_WILL_BE_REMOVED");
  }

  return {
    asset: {
      id: Number(asset.id),
      tenant_id: Number(asset.tenant_id),
      asset_tag: asset.asset_tag,
      asset_name: asset.name,
      status: asset.status,
      asset_type_id: asset.asset_type_id == null ? null : Number(asset.asset_type_id),
      current_state_id:
        asset.current_state_id == null ? null : Number(asset.current_state_id),
      owner_department_id:
        asset.owner_department_id == null ? null : Number(asset.owner_department_id),
      current_custodian_identity:
        asset.current_custodian_identity == null
          ? null
          : Number(asset.current_custodian_identity),
      location_id: asset.location_id == null ? null : Number(asset.location_id),
    },
    source_tenant_id: Number(sourceTenantId),
    target_tenant: targetTenant
      ? {
          id: Number(targetTenant.id),
          tenant_name: targetTenant.name,
          tenant_code: targetTenant.code,
          status: targetTenant.status_code,
        }
      : null,
    target_tenant_id: Number(targetTenantId),
    can_transfer: blockedReasons.length === 0,
    blocked_reasons: blockedReasons,
    warnings,
    active_request: activeRequest
      ? {
          id: Number(activeRequest.id),
          request_code: activeRequest.request_code,
          status: activeRequest.status,
          target_tenant_id: Number(activeRequest.target_tenant_id),
        }
      : null,
    relation_counts: {
      contract_asset_links: contractAssetLinkCount,
    },
    remap_requirements: {
      owner_department_id: "RESET_TO_NULL",
      current_custodian_identity: "RESET_TO_NULL",
      location_id: "RESET_TO_NULL",
    },
  };
}

async function executeApprovedTransfer(app, req, existing, preview) {
  const tenantId = Number(existing.tenant_id);
  const requestId = Number(existing.id);
  const assetId = Number(existing.asset_id);
  const targetTenantId = Number(existing.target_tenant_id);

  await writeTransferEvent(app, req, requestId, "TRANSFER_EXECUTION_STARTED", {
    asset_id: assetId,
    source_tenant_id: tenantId,
    target_tenant_id: targetTenantId,
    preview,
  });

  try {
    const removedContractLinks = await deleteContractAssetLinksByAsset(
      app,
      tenantId,
      assetId
    );

    const movedAsset = await updateAssetTenantForTransfer(
      app,
      tenantId,
      assetId,
      targetTenantId
    );

    if (!movedAsset) {
      throw httpError(500, "Failed to move asset to target tenant");
    }

    const executionResult = {
      asset_id: assetId,
      source_tenant_id: tenantId,
      target_tenant_id: targetTenantId,
      removed_contract_asset_links: removedContractLinks,
      reset_fields: [
        "owner_department_id",
        "current_custodian_identity",
        "location_id",
      ],
      executed_at: new Date().toISOString(),
    };

    await updateAssetTransferRequest(app, tenantId, requestId, {
      status: "EXECUTED",
      executed_at: executionResult.executed_at,
      execution_result_json: executionResult,
    });

    await writeTransferEvent(app, req, requestId, "TRANSFER_EXECUTION_COMPLETED", {
      ...executionResult,
      preview,
    });

    await writeAssetTransferAudit(app, req, {
      action: "ASSET_TRANSFER_EXECUTED",
      transfer_request_id: requestId,
      asset_id: assetId,
      source_tenant_id: tenantId,
      target_tenant_id: targetTenantId,
      removed_contract_asset_links: removedContractLinks,
    });
  } catch (err) {
    const executionFailedAt = new Date().toISOString();

    await updateAssetTransferRequest(app, tenantId, requestId, {
      status: "FAILED",
      execution_result_json: {
        error_message: err?.message || "Asset transfer execution failed",
        failed_at: executionFailedAt,
      },
    });

    await writeTransferEvent(app, req, requestId, "TRANSFER_EXECUTION_FAILED", {
      asset_id: assetId,
      source_tenant_id: tenantId,
      target_tenant_id: targetTenantId,
      failed_at: executionFailedAt,
      error_message: err?.message || "Asset transfer execution failed",
      preview,
    });

    throw err;
  }
}

export async function getAssetTransferPreviewService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    CREATE_ALLOWED_ROLES,
    "You are not allowed to preview asset transfer requests"
  );

  const assetId = mustPositiveInt(req.query?.asset_id, "asset_id");
  const targetTenantId = mustPositiveInt(
    req.query?.target_tenant_id,
    "target_tenant_id"
  );

  return buildTransferPreview(app, tenantId, assetId, targetTenantId);
}

export async function getTargetTenantOptionsService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    CREATE_ALLOWED_ROLES,
    "You are not allowed to access target tenant options for asset transfer"
  );

  const q = typeof req.query?.q === "string" ? req.query.q : "";
  const limitRaw =
    typeof req.query?.limit === "string" || typeof req.query?.limit === "number"
      ? Number(req.query.limit)
      : 50;

  const limit = Number.isFinite(limitRaw) ? limitRaw : 50;

  return listTargetTenantOptions(app, {
    sourceTenantId: tenantId,
    q,
    limit,
  });
}

export async function listAssetTransferRequestsService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    VIEW_ALLOWED_ROLES,
    "You are not allowed to view asset transfer requests"
  );

  const page = Math.max(1, Number(req.query?.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query?.page_size || 20)));
  const offset = (page - 1) * pageSize;

  const search = normalizeString(req.query?.q ?? req.query?.search);
  const statusRaw = normalizeEnum(req.query?.status);
  const status = statusRaw === "ALL" ? null : statusRaw;

  const assetId =
    req.query?.asset_id != null && req.query?.asset_id !== ""
      ? mustPositiveInt(req.query.asset_id, "asset_id")
      : null;

  const targetTenantId =
    req.query?.target_tenant_id != null && req.query?.target_tenant_id !== ""
      ? mustPositiveInt(req.query.target_tenant_id, "target_tenant_id")
      : null;

  if (status && !TRANSFER_REQUEST_STATUSES.has(status)) {
    throw httpError(400, "Invalid status");
  }

  const filters = {
    tenantId,
    search,
    status,
    assetId,
    targetTenantId,
    limit: pageSize,
    offset,
  };

  const [rows, total] = await Promise.all([
    listAssetTransferRequests(app, filters),
    countAssetTransferRequests(app, filters),
  ]);

  return {
    rows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getAssetTransferRequestDetailService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    VIEW_ALLOWED_ROLES,
    "You are not allowed to view asset transfer request detail"
  );

  const requestId = mustPositiveInt(req.params?.id, "transfer request id");

  const row = await getAssetTransferRequestById(app, tenantId, requestId);
  if (!row) {
    throw httpError(404, "Asset transfer request not found");
  }

  const events = await getAssetTransferEventsByRequestId(app, tenantId, requestId);

  return {
    request: {
      ...row,
      id: Number(row.id),
      tenant_id: Number(row.tenant_id),
      asset_id: Number(row.asset_id),
      target_tenant_id: Number(row.target_tenant_id),
      current_asset_tenant_id:
        row.current_asset_tenant_id == null ? null : Number(row.current_asset_tenant_id),
      requested_by_user_id:
        row.requested_by_user_id == null ? null : Number(row.requested_by_user_id),
      requested_by_identity_id:
        row.requested_by_identity_id == null
          ? null
          : Number(row.requested_by_identity_id),
      decided_by_user_id:
        row.decided_by_user_id == null ? null : Number(row.decided_by_user_id),
      decided_by_identity_id:
        row.decided_by_identity_id == null
          ? null
          : Number(row.decided_by_identity_id),
    },
    events: events.map((event) => ({
      ...event,
      id: Number(event.id),
      tenant_id: Number(event.tenant_id),
      transfer_request_id: Number(event.transfer_request_id),
      created_by_user_id:
        event.created_by_user_id == null ? null : Number(event.created_by_user_id),
      created_by_identity_id:
        event.created_by_identity_id == null
          ? null
          : Number(event.created_by_identity_id),
    })),
  };
}

export async function createAssetTransferRequestService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    CREATE_ALLOWED_ROLES,
    "You are not allowed to create asset transfer requests"
  );

  const body = req.body || {};

  const assetId = mustPositiveInt(body.asset_id, "asset_id");
  const targetTenantId = mustPositiveInt(body.target_tenant_id, "target_tenant_id");
  const reason = normalizeString(body.reason);

  const preview = await buildTransferPreview(app, tenantId, assetId, targetTenantId);
  if (!preview.can_transfer) {
    throw httpError(400, "Asset transfer request cannot be created", {
      blocked_reasons: preview.blocked_reasons,
      warnings: preview.warnings,
    });
  }

  const inserted = await insertAssetTransferRequest(app, {
    tenant_id: tenantId,
    asset_id: assetId,
    target_tenant_id: targetTenantId,
    request_code: generateRequestCode(assetId),
    status: "DRAFT",
    reason,
    requested_by_user_id: req?.requestContext?.userId ?? null,
    requested_by_identity_id: req?.requestContext?.identityId ?? null,
    execution_result_json: {},
  });

  const row = await getAssetTransferRequestById(app, tenantId, inserted.id);

  await writeTransferEvent(app, req, inserted.id, "TRANSFER_REQUEST_CREATED", {
    asset_id: assetId,
    target_tenant_id: targetTenantId,
    preview,
  });

  return row;
}

export async function submitAssetTransferRequestService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    SUBMIT_ALLOWED_ROLES,
    "You are not allowed to submit asset transfer requests"
  );

  const requestId = mustPositiveInt(req.params?.id, "transfer request id");

  const existing = await getAssetTransferRequestById(app, tenantId, requestId);
  if (!existing) {
    throw httpError(404, "Asset transfer request not found");
  }

  if (normalizeEnum(existing.status) !== "DRAFT") {
    throw httpError(400, "Only DRAFT transfer requests can be submitted");
  }

  const preview = await buildTransferPreview(
    app,
    tenantId,
    Number(existing.asset_id),
    Number(existing.target_tenant_id),
    { excludeRequestId: requestId }
  );

  if (!preview.can_transfer) {
    throw httpError(400, "Transfer request cannot be submitted", {
      blocked_reasons: preview.blocked_reasons,
      warnings: preview.warnings,
    });
  }

  await updateAssetTransferRequest(app, tenantId, requestId, {
    status: "SUBMITTED",
    submitted_at: new Date().toISOString(),
  });

  await writeTransferEvent(app, req, requestId, "TRANSFER_REQUEST_SUBMITTED", {
    asset_id: Number(existing.asset_id),
    target_tenant_id: Number(existing.target_tenant_id),
    preview,
  });

  return getAssetTransferRequestById(app, tenantId, requestId);
}

export async function decideAssetTransferRequestService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    DECIDE_ALLOWED_ROLES,
    "You are not allowed to decide asset transfer requests"
  );

  const requestId = mustPositiveInt(req.params?.id, "transfer request id");
  const body = req.body || {};

  const action = normalizeEnum(body.action || body.decision);
  const decisionNote = normalizeString(body.decision_note);

  if (!action || !DECISION_ACTIONS.has(action)) {
    throw httpError(400, "action must be APPROVE or REJECT");
  }

  const existing = await getAssetTransferRequestById(app, tenantId, requestId);
  if (!existing) {
    throw httpError(404, "Asset transfer request not found");
  }

  if (normalizeEnum(existing.status) !== "SUBMITTED") {
    throw httpError(400, "Only SUBMITTED transfer requests can be decided");
  }

  if (action === "REJECT") {
    await updateAssetTransferRequest(app, tenantId, requestId, {
      status: "REJECTED",
      decided_at: new Date().toISOString(),
      decided_by_user_id: req?.requestContext?.userId ?? null,
      decided_by_identity_id: req?.requestContext?.identityId ?? null,
      decision_note: decisionNote,
    });

    await writeTransferEvent(app, req, requestId, "TRANSFER_REQUEST_REJECTED", {
      decision_note: decisionNote,
      asset_id: Number(existing.asset_id),
      target_tenant_id: Number(existing.target_tenant_id),
    });

    await writeAssetTransferAudit(app, req, {
      action: "ASSET_TRANSFER_REJECTED",
      transfer_request_id: requestId,
      asset_id: Number(existing.asset_id),
      source_tenant_id: tenantId,
      target_tenant_id: Number(existing.target_tenant_id),
      decision_note: decisionNote,
    });

    return getAssetTransferRequestById(app, tenantId, requestId);
  }

  const preview = await buildTransferPreview(
    app,
    tenantId,
    Number(existing.asset_id),
    Number(existing.target_tenant_id),
    { excludeRequestId: requestId }
  );

  if (!preview.can_transfer) {
    throw httpError(400, "Transfer request cannot be approved", {
      blocked_reasons: preview.blocked_reasons,
      warnings: preview.warnings,
    });
  }

  await updateAssetTransferRequest(app, tenantId, requestId, {
    status: "APPROVED",
    decided_at: new Date().toISOString(),
    decided_by_user_id: req?.requestContext?.userId ?? null,
    decided_by_identity_id: req?.requestContext?.identityId ?? null,
    decision_note: decisionNote,
  });

  await writeTransferEvent(app, req, requestId, "TRANSFER_REQUEST_APPROVED", {
    decision_note: decisionNote,
    asset_id: Number(existing.asset_id),
    target_tenant_id: Number(existing.target_tenant_id),
    preview,
  });

  await executeApprovedTransfer(app, req, existing, preview);

  return getAssetTransferRequestById(app, tenantId, requestId);
}

export async function deleteAssetTransferRequestService(app, req) {
  const tenantId = mustTenantId(req);
  assertHasAnyRole(
    req,
    ["SUPERADMIN", "TENANT_ADMIN", "ITAM_MANAGER"],
    "You are not allowed to delete asset transfer requests"
  );

  const requestId = mustPositiveInt(req.params?.id, "transfer request id");
  const existing = await getAssetTransferRequestById(app, tenantId, requestId);
  if (!existing) {
    throw httpError(404, "Asset transfer request not found");
  }

  if (normalizeEnum(existing.status) !== "DRAFT") {
    const err = httpError(409, "Only DRAFT transfer requests can be deleted", {
      status: existing.status,
    });
    err.code = "ASSET_TRANSFER_NOT_DELETABLE";
    throw err;
  }

  await writeAssetTransferAudit(app, req, {
    action: "ASSET_TRANSFER_REQUEST_DELETED",
    entity_type: "ASSET_TRANSFER_REQUEST",
    entity_id: requestId,
    transfer_request_id: requestId,
    asset_id: Number(existing.asset_id),
    target_tenant_id: Number(existing.target_tenant_id),
    request_code: existing.request_code,
    status: existing.status,
    tenant_id: tenantId,
  });

  const deleted = await deleteAssetTransferRequestById(app, tenantId, requestId);
  if (!deleted) {
    throw httpError(404, "Asset transfer request not found");
  }

  return deleted;
}

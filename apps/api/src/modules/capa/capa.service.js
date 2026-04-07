import { insertAuditEventDb } from '../../lib/audit.js';
import {
  CAPA_FOLLOW_UP_ROLES,
  CAPA_MANAGE_ROLES,
  CAPA_SEVERITIES,
  CAPA_SOURCE_TYPES,
  CAPA_STATUSES,
  CAPA_VIEW_ROLES,
  canAdvanceCapa,
  canEditCapaStructure,
} from './capa.constants.js';

function appError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function assert(condition, code, message, statusCode = 400) {
  if (!condition) {
    throw appError(code, message, statusCode);
  }
}

function normalizeText(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeDateOnly(value, fieldName, required = false) {
  if (value == null || value === '') {
    if (required) {
      throw appError('VALIDATION_ERROR', `${fieldName} is required`, 400);
    }
    return null;
  }

  const normalized = String(value).trim();
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(normalized),
    'VALIDATION_ERROR',
    `${fieldName} must be in YYYY-MM-DD format`,
    400,
  );

  return normalized;
}

function normalizePagination(query) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.page_size ?? 25)));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function sanitizeAuth(auth) {
  const tenantId = normalizeInteger(auth?.tenantId ?? auth?.tenant_id);
  const userId = normalizeInteger(auth?.userId ?? auth?.user_id);
  const identityId = normalizeInteger(auth?.identityId ?? auth?.identity_id);
  const roles = Array.isArray(auth?.roles) ? auth.roles : [];

  assert(tenantId > 0, 'AUTH_UNAUTHORIZED', 'Unauthorized', 401);

  return {
    tenantId,
    userId,
    identityId,
    roles,
  };
}

function ensureAnyRole(userRoles, allowedRoles) {
  const roleSet = new Set(Array.isArray(userRoles) ? userRoles : []);
  const matched = allowedRoles.some((role) => roleSet.has(role));
  assert(matched, 'AUTH_FORBIDDEN', 'Forbidden', 403);
}

async function ensureTenantIdentityExists(repo, tenantId, identityId, fieldName) {
  if (identityId == null) return;
  const row = await repo.findIdentityById({ tenantId, id: identityId });
  assert(row, 'IDENTITY_NOT_FOUND', `${fieldName} not found in this tenant`, 404);
}

async function safeWriteAuditEvent(db, event) {
  try {
    await insertAuditEventDb(db, {
      tenantId: event.tenantId,
      actor: String(event.actorUserId ?? 'SYSTEM'),
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload ?? null,
    });
  } catch {
    // best effort only
  }
}

function normalizeDetail(row) {
  return row;
}

export function buildCapaService({ repo, fastify }) {
  async function listCases(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_VIEW_ROLES);

    const { page, pageSize, offset } = normalizePagination(req.query ?? {});
    const filters = {
      tenantId: ctx.tenantId,
      q: normalizeText(req.query?.q),
      status: normalizeText(req.query?.status),
      sourceType: normalizeText(req.query?.source_type),
      severity: normalizeText(req.query?.severity),
      ownerIdentityId: normalizeInteger(req.query?.owner_identity_id),
      overdueOnly: Boolean(req.query?.overdue_only),
      limit: pageSize,
      offset,
    };

    const [items, total, summary] = await Promise.all([
      repo.listCases(filters),
      repo.countCases(filters),
      repo.countSummary(filters),
    ]);

    return {
      items,
      summary: {
        total_items: Number(summary?.total_items ?? total ?? 0),
        open_count: Number(summary?.open_count ?? 0),
        root_cause_count: Number(summary?.root_cause_count ?? 0),
        corrective_action_count: Number(summary?.corrective_action_count ?? 0),
        preventive_action_count: Number(summary?.preventive_action_count ?? 0),
        verification_count: Number(summary?.verification_count ?? 0),
        closed_count: Number(summary?.closed_count ?? 0),
        cancelled_count: Number(summary?.cancelled_count ?? 0),
        overdue_count: Number(summary?.overdue_count ?? 0),
      },
      pagination: {
        page,
        page_size: pageSize,
        total_items: total,
        total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async function getCase(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_VIEW_ROLES);
    const id = Number(req.params.id);

    const row = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!row) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    return normalizeDetail(row);
  }

  async function createCase(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);

    const body = req.body ?? {};
    const capaCode = normalizeText(body.capa_code);
    const title = normalizeText(body.title);
    const sourceType = normalizeText(body.source_type) ?? 'OTHER';
    const sourceId = normalizeInteger(body.source_id);
    const sourceLabel = normalizeText(body.source_label);
    const severity = normalizeText(body.severity) ?? 'MEDIUM';
    const ownerIdentityId = normalizeInteger(body.owner_identity_id);
    const dueDate = normalizeDateOnly(body.due_date, 'due_date');
    const nonconformitySummary = normalizeText(body.nonconformity_summary);
    const notes = normalizeText(body.notes);

    assert(capaCode, 'VALIDATION_ERROR', 'capa_code is required', 400);
    assert(title, 'VALIDATION_ERROR', 'title is required', 400);
    assert(CAPA_SOURCE_TYPES.includes(sourceType), 'VALIDATION_ERROR', 'Invalid source_type', 400);
    assert(CAPA_SEVERITIES.includes(severity), 'VALIDATION_ERROR', 'Invalid severity', 400);
    await ensureTenantIdentityExists(repo, ctx.tenantId, ownerIdentityId, 'owner_identity_id');

    try {
      const id = await repo.insertCase({
        tenantId: ctx.tenantId,
        capaCode,
        title,
        sourceType,
        sourceId,
        sourceLabel,
        severity,
        ownerIdentityId,
        dueDate,
        nonconformitySummary,
        notes,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'capa.case_created',
        entityType: 'CAPA_CASE',
        entityId: id,
        payload: {
          capa_code: capaCode,
          title,
          source_type: sourceType,
          severity,
        },
      });

      return { id };
    } catch (error) {
      if (error?.code === '23505') {
        throw appError('CAPA_CODE_EXISTS', `CAPA code "${capaCode}" already exists`, 409);
      }
      throw error;
    }
  }

  async function updateCase(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    if (!canEditCapaStructure(existing.status)) {
      throw appError('CAPA_READ_ONLY', 'This CAPA case can no longer be edited', 409);
    }

    const incoming = req.body ?? {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'capa_code')) {
      patch.capa_code = normalizeText(incoming.capa_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'title')) {
      patch.title = normalizeText(incoming.title);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'source_type')) {
      patch.source_type = normalizeText(incoming.source_type);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'source_id')) {
      patch.source_id = normalizeInteger(incoming.source_id);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'source_label')) {
      patch.source_label = normalizeText(incoming.source_label);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'severity')) {
      patch.severity = normalizeText(incoming.severity);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'owner_identity_id')) {
      patch.owner_identity_id = normalizeInteger(incoming.owner_identity_id);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'due_date')) {
      patch.due_date = normalizeDateOnly(incoming.due_date, 'due_date');
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'nonconformity_summary')) {
      patch.nonconformity_summary = normalizeText(incoming.nonconformity_summary);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'notes')) {
      patch.notes = normalizeText(incoming.notes);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'source_type')) {
      assert(CAPA_SOURCE_TYPES.includes(patch.source_type), 'VALIDATION_ERROR', 'Invalid source_type', 400);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'severity')) {
      assert(CAPA_SEVERITIES.includes(patch.severity), 'VALIDATION_ERROR', 'Invalid severity', 400);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'owner_identity_id')) {
      await ensureTenantIdentityExists(repo, ctx.tenantId, patch.owner_identity_id, 'owner_identity_id');
    }

    if (Object.keys(patch).length === 0) {
      return { id };
    }

    try {
      await repo.updateCase({
        tenantId: ctx.tenantId,
        id,
        patch,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'capa.case_updated',
        entityType: 'CAPA_CASE',
        entityId: id,
        payload: patch,
      });

      return { id };
    } catch (error) {
      if (error?.code === '23505') {
        throw appError('CAPA_CODE_EXISTS', `CAPA code "${patch.capa_code}" already exists`, 409);
      }
      throw error;
    }
  }

  async function setRootCause(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    assert(canAdvanceCapa(existing.status), 'CAPA_READ_ONLY', 'This CAPA case is closed', 409);
    assert(
      existing.status === CAPA_STATUSES.OPEN || existing.status === CAPA_STATUSES.ROOT_CAUSE,
      'CAPA_STAGE_BLOCKED',
      'Root cause can only be recorded while CAPA is OPEN or already in root cause stage',
      409,
    );

    const body = req.body ?? {};
    const rootCauseSummary = normalizeText(body.root_cause_summary);
    const notes = normalizeText(body.notes);
    assert(rootCauseSummary, 'VALIDATION_ERROR', 'root_cause_summary is required', 400);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.ROOT_CAUSE,
        root_cause_summary: rootCauseSummary,
        root_caused_at: nowIso,
        notes: notes ?? existing.notes,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.root_cause_recorded',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        root_cause_summary: rootCauseSummary,
      },
    });

    return { id, status: CAPA_STATUSES.ROOT_CAUSE };
  }

  async function setCorrectiveAction(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    assert(canAdvanceCapa(existing.status), 'CAPA_READ_ONLY', 'This CAPA case is closed', 409);
    assert(
      existing.root_cause_summary,
      'CAPA_ROOT_CAUSE_REQUIRED',
      'Root cause summary is required before corrective action',
      400,
    );
    assert(
      existing.status === CAPA_STATUSES.ROOT_CAUSE || existing.status === CAPA_STATUSES.CORRECTIVE_ACTION,
      'CAPA_STAGE_BLOCKED',
      'Corrective action can only be recorded after root cause is captured',
      409,
    );

    const body = req.body ?? {};
    const correctiveActionSummary = normalizeText(body.corrective_action_summary);
    const notes = normalizeText(body.notes);
    assert(correctiveActionSummary, 'VALIDATION_ERROR', 'corrective_action_summary is required', 400);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.CORRECTIVE_ACTION,
        corrective_action_summary: correctiveActionSummary,
        corrective_action_at: nowIso,
        notes: notes ?? existing.notes,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.corrective_action_recorded',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        corrective_action_summary: correctiveActionSummary,
      },
    });

    return { id, status: CAPA_STATUSES.CORRECTIVE_ACTION };
  }

  async function setPreventiveAction(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    assert(canAdvanceCapa(existing.status), 'CAPA_READ_ONLY', 'This CAPA case is closed', 409);
    assert(
      existing.corrective_action_summary,
      'CAPA_CORRECTIVE_REQUIRED',
      'Corrective action summary is required before preventive action',
      400,
    );
    assert(
      existing.status === CAPA_STATUSES.CORRECTIVE_ACTION || existing.status === CAPA_STATUSES.PREVENTIVE_ACTION,
      'CAPA_STAGE_BLOCKED',
      'Preventive action can only be recorded after corrective action is captured',
      409,
    );

    const body = req.body ?? {};
    const preventiveActionSummary = normalizeText(body.preventive_action_summary);
    const notes = normalizeText(body.notes);
    assert(preventiveActionSummary, 'VALIDATION_ERROR', 'preventive_action_summary is required', 400);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.PREVENTIVE_ACTION,
        preventive_action_summary: preventiveActionSummary,
        preventive_action_at: nowIso,
        notes: notes ?? existing.notes,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.preventive_action_recorded',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        preventive_action_summary: preventiveActionSummary,
      },
    });

    return { id, status: CAPA_STATUSES.PREVENTIVE_ACTION };
  }

  async function setVerification(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_FOLLOW_UP_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    assert(canAdvanceCapa(existing.status), 'CAPA_READ_ONLY', 'This CAPA case is closed', 409);
    assert(
      existing.preventive_action_summary,
      'CAPA_PREVENTIVE_REQUIRED',
      'Preventive action summary is required before verification',
      400,
    );
    assert(
      existing.status === CAPA_STATUSES.PREVENTIVE_ACTION || existing.status === CAPA_STATUSES.VERIFICATION,
      'CAPA_STAGE_BLOCKED',
      'Verification can only be recorded after preventive action is captured',
      409,
    );

    const body = req.body ?? {};
    const verificationSummary = normalizeText(body.verification_summary);
    const notes = normalizeText(body.notes);
    assert(verificationSummary, 'VALIDATION_ERROR', 'verification_summary is required', 400);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.VERIFICATION,
        verification_summary: verificationSummary,
        verified_at: nowIso,
        notes: notes ?? existing.notes,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.verification_recorded',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        verification_summary: verificationSummary,
      },
    });

    return { id, status: CAPA_STATUSES.VERIFICATION };
  }

  async function closeCase(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_FOLLOW_UP_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    assert(canAdvanceCapa(existing.status), 'CAPA_READ_ONLY', 'This CAPA case is closed', 409);
    assert(
      existing.status === CAPA_STATUSES.VERIFICATION,
      'CAPA_STAGE_BLOCKED',
      'CAPA can only be closed after verification',
      409,
    );
    assert(existing.verification_summary, 'CAPA_VERIFY_REQUIRED', 'Verification summary is required before closure', 400);

    const body = req.body ?? {};
    const closureNotes = normalizeText(body.closure_notes);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.CLOSED,
        closure_notes: closureNotes ?? existing.closure_notes,
        closed_at: nowIso,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.closed',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        closure_notes: closureNotes,
      },
    });

    return { id, status: CAPA_STATUSES.CLOSED };
  }

  async function cancelCase(req) {
    const ctx = sanitizeAuth(req.requestContext ?? req.auth ?? req.user);
    ensureAnyRole(ctx.roles, CAPA_MANAGE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findCaseById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('CAPA_NOT_FOUND', 'CAPA case not found', 404);
    }

    if (existing.status === CAPA_STATUSES.CLOSED) {
      throw appError('CAPA_READ_ONLY', 'Closed CAPA case cannot be cancelled', 409);
    }

    if (existing.status === CAPA_STATUSES.CANCELLED) {
      return { id, status: CAPA_STATUSES.CANCELLED };
    }

    const body = req.body ?? {};
    const cancelReason = normalizeText(body.cancel_reason);
    const nowIso = new Date().toISOString();

    await repo.updateCase({
      tenantId: ctx.tenantId,
      id,
      patch: {
        status: CAPA_STATUSES.CANCELLED,
        cancelled_at: nowIso,
        notes: cancelReason ? [existing.notes, `Cancellation note: ${cancelReason}`].filter(Boolean).join('\n') : existing.notes,
      },
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'capa.cancelled',
      entityType: 'CAPA_CASE',
      entityId: id,
      payload: {
        cancel_reason: cancelReason,
      },
    });

    return { id, status: CAPA_STATUSES.CANCELLED };
  }

  return {
    listCases,
    getCase,
    createCase,
    updateCase,
    setRootCause,
    setCorrectiveAction,
    setPreventiveAction,
    setVerification,
    closeCase,
    cancelCase,
  };
}

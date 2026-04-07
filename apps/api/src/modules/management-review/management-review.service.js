import {
  MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES,
  MANAGEMENT_REVIEW_FOLLOW_UP_ROLES,
  MANAGEMENT_REVIEW_MANAGE_ROLES,
  MANAGEMENT_REVIEW_SESSION_STATUSES,
  MANAGEMENT_REVIEW_VIEW_ROLES,
  canEditManagementReviewStructure,
  canFollowUpManagementReviewActionItems,
} from './management-review.constants.js';

import {
  countManagementReviewActionTracker,
  countManagementReviewSessions,
  deleteManagementReviewActionItem,
  deleteManagementReviewDecision,
  findManagementReviewActionItemById,
  findManagementReviewDecisionById,
  findManagementReviewSessionById,
  findTenantIdentityById,
  insertAuditEventGeneric,
  insertManagementReviewActionItem,
  insertManagementReviewDecision,
  insertManagementReviewSession,
  listAuditEventColumns,
  listManagementReviewActionItemsBySessionId,
  listManagementReviewActionTracker,
  listManagementReviewDecisionsBySessionId,
  listManagementReviewSessions,
  updateManagementReviewActionItem,
  updateManagementReviewDecision,
  updateManagementReviewSession,
  completeManagementReviewSession,
  cancelManagementReviewSession,
} from './management-review.repo.js';

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

function normalizeRequiredText(value, fieldName, errorCode) {
  const normalized = normalizeText(value);
  assert(normalized, errorCode, `${fieldName} is required`, 400);
  return normalized;
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

function normalizeInteger(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeSortOrder(value) {
  const parsed = normalizeInteger(value);
  return parsed ?? 0;
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

function ensureAnyRole(userRoles, allowedRoles) {
  const roleSet = new Set(Array.isArray(userRoles) ? userRoles : []);
  const matched = allowedRoles.some((role) => roleSet.has(role));
  assert(matched, 'AUTH_FORBIDDEN', 'Forbidden', 403);
}

async function ensureTenantIdentityExists(db, tenantId, identityId, fieldName) {
  if (identityId == null) return;
  const row = await findTenantIdentityById(db, { tenantId, identityId });
  assert(row, 'IDENTITY_NOT_FOUND', `${fieldName} not found in this tenant`, 404);
}

async function appendAuditEventIfPossible(db, event) {
  try {
    const availableColumns = new Set(await listAuditEventColumns(db));
    if (!availableColumns.size) return;

    const nowIso = new Date().toISOString();
    const payloadJson = JSON.stringify(event.payload ?? {});

    const candidates = {
      tenant_id: event.tenantId,
      actor_user_id: event.actorUserId ?? null,
      user_id: event.actorUserId ?? null,
      created_by: event.actorUserId ?? null,
      actor_identity_id: event.actorIdentityId ?? null,
      identity_id: event.actorIdentityId ?? null,
      event_type: event.eventType,
      action: event.eventType,
      entity_type: event.entityType,
      target_type: event.entityType,
      resource_type: event.entityType,
      entity_id: event.entityId ?? null,
      target_id: event.entityId ?? null,
      resource_id: event.entityId ?? null,
      payload_json: payloadJson,
      payload: payloadJson,
      metadata: payloadJson,
      created_at: nowIso,
      occurred_at: nowIso,
    };

    const columns = [];
    const values = [];

    for (const [column, value] of Object.entries(candidates)) {
      if (!availableColumns.has(column)) continue;
      columns.push(column);
      values.push(value);
    }

    if (!columns.length) return;
    await insertAuditEventGeneric(db, { columns, values });
  } catch {
    // best effort only; do not break business flow
  }
}

function buildSessionSummary(session) {
  return {
    decision_count: Number(session.decision_count ?? 0),
    action_item_count: Number(session.action_item_count ?? 0),
    open_action_item_count: Number(session.open_action_item_count ?? 0),
    done_action_item_count: Number(session.done_action_item_count ?? 0),
    cancelled_action_item_count: Number(session.cancelled_action_item_count ?? 0),
    overdue_action_item_count: Number(session.overdue_action_item_count ?? 0),
  };
}

async function getSessionOrThrow(db, tenantId, sessionId) {
  const session = await findManagementReviewSessionById(db, { tenantId, sessionId });
  assert(session, 'MANAGEMENT_REVIEW_NOT_FOUND', 'Management review session not found', 404);
  return session;
}

async function getDecisionOrThrow(db, tenantId, sessionId, decisionId) {
  const decision = await findManagementReviewDecisionById(db, { tenantId, sessionId, decisionId });
  assert(decision, 'MANAGEMENT_REVIEW_DECISION_NOT_FOUND', 'Management review decision not found', 404);
  return decision;
}

async function getActionItemOrThrow(db, tenantId, sessionId, actionItemId) {
  const actionItem = await findManagementReviewActionItemById(db, { tenantId, sessionId, actionItemId });
  assert(actionItem, 'MANAGEMENT_REVIEW_ACTION_ITEM_NOT_FOUND', 'Management review action item not found', 404);
  return actionItem;
}

async function buildManagementReviewDetail(db, tenantId, sessionId) {
  const session = await getSessionOrThrow(db, tenantId, sessionId);
  const decisions = await listManagementReviewDecisionsBySessionId(db, { tenantId, sessionId });
  const action_items = await listManagementReviewActionItemsBySessionId(db, { tenantId, sessionId });

  return {
    session,
    decisions,
    action_items,
    summary: buildSessionSummary(session),
  };
}

function sanitizeAuth(auth) {
  const tenantId = Number(auth?.tenantId ?? auth?.tenant_id ?? 0);
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

function ensureAllowedActionStatus(status) {
  assert(
    Object.values(MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES).includes(status),
    'VALIDATION_ERROR',
    'Invalid action item status',
    400,
  );
}

export async function listManagementReviewsService({ db, auth, query }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_VIEW_ROLES);

  const { page, pageSize, offset } = normalizePagination(query);
  const search = normalizeText(query.q);
  const status = normalizeText(query.status);

  const total = await countManagementReviewSessions(db, {
    tenantId: ctx.tenantId,
    search,
    status,
  });

  const items = await listManagementReviewSessions(db, {
    tenantId: ctx.tenantId,
    search,
    status,
    limit: pageSize,
    offset,
  });

  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createManagementReviewService({ db, auth, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const chairpersonIdentityId = normalizeInteger(body.chairperson_identity_id);
  await ensureTenantIdentityExists(db, ctx.tenantId, chairpersonIdentityId, 'chairperson_identity_id');

  const payload = {
    tenant_id: ctx.tenantId,
    session_code: normalizeRequiredText(body.session_code, 'session_code', 'VALIDATION_ERROR'),
    title: normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR'),
    review_date: normalizeDateOnly(body.review_date, 'review_date', true),
    status: MANAGEMENT_REVIEW_SESSION_STATUSES.DRAFT,
    chairperson_identity_id: chairpersonIdentityId,
    summary: normalizeText(body.summary),
    minutes: normalizeText(body.minutes),
    notes: normalizeText(body.notes),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };

  let created;
  try {
    created = await insertManagementReviewSession(db, payload);
  } catch (error) {
    if (error?.code === '23505') {
      throw appError(
        'MANAGEMENT_REVIEW_SESSION_CODE_ALREADY_EXISTS',
        'Management review session code already exists',
        409,
      );
    }
    throw error;
  }

  const refreshed = await getSessionOrThrow(db, ctx.tenantId, created.id);

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.created',
    entityType: 'management_review_session',
    entityId: refreshed.id,
    payload: {
      session_code: refreshed.session_code,
      title: refreshed.title,
      review_date: refreshed.review_date,
    },
  });

  return refreshed;
}

export async function getManagementReviewDetailService({ db, auth, sessionId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_VIEW_ROLES);
  return buildManagementReviewDetail(db, ctx.tenantId, sessionId);
}

export async function updateManagementReviewService({ db, auth, sessionId, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const existing = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(existing.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Only DRAFT management review sessions can be updated',
    409,
  );

  const nextChairpersonIdentityId =
    Object.prototype.hasOwnProperty.call(body, 'chairperson_identity_id')
      ? normalizeInteger(body.chairperson_identity_id)
      : existing.chairperson_identity_id;

  await ensureTenantIdentityExists(db, ctx.tenantId, nextChairpersonIdentityId, 'chairperson_identity_id');

  let updated;
  try {
    updated = await updateManagementReviewSession(db, {
      tenant_id: ctx.tenantId,
      id: sessionId,
      session_code: Object.prototype.hasOwnProperty.call(body, 'session_code')
        ? normalizeRequiredText(body.session_code, 'session_code', 'VALIDATION_ERROR')
        : existing.session_code,
      title: Object.prototype.hasOwnProperty.call(body, 'title')
        ? normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR')
        : existing.title,
      review_date: Object.prototype.hasOwnProperty.call(body, 'review_date')
        ? normalizeDateOnly(body.review_date, 'review_date', true)
        : existing.review_date,
      chairperson_identity_id: nextChairpersonIdentityId,
      summary: Object.prototype.hasOwnProperty.call(body, 'summary')
        ? normalizeText(body.summary)
        : existing.summary,
      minutes: Object.prototype.hasOwnProperty.call(body, 'minutes')
        ? normalizeText(body.minutes)
        : existing.minutes,
      notes: Object.prototype.hasOwnProperty.call(body, 'notes')
        ? normalizeText(body.notes)
        : existing.notes,
      updated_by: ctx.userId,
    });
  } catch (error) {
    if (error?.code === '23505') {
      throw appError(
        'MANAGEMENT_REVIEW_SESSION_CODE_ALREADY_EXISTS',
        'Management review session code already exists',
        409,
      );
    }
    throw error;
  }

  const refreshed = await getSessionOrThrow(db, ctx.tenantId, updated.id);

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.updated',
    entityType: 'management_review_session',
    entityId: refreshed.id,
    payload: {
      session_code: refreshed.session_code,
      title: refreshed.title,
      review_date: refreshed.review_date,
    },
  });

  return refreshed;
}

export async function completeManagementReviewService({ db, auth, sessionId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const existing = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    existing.status === MANAGEMENT_REVIEW_SESSION_STATUSES.DRAFT,
    'MANAGEMENT_REVIEW_INVALID_STATUS',
    'Only DRAFT management review sessions can be completed',
    409,
  );

  await completeManagementReviewSession(db, {
    tenant_id: ctx.tenantId,
    id: sessionId,
    updated_by: ctx.userId,
  });

  const refreshed = await getSessionOrThrow(db, ctx.tenantId, sessionId);

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.completed',
    entityType: 'management_review_session',
    entityId: refreshed.id,
    payload: {
      session_code: refreshed.session_code,
      title: refreshed.title,
      action_item_count: refreshed.action_item_count,
      decision_count: refreshed.decision_count,
    },
  });

  return refreshed;
}

export async function cancelManagementReviewService({ db, auth, sessionId, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const existing = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    existing.status === MANAGEMENT_REVIEW_SESSION_STATUSES.DRAFT,
    'MANAGEMENT_REVIEW_INVALID_STATUS',
    'Only DRAFT management review sessions can be cancelled',
    409,
  );

  await cancelManagementReviewSession(db, {
    tenant_id: ctx.tenantId,
    id: sessionId,
    updated_by: ctx.userId,
    cancel_reason: normalizeText(body?.cancel_reason),
  });

  const refreshed = await getSessionOrThrow(db, ctx.tenantId, sessionId);

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.cancelled',
    entityType: 'management_review_session',
    entityId: refreshed.id,
    payload: {
      session_code: refreshed.session_code,
      title: refreshed.title,
      cancel_reason: refreshed.cancel_reason,
    },
  });

  return refreshed;
}

export async function listManagementReviewDecisionsService({ db, auth, sessionId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_VIEW_ROLES);

  await getSessionOrThrow(db, ctx.tenantId, sessionId);
  const items = await listManagementReviewDecisionsBySessionId(db, {
    tenantId: ctx.tenantId,
    sessionId,
  });

  return { items };
}

export async function createManagementReviewDecisionService({ db, auth, sessionId, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(session.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Decisions can only be created while the session is DRAFT',
    409,
  );

  const ownerIdentityId = normalizeInteger(body.owner_identity_id);
  await ensureTenantIdentityExists(db, ctx.tenantId, ownerIdentityId, 'owner_identity_id');

  const created = await insertManagementReviewDecision(db, {
    tenant_id: ctx.tenantId,
    session_id: sessionId,
    decision_no: normalizeText(body.decision_no),
    title: normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR'),
    decision_text: normalizeRequiredText(body.decision_text, 'decision_text', 'VALIDATION_ERROR'),
    owner_identity_id: ownerIdentityId,
    target_date: normalizeDateOnly(body.target_date, 'target_date', false),
    sort_order: normalizeSortOrder(body.sort_order),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.decision.created',
    entityType: 'management_review_decision',
    entityId: created.id,
    payload: {
      session_id: sessionId,
      title: created.title,
    },
  });

  return created;
}

export async function updateManagementReviewDecisionService({ db, auth, sessionId, decisionId, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(session.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Decisions can only be updated while the session is DRAFT',
    409,
  );

  const existing = await getDecisionOrThrow(db, ctx.tenantId, sessionId, decisionId);

  const ownerIdentityId = Object.prototype.hasOwnProperty.call(body, 'owner_identity_id')
    ? normalizeInteger(body.owner_identity_id)
    : existing.owner_identity_id;

  await ensureTenantIdentityExists(db, ctx.tenantId, ownerIdentityId, 'owner_identity_id');

  const updated = await updateManagementReviewDecision(db, {
    tenant_id: ctx.tenantId,
    session_id: sessionId,
    id: decisionId,
    decision_no: Object.prototype.hasOwnProperty.call(body, 'decision_no')
      ? normalizeText(body.decision_no)
      : existing.decision_no,
    title: Object.prototype.hasOwnProperty.call(body, 'title')
      ? normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR')
      : existing.title,
    decision_text: Object.prototype.hasOwnProperty.call(body, 'decision_text')
      ? normalizeRequiredText(body.decision_text, 'decision_text', 'VALIDATION_ERROR')
      : existing.decision_text,
    owner_identity_id: ownerIdentityId,
    target_date: Object.prototype.hasOwnProperty.call(body, 'target_date')
      ? normalizeDateOnly(body.target_date, 'target_date', false)
      : existing.target_date,
    sort_order: Object.prototype.hasOwnProperty.call(body, 'sort_order')
      ? normalizeSortOrder(body.sort_order)
      : existing.sort_order,
    updated_by: ctx.userId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.decision.updated',
    entityType: 'management_review_decision',
    entityId: updated.id,
    payload: {
      session_id: sessionId,
      title: updated.title,
    },
  });

  return updated;
}

export async function deleteManagementReviewDecisionService({ db, auth, sessionId, decisionId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(session.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Decisions can only be deleted while the session is DRAFT',
    409,
  );

  const existing = await getDecisionOrThrow(db, ctx.tenantId, sessionId, decisionId);
  await deleteManagementReviewDecision(db, {
    tenantId: ctx.tenantId,
    sessionId,
    decisionId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.decision.deleted',
    entityType: 'management_review_decision',
    entityId: decisionId,
    payload: {
      session_id: sessionId,
      title: existing.title,
    },
  });

  return { deleted: true };
}

export async function listManagementReviewActionItemsService({ db, auth, sessionId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_VIEW_ROLES);

  await getSessionOrThrow(db, ctx.tenantId, sessionId);
  const items = await listManagementReviewActionItemsBySessionId(db, {
    tenantId: ctx.tenantId,
    sessionId,
  });

  return { items };
}

export async function createManagementReviewActionItemService({ db, auth, sessionId, body }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(session.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Action items can only be created while the session is DRAFT',
    409,
  );

  const decisionId = normalizeInteger(body.decision_id);
  if (decisionId != null) {
    await getDecisionOrThrow(db, ctx.tenantId, sessionId, decisionId);
  }

  const ownerIdentityId = normalizeInteger(body.owner_identity_id);
  assert(ownerIdentityId, 'VALIDATION_ERROR', 'owner_identity_id is required', 400);
  await ensureTenantIdentityExists(db, ctx.tenantId, ownerIdentityId, 'owner_identity_id');

  const requestedStatus = normalizeText(body.status) || MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES.OPEN;
  ensureAllowedActionStatus(requestedStatus);

  const completedAt =
    requestedStatus === MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES.DONE
      ? new Date().toISOString()
      : null;

  const created = await insertManagementReviewActionItem(db, {
    tenant_id: ctx.tenantId,
    session_id: sessionId,
    decision_id: decisionId,
    action_no: normalizeText(body.action_no),
    title: normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR'),
    description: normalizeText(body.description),
    owner_identity_id: ownerIdentityId,
    due_date: normalizeDateOnly(body.due_date, 'due_date', true),
    status: requestedStatus,
    progress_notes: normalizeText(body.progress_notes),
    completion_notes: normalizeText(body.completion_notes),
    completed_at: completedAt,
    sort_order: normalizeSortOrder(body.sort_order),
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.action_item.created',
    entityType: 'management_review_action_item',
    entityId: created.id,
    payload: {
      session_id: sessionId,
      title: created.title,
      due_date: created.due_date,
      status: created.status,
    },
  });

  return created;
}

export async function updateManagementReviewActionItemService({
  db,
  auth,
  sessionId,
  actionItemId,
  body,
}) {
  const ctx = sanitizeAuth(auth);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  const existing = await getActionItemOrThrow(db, ctx.tenantId, sessionId, actionItemId);

  const isDraftStructureEdit = canEditManagementReviewStructure(session.status);
  const isCompletedFollowUp = canFollowUpManagementReviewActionItems(session.status);

  if (isDraftStructureEdit) {
    ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);
  } else if (isCompletedFollowUp) {
    ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_FOLLOW_UP_ROLES);

    const forbiddenAfterComplete = ['decision_id', 'action_no', 'title', 'description', 'sort_order'];
    for (const key of forbiddenAfterComplete) {
      assert(
        !Object.prototype.hasOwnProperty.call(body, key),
        'MANAGEMENT_REVIEW_READ_ONLY',
        `${key} cannot be updated after the session is COMPLETED`,
        409,
      );
    }
  } else {
    throw appError(
      'MANAGEMENT_REVIEW_READ_ONLY',
      'Action items cannot be updated for this session status',
      409,
    );
  }

  const nextDecisionId = Object.prototype.hasOwnProperty.call(body, 'decision_id')
    ? normalizeInteger(body.decision_id)
    : existing.decision_id;

  if (nextDecisionId != null) {
    await getDecisionOrThrow(db, ctx.tenantId, sessionId, nextDecisionId);
  }

  const nextOwnerIdentityId = Object.prototype.hasOwnProperty.call(body, 'owner_identity_id')
    ? normalizeInteger(body.owner_identity_id)
    : existing.owner_identity_id;

  assert(nextOwnerIdentityId, 'VALIDATION_ERROR', 'owner_identity_id is required', 400);
  await ensureTenantIdentityExists(db, ctx.tenantId, nextOwnerIdentityId, 'owner_identity_id');

  const nextStatus = Object.prototype.hasOwnProperty.call(body, 'status')
    ? normalizeRequiredText(body.status, 'status', 'VALIDATION_ERROR')
    : existing.status;
  ensureAllowedActionStatus(nextStatus);

  const completedAt =
    nextStatus === MANAGEMENT_REVIEW_ACTION_ITEM_STATUSES.DONE
      ? existing.completed_at || new Date().toISOString()
      : null;

  const updated = await updateManagementReviewActionItem(db, {
    tenant_id: ctx.tenantId,
    session_id: sessionId,
    id: actionItemId,
    decision_id: nextDecisionId,
    action_no: Object.prototype.hasOwnProperty.call(body, 'action_no')
      ? normalizeText(body.action_no)
      : existing.action_no,
    title: Object.prototype.hasOwnProperty.call(body, 'title')
      ? normalizeRequiredText(body.title, 'title', 'VALIDATION_ERROR')
      : existing.title,
    description: Object.prototype.hasOwnProperty.call(body, 'description')
      ? normalizeText(body.description)
      : existing.description,
    owner_identity_id: nextOwnerIdentityId,
    due_date: Object.prototype.hasOwnProperty.call(body, 'due_date')
      ? normalizeDateOnly(body.due_date, 'due_date', true)
      : existing.due_date,
    status: nextStatus,
    progress_notes: Object.prototype.hasOwnProperty.call(body, 'progress_notes')
      ? normalizeText(body.progress_notes)
      : existing.progress_notes,
    completion_notes: Object.prototype.hasOwnProperty.call(body, 'completion_notes')
      ? normalizeText(body.completion_notes)
      : existing.completion_notes,
    completed_at: completedAt,
    sort_order: Object.prototype.hasOwnProperty.call(body, 'sort_order')
      ? normalizeSortOrder(body.sort_order)
      : existing.sort_order,
    updated_by: ctx.userId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.action_item.updated',
    entityType: 'management_review_action_item',
    entityId: updated.id,
    payload: {
      session_id: sessionId,
      title: updated.title,
      due_date: updated.due_date,
      status: updated.status,
      completed_at: updated.completed_at,
    },
  });

  return updated;
}

export async function deleteManagementReviewActionItemService({ db, auth, sessionId, actionItemId }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_MANAGE_ROLES);

  const session = await getSessionOrThrow(db, ctx.tenantId, sessionId);
  assert(
    canEditManagementReviewStructure(session.status),
    'MANAGEMENT_REVIEW_READ_ONLY',
    'Action items can only be deleted while the session is DRAFT',
    409,
  );

  const existing = await getActionItemOrThrow(db, ctx.tenantId, sessionId, actionItemId);
  await deleteManagementReviewActionItem(db, {
    tenantId: ctx.tenantId,
    sessionId,
    actionItemId,
  });

  await appendAuditEventIfPossible(db, {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    actorIdentityId: ctx.identityId,
    eventType: 'management_review.action_item.deleted',
    entityType: 'management_review_action_item',
    entityId: actionItemId,
    payload: {
      session_id: sessionId,
      title: existing.title,
    },
  });

  return { deleted: true };
}

export async function listManagementReviewActionTrackerService({ db, auth, query }) {
  const ctx = sanitizeAuth(auth);
  ensureAnyRole(ctx.roles, MANAGEMENT_REVIEW_VIEW_ROLES);

  const { page, pageSize, offset } = normalizePagination(query);

  const filters = {
    tenantId: ctx.tenantId,
    search: normalizeText(query.q),
    status: normalizeText(query.status),
    ownerIdentityId: normalizeInteger(query.owner_identity_id),
    overdueOnly: Boolean(query.overdue_only),
    sessionId: normalizeInteger(query.session_id),
    limit: pageSize,
    offset,
  };

  const total = await countManagementReviewActionTracker(db, filters);
  const items = await listManagementReviewActionTracker(db, filters);

  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
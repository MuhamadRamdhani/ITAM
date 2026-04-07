import {
  INTERNAL_AUDIT_STATUSES,
  INTERNAL_AUDIT_TYPES,
} from './internal-audit.schemas.js';

const READ_ROLES = new Set([
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'AUDITOR',
  'SECURITY_OFFICER',
]);

const WRITE_ROLES = new Set([
  'TENANT_ADMIN',
  'ITAM_MANAGER',
  'AUDITOR',
]);

function appError(code, message, statusCode = 400, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  if (details !== undefined) {
    err.details = details;
  }
  return err;
}

function assertRequestContext(req) {
  const ctx = req.requestContext;
  if (!ctx || !ctx.tenantId || !ctx.userId) {
    throw appError('AUTH_UNAUTHORIZED', 'Unauthorized', 401);
  }
  return ctx;
}

function assertRole(req, allowedRoles) {
  const ctx = assertRequestContext(req);
  const roles = Array.isArray(ctx.roles) ? ctx.roles : [];
  const ok = roles.some((role) => allowedRoles.has(role));
  if (!ok) {
    throw appError('AUTH_FORBIDDEN', 'Forbidden', 403);
  }
  return ctx;
}

function normalizeText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateOnly(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return formatLocalDate(value);
  }

  const raw = String(value);

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDate(parsed);
  }

  return raw;
}

function todayDateOnly() {
  return formatLocalDate(new Date());
}

function parseDateSafe(value) {
  if (!value) return null;
  const normalized = normalizeDateOnly(value);
  return new Date(`${normalized}T00:00:00.000Z`);
}

function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return;
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (start && end && start.getTime() > end.getTime()) {
    throw appError(
      'INVALID_DATE_RANGE',
      'planned_start_date must be on or before planned_end_date.',
      400
    );
  }
}

function pickIdentityDisplayName(identity) {
  if (!identity) return null;
  return (
    identity.full_name ??
    identity.display_name ??
    identity.identity_name ??
    identity.name ??
    identity.email ??
    identity.username ??
    String(identity.id)
  );
}

function normalizePlanRow(row, leadAuditorName = null) {
  return {
    id: row.id,
    audit_code: row.audit_code,
    audit_title: row.audit_title,
    audit_type: row.audit_type,
    status: row.status,
    scope_summary: row.scope_summary,
    objective: row.objective,
    planned_start_date: normalizeDateOnly(row.planned_start_date),
    planned_end_date: normalizeDateOnly(row.planned_end_date),
    actual_start_date: normalizeDateOnly(row.actual_start_date),
    actual_end_date: normalizeDateOnly(row.actual_end_date),
    lead_auditor_identity_id: row.lead_auditor_identity_id,
    lead_auditor_name: leadAuditorName,
    auditee_summary: row.auditee_summary,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    findings_count: row.findings_count,
    checklist_items_count: row.checklist_items_count,
  };
}

function normalizeMemberRow(row, identityName = null, identityEmail = null) {
  return {
    id: row.id,
    identity_id: row.identity_id,
    identity_name: identityName,
    identity_email: identityEmail,
    member_role: row.member_role,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function normalizeSectionRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    clause_code: row.clause_code,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeChecklistItemRow(row, assessedByName = null) {
  return {
    id: row.id,
    section_id: row.section_id,
    section_title: row.section_title ?? null,
    item_code: row.item_code,
    requirement_text: row.requirement_text,
    expected_evidence: row.expected_evidence,
    clause_code: row.clause_code,
    sort_order: row.sort_order,
    is_mandatory: row.is_mandatory,
    created_at: row.created_at,
    updated_at: row.updated_at,
    latest_result: row.latest_result_id
      ? {
          id: row.latest_result_id,
          result_status: row.latest_result_status,
          observation_notes: row.latest_observation_notes,
          assessed_by_identity_id: row.latest_assessed_by_identity_id,
          assessed_by_name: assessedByName,
          assessed_at: row.latest_assessed_at,
        }
      : null,
  };
}

function normalizeFindingRow(row, ownerName = null) {
  return {
    id: row.id,
    checklist_item_id: row.checklist_item_id,
    finding_code: row.finding_code,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    owner_identity_id: row.owner_identity_id,
    owner_name: ownerName,
    due_date: normalizeDateOnly(row.due_date),
    closed_at: row.closed_at,
    closure_notes: row.closure_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function enrichLeadAuditorNames(repo, tenantId, rows) {
  const cache = new Map();

  for (const row of rows) {
    const identityId = row.lead_auditor_identity_id;
    if (!identityId || cache.has(identityId)) continue;
    const identity = await repo.findIdentityById({ tenantId, id: identityId });
    cache.set(identityId, pickIdentityDisplayName(identity));
  }

  return rows.map((row) =>
    normalizePlanRow(row, cache.get(row.lead_auditor_identity_id) ?? null)
  );
}

async function validateLeadAuditor(repo, tenantId, identityId) {
  if (!identityId) return null;
  const identity = await repo.findIdentityById({ tenantId, id: identityId });
  if (!identity) {
    throw appError(
      'IDENTITY_NOT_FOUND',
      `Lead auditor identity ${identityId} was not found in this tenant.`,
      404
    );
  }
  return identity;
}

async function validateIdentityInTenant(repo, tenantId, identityId, label = 'Identity') {
  if (!identityId) return null;
  const identity = await repo.findIdentityById({ tenantId, id: identityId });
  if (!identity) {
    throw appError(
      'IDENTITY_NOT_FOUND',
      `${label} ${identityId} was not found in this tenant.`,
      404
    );
  }
  return identity;
}

async function safeWriteAuditEvent(fastify, payload) {
  try {
    if (fastify.auditEvents && typeof fastify.auditEvents.write === 'function') {
      await fastify.auditEvents.write(payload);
      return;
    }

    if (fastify.audit && typeof fastify.audit.write === 'function') {
      await fastify.audit.write(payload);
      return;
    }

    fastify.log?.info?.({ audit_event_fallback: payload }, 'internal audit event');
  } catch (err) {
    fastify.log?.warn?.({ err, payload }, 'failed to write internal audit audit-event');
  }
}

async function requirePlanForRead(repo, tenantId, auditPlanId) {
  const plan = await repo.findPlanById({ tenantId, id: auditPlanId });
  if (!plan) {
    throw appError('INTERNAL_AUDIT_NOT_FOUND', 'Internal audit plan not found.', 404);
  }
  return plan;
}

async function requireDraftPlanForWrite(repo, tenantId, auditPlanId) {
  const plan = await requirePlanForRead(repo, tenantId, auditPlanId);
  if (plan.status !== 'DRAFT') {
    throw appError(
      'INTERNAL_AUDIT_EDIT_BLOCKED',
      'This action is only allowed while the internal audit plan is still in DRAFT status.',
      400
    );
  }
  return plan;
}

async function requireInProgressPlanForExecution(repo, tenantId, auditPlanId) {
  const plan = await requirePlanForRead(repo, tenantId, auditPlanId);
  if (plan.status !== 'IN_PROGRESS') {
    throw appError(
      'INTERNAL_AUDIT_NOT_IN_PROGRESS',
      'This action is only allowed when the internal audit plan is IN_PROGRESS.',
      400
    );
  }
  return plan;
}

async function enrichMemberRows(repo, tenantId, rows) {
  const cache = new Map();

  for (const row of rows) {
    const identityId = row.identity_id;
    if (!identityId || cache.has(identityId)) continue;
    const identity = await repo.findIdentityById({ tenantId, id: identityId });
    cache.set(identityId, identity);
  }

  return rows.map((row) => {
    const identity = cache.get(row.identity_id);
    return normalizeMemberRow(
      row,
      pickIdentityDisplayName(identity),
      identity?.email ?? null
    );
  });
}

async function enrichChecklistItemRows(repo, tenantId, rows) {
  const cache = new Map();

  for (const row of rows) {
    const identityId = row.latest_assessed_by_identity_id;
    if (!identityId || cache.has(identityId)) continue;
    const identity = await repo.findIdentityById({ tenantId, id: identityId });
    cache.set(identityId, identity);
  }

  return rows.map((row) => {
    const identity = cache.get(row.latest_assessed_by_identity_id);
    return normalizeChecklistItemRow(row, pickIdentityDisplayName(identity));
  });
}

async function enrichFindingRows(repo, tenantId, rows) {
  const cache = new Map();

  for (const row of rows) {
    const identityId = row.owner_identity_id;
    if (!identityId || cache.has(identityId)) continue;
    const identity = await repo.findIdentityById({ tenantId, id: identityId });
    cache.set(identityId, identity);
  }

  return rows.map((row) => {
    const identity = cache.get(row.owner_identity_id);
    return normalizeFindingRow(row, pickIdentityDisplayName(identity));
  });
}

export function buildInternalAuditService({ repo, fastify }) {
  async function listPlans(req) {
    const ctx = assertRole(req, READ_ROLES);

    const page = Number(req.query?.page ?? 1);
    const pageSize = Number(req.query?.page_size ?? 25);
    const q = normalizeText(req.query?.q);
    const status = req.query?.status ?? 'ALL';
    const auditType = req.query?.audit_type ?? 'ALL';

    if (![10, 25, 50, 100].includes(pageSize)) {
      throw appError(
        'INVALID_PAGE_SIZE',
        'page_size must be one of 10, 25, 50, 100.',
        400
      );
    }

    if (page < 1) {
      throw appError('INVALID_PAGE', 'page must be at least 1.', 400);
    }

    if (status !== 'ALL' && !INTERNAL_AUDIT_STATUSES.includes(status)) {
      throw appError('INVALID_AUDIT_STATUS', 'Invalid audit status.', 400);
    }

    if (auditType !== 'ALL' && !INTERNAL_AUDIT_TYPES.includes(auditType)) {
      throw appError('INVALID_AUDIT_TYPE', 'Invalid audit type.', 400);
    }

    const offset = (page - 1) * pageSize;

    const [rows, totalItems] = await Promise.all([
      repo.listPlans({
        tenantId: ctx.tenantId,
        q,
        status,
        auditType,
        limit: pageSize,
        offset,
      }),
      repo.countPlans({
        tenantId: ctx.tenantId,
        q,
        status,
        auditType,
      }),
    ]);

    const items = await enrichLeadAuditorNames(repo, ctx.tenantId, rows);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      items,
      pagination: {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: totalPages,
      },
    };
  }

  async function createPlan(req) {
    const ctx = assertRole(req, WRITE_ROLES);

    const body = req.body ?? {};
    const auditCode = normalizeText(body.audit_code);
    const auditTitle = normalizeText(body.audit_title);
    const auditType = body.audit_type;
    const scopeSummary = normalizeText(body.scope_summary);
    const objective = normalizeText(body.objective);
    const plannedStartDate = body.planned_start_date ?? null;
    const plannedEndDate = body.planned_end_date ?? null;
    const leadAuditorIdentityId = body.lead_auditor_identity_id ?? null;
    const auditeeSummary = normalizeText(body.auditee_summary);
    const notes = normalizeText(body.notes);

    validateDateRange(plannedStartDate, plannedEndDate);
    await validateLeadAuditor(repo, ctx.tenantId, leadAuditorIdentityId);

    try {
      const id = await repo.insertPlan({
        tenantId: ctx.tenantId,
        auditCode,
        auditTitle,
        auditType,
        scopeSummary,
        objective,
        plannedStartDate,
        plannedEndDate,
        leadAuditorIdentityId,
        auditeeSummary,
        notes,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.plan_created',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: id,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          audit_code: auditCode,
          audit_title: auditTitle,
          audit_type: auditType,
        },
      });

      return { id };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_CODE_EXISTS',
          `Audit code "${auditCode}" already exists.`,
          409
        );
      }
      throw err;
    }
  }

  async function getPlan(req) {
    const ctx = assertRole(req, READ_ROLES);
    const id = Number(req.params.id);

    const row = await repo.findPlanById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!row) {
      throw appError('INTERNAL_AUDIT_NOT_FOUND', 'Internal audit plan not found.', 404);
    }

    let leadAuditorName = null;
    if (row.lead_auditor_identity_id) {
      const identity = await repo.findIdentityById({
        tenantId: ctx.tenantId,
        id: row.lead_auditor_identity_id,
      });
      leadAuditorName = pickIdentityDisplayName(identity);
    }

    return {
      plan: normalizePlanRow(row, leadAuditorName),
      summary: {
        members_count: row.members_count ?? 0,
        sections_count: row.sections_count ?? 0,
        checklist_items_count: row.checklist_items_count ?? 0,
        mandatory_items_count: row.mandatory_items_count ?? 0,
        assessed_items_count: row.assessed_items_count ?? 0,
        findings_count: row.findings_count ?? 0,
        open_findings_count: row.open_findings_count ?? 0,
      },
    };
  }

  async function updatePlan(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const id = Number(req.params.id);

    const existing = await repo.findPlanById({
      tenantId: ctx.tenantId,
      id,
    });

    if (!existing) {
      throw appError('INTERNAL_AUDIT_NOT_FOUND', 'Internal audit plan not found.', 404);
    }

    if (existing.status !== 'DRAFT') {
      throw appError(
        'INTERNAL_AUDIT_EDIT_BLOCKED',
        'Only DRAFT internal audit plans can be updated in Phase A/Phase B.',
        400
      );
    }

    const incoming = req.body ?? {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'audit_code')) {
      patch.audit_code = normalizeText(incoming.audit_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'audit_title')) {
      patch.audit_title = normalizeText(incoming.audit_title);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'audit_type')) {
      patch.audit_type = incoming.audit_type;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'scope_summary')) {
      patch.scope_summary = normalizeText(incoming.scope_summary);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'objective')) {
      patch.objective = normalizeText(incoming.objective);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'planned_start_date')) {
      patch.planned_start_date = incoming.planned_start_date ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'planned_end_date')) {
      patch.planned_end_date = incoming.planned_end_date ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'lead_auditor_identity_id')) {
      patch.lead_auditor_identity_id = incoming.lead_auditor_identity_id ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'auditee_summary')) {
      patch.auditee_summary = normalizeText(incoming.auditee_summary);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'notes')) {
      patch.notes = normalizeText(incoming.notes);
    }

    const mergedStartDate =
      Object.prototype.hasOwnProperty.call(patch, 'planned_start_date')
        ? patch.planned_start_date
        : normalizeDateOnly(existing.planned_start_date);

    const mergedEndDate =
      Object.prototype.hasOwnProperty.call(patch, 'planned_end_date')
        ? patch.planned_end_date
        : normalizeDateOnly(existing.planned_end_date);

    validateDateRange(mergedStartDate, mergedEndDate);

    if (Object.prototype.hasOwnProperty.call(patch, 'lead_auditor_identity_id')) {
      await validateLeadAuditor(repo, ctx.tenantId, patch.lead_auditor_identity_id);
    }

    if (Object.keys(patch).length === 0) {
      return { id };
    }

    try {
      await repo.updatePlan({
        tenantId: ctx.tenantId,
        id,
        patch,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.plan_updated',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: id,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: patch,
      });

      return { id };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_CODE_EXISTS',
          `Audit code "${patch.audit_code}" already exists.`,
          409
        );
      }
      throw err;
    }
  }

  async function listMembers(req) {
    const ctx = assertRole(req, READ_ROLES);
    const auditPlanId = Number(req.params.id);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const rows = await repo.listMembers({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    const items = await enrichMemberRows(repo, ctx.tenantId, rows);
    return { items };
  }

  async function addMember(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const plan = await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const body = req.body ?? {};
    const identityId = body.identity_id;
    const memberRole = body.member_role;
    const notes = normalizeText(body.notes);

    const identity = await repo.findIdentityById({
      tenantId: ctx.tenantId,
      id: identityId,
    });

    if (!identity) {
      throw appError(
        'IDENTITY_NOT_FOUND',
        `Identity ${identityId} was not found in this tenant.`,
        404
      );
    }

    if (memberRole === 'LEAD_AUDITOR') {
      const existingLead = await repo.findLeadAuditorMember({
        tenantId: ctx.tenantId,
        auditPlanId,
      });

      if (existingLead) {
        throw appError(
          'LEAD_AUDITOR_ALREADY_ASSIGNED',
          'This internal audit plan already has a lead auditor member.',
          409
        );
      }
    }

    try {
      const id = await repo.insertMember({
        tenantId: ctx.tenantId,
        auditPlanId,
        identityId,
        memberRole,
        notes,
      });

      if (memberRole === 'LEAD_AUDITOR') {
        await repo.updatePlanLeadAuditor({
          tenantId: ctx.tenantId,
          auditPlanId,
          leadAuditorIdentityId: identityId,
          userId: ctx.userId,
        });
      }

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.member_added',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: auditPlanId,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          member_id: id,
          identity_id: identityId,
          member_role: memberRole,
          previous_lead_auditor_identity_id: plan.lead_auditor_identity_id ?? null,
        },
      });

      return { id };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_MEMBER_EXISTS',
          'This identity already has the same member role on the audit plan.',
          409
        );
      }
      throw err;
    }
  }

  async function deleteMember(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const plan = await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const existing = await repo.findMemberById({
      tenantId: ctx.tenantId,
      auditPlanId,
      memberId,
    });

    if (!existing) {
      throw appError('INTERNAL_AUDIT_MEMBER_NOT_FOUND', 'Internal audit member not found.', 404);
    }

    const deleted = await repo.deleteMember({
      tenantId: ctx.tenantId,
      auditPlanId,
      memberId,
    });

    if (!deleted) {
      throw appError('INTERNAL_AUDIT_MEMBER_NOT_FOUND', 'Internal audit member not found.', 404);
    }

    if (
      deleted.member_role === 'LEAD_AUDITOR' &&
      Number(plan.lead_auditor_identity_id ?? 0) === Number(deleted.identity_id ?? 0)
    ) {
      await repo.updatePlanLeadAuditor({
        tenantId: ctx.tenantId,
        auditPlanId,
        leadAuditorIdentityId: null,
        userId: ctx.userId,
      });
    }

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.member_removed',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        member_id: memberId,
        identity_id: deleted.identity_id,
        member_role: deleted.member_role,
      },
    });

    return { deleted: true };
  }

  async function listChecklistSections(req) {
    const ctx = assertRole(req, READ_ROLES);
    const auditPlanId = Number(req.params.id);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const rows = await repo.listChecklistSections({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    return {
      items: rows.map(normalizeSectionRow),
    };
  }

  async function createChecklistSection(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);

    await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const body = req.body ?? {};
    const title = normalizeText(body.title);
    const description = normalizeText(body.description);
    const clauseCode = normalizeText(body.clause_code);
    const sortOrder = body.sort_order ?? 0;

    const id = await repo.insertChecklistSection({
      tenantId: ctx.tenantId,
      auditPlanId,
      title,
      description,
      clauseCode,
      sortOrder,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.checklist_section_created',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        section_id: id,
        title,
        clause_code: clauseCode,
        sort_order: sortOrder,
      },
    });

    return { id };
  }

  async function updateChecklistSection(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const sectionId = Number(req.params.sectionId);

    await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const existing = await repo.findChecklistSectionById({
      tenantId: ctx.tenantId,
      auditPlanId,
      sectionId,
    });

    if (!existing) {
      throw appError(
        'INTERNAL_AUDIT_CHECKLIST_SECTION_NOT_FOUND',
        'Checklist section not found.',
        404
      );
    }

    const incoming = req.body ?? {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'title')) {
      patch.title = normalizeText(incoming.title);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'description')) {
      patch.description = normalizeText(incoming.description);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'clause_code')) {
      patch.clause_code = normalizeText(incoming.clause_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'sort_order')) {
      patch.sort_order = incoming.sort_order;
    }

    if (Object.keys(patch).length === 0) {
      return { id: sectionId };
    }

    await repo.updateChecklistSection({
      tenantId: ctx.tenantId,
      auditPlanId,
      sectionId,
      patch,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.checklist_section_updated',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        section_id: sectionId,
        ...patch,
      },
    });

    return { id: sectionId };
  }

  async function listChecklistItems(req) {
    const ctx = assertRole(req, READ_ROLES);
    const auditPlanId = Number(req.params.id);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const rows = await repo.listChecklistItems({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    const items = await enrichChecklistItemRows(repo, ctx.tenantId, rows);

    return {
      items,
    };
  }

  async function createChecklistItem(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);

    await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const body = req.body ?? {};
    const sectionId = body.section_id ?? null;
    const itemCode = normalizeText(body.item_code);
    const requirementText = normalizeText(body.requirement_text);
    const expectedEvidence = normalizeText(body.expected_evidence);
    const clauseCode = normalizeText(body.clause_code);
    const sortOrder = body.sort_order ?? 0;
    const isMandatory = body.is_mandatory ?? true;

    if (sectionId) {
      const section = await repo.findChecklistSectionById({
        tenantId: ctx.tenantId,
        auditPlanId,
        sectionId,
      });

      if (!section) {
        throw appError(
          'INTERNAL_AUDIT_CHECKLIST_SECTION_NOT_FOUND',
          'Checklist section not found.',
          404
        );
      }
    }

    try {
      const id = await repo.insertChecklistItem({
        tenantId: ctx.tenantId,
        auditPlanId,
        sectionId,
        itemCode,
        requirementText,
        expectedEvidence,
        clauseCode,
        sortOrder,
        isMandatory,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.checklist_item_created',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: auditPlanId,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          item_id: id,
          section_id: sectionId,
          item_code: itemCode,
          clause_code: clauseCode,
          sort_order: sortOrder,
          is_mandatory: isMandatory,
        },
      });

      return { id };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_ITEM_CODE_EXISTS',
          `Checklist item code "${itemCode}" already exists for this audit plan.`,
          409
        );
      }
      throw err;
    }
  }

  async function updateChecklistItem(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    await requireDraftPlanForWrite(repo, ctx.tenantId, auditPlanId);

    const existing = await repo.findChecklistItemById({
      tenantId: ctx.tenantId,
      auditPlanId,
      itemId,
    });

    if (!existing) {
      throw appError(
        'INTERNAL_AUDIT_CHECKLIST_ITEM_NOT_FOUND',
        'Checklist item not found.',
        404
      );
    }

    const incoming = req.body ?? {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'section_id')) {
      patch.section_id = incoming.section_id ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'item_code')) {
      patch.item_code = normalizeText(incoming.item_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'requirement_text')) {
      patch.requirement_text = normalizeText(incoming.requirement_text);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'expected_evidence')) {
      patch.expected_evidence = normalizeText(incoming.expected_evidence);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'clause_code')) {
      patch.clause_code = normalizeText(incoming.clause_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'sort_order')) {
      patch.sort_order = incoming.sort_order;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'is_mandatory')) {
      patch.is_mandatory = incoming.is_mandatory;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'section_id') && patch.section_id) {
      const section = await repo.findChecklistSectionById({
        tenantId: ctx.tenantId,
        auditPlanId,
        sectionId: patch.section_id,
      });

      if (!section) {
        throw appError(
          'INTERNAL_AUDIT_CHECKLIST_SECTION_NOT_FOUND',
          'Checklist section not found.',
          404
        );
      }
    }

    if (Object.keys(patch).length === 0) {
      return { id: itemId };
    }

    try {
      await repo.updateChecklistItem({
        tenantId: ctx.tenantId,
        auditPlanId,
        itemId,
        patch,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.checklist_item_updated',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: auditPlanId,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          item_id: itemId,
          ...patch,
        },
      });

      return { id: itemId };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_ITEM_CODE_EXISTS',
          `Checklist item code "${patch.item_code}" already exists for this audit plan.`,
          409
        );
      }
      throw err;
    }
  }

  async function startPlan(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);

    const plan = await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    if (plan.status !== 'DRAFT') {
      throw appError(
        'INTERNAL_AUDIT_START_BLOCKED',
        'Only DRAFT internal audit plans can be started.',
        400
      );
    }

    const checklistItemsCount = await repo.countChecklistItems({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    if (checklistItemsCount < 1) {
      throw appError(
        'INTERNAL_AUDIT_START_REQUIRES_CHECKLIST',
        'At least one checklist item is required before starting the audit.',
        400
      );
    }

    const members = await repo.listMembers({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    const hasAuditTeam = members.some(
      (m) => m.member_role === 'LEAD_AUDITOR' || m.member_role === 'AUDITOR'
    );

    if (!hasAuditTeam) {
      throw appError(
        'INTERNAL_AUDIT_START_REQUIRES_AUDITOR',
        'At least one lead auditor or auditor member is required before starting the audit.',
        400
      );
    }

    const updated = await repo.updatePlanStatus({
      tenantId: ctx.tenantId,
      auditPlanId,
      status: 'IN_PROGRESS',
      actualStartDate: todayDateOnly(),
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.started',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        status: 'IN_PROGRESS',
      },
    });

    return {
      status: updated?.status ?? 'IN_PROGRESS',
      actual_start_date: normalizeDateOnly(updated?.actual_start_date),
    };
  }

  async function completePlan(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);

    await requireInProgressPlanForExecution(repo, ctx.tenantId, auditPlanId);

    const mandatoryCount = await repo.countMandatoryChecklistItems({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    const assessedMandatoryCount =
      await repo.countMandatoryChecklistItemsWithLatestResult({
        tenantId: ctx.tenantId,
        auditPlanId,
      });

    if (mandatoryCount > assessedMandatoryCount) {
      throw appError(
        'INTERNAL_AUDIT_COMPLETE_REQUIRES_MANDATORY_RESULTS',
        'All mandatory checklist items must have at least one result before completing the audit.',
        400
      );
    }

    const updated = await repo.updatePlanStatus({
      tenantId: ctx.tenantId,
      auditPlanId,
      status: 'COMPLETED',
      actualEndDate: todayDateOnly(),
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.completed',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        status: 'COMPLETED',
      },
    });

    return {
      status: updated?.status ?? 'COMPLETED',
      actual_end_date: normalizeDateOnly(updated?.actual_end_date),
    };
  }

  async function cancelPlan(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const body = req.body ?? {};
    const cancelNotes = normalizeText(body.notes);

    const plan = await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    if (plan.status === 'COMPLETED') {
      throw appError(
        'INTERNAL_AUDIT_CANCEL_BLOCKED',
        'Completed internal audit plans cannot be cancelled.',
        400
      );
    }

    if (plan.status === 'CANCELLED') {
      return { status: 'CANCELLED' };
    }

    const mergedNotes = cancelNotes
      ? [plan.notes, `Cancellation note: ${cancelNotes}`].filter(Boolean).join('\n')
      : plan.notes ?? null;

    const updated = await repo.updatePlanStatus({
      tenantId: ctx.tenantId,
      auditPlanId,
      status: 'CANCELLED',
      notes: mergedNotes,
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.cancelled',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        status: 'CANCELLED',
        notes: cancelNotes,
      },
    });

    return {
      status: updated?.status ?? 'CANCELLED',
    };
  }

  async function recordChecklistResult(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    await requireInProgressPlanForExecution(repo, ctx.tenantId, auditPlanId);

    const item = await repo.findChecklistItemById({
      tenantId: ctx.tenantId,
      auditPlanId,
      itemId,
    });

    if (!item) {
      throw appError(
        'INTERNAL_AUDIT_CHECKLIST_ITEM_NOT_FOUND',
        'Checklist item not found.',
        404
      );
    }

    const body = req.body ?? {};
    const resultStatus = body.result_status;
    const observationNotes = normalizeText(body.observation_notes);
    const assessedByIdentityId = body.assessed_by_identity_id ?? null;

    if (assessedByIdentityId) {
      await validateIdentityInTenant(
        repo,
        ctx.tenantId,
        assessedByIdentityId,
        'Assessed by identity'
      );
    }

    const id = await repo.insertChecklistResult({
      tenantId: ctx.tenantId,
      auditPlanId,
      checklistItemId: itemId,
      resultStatus,
      observationNotes,
      assessedByIdentityId,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.checklist_result_recorded',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        checklist_item_id: itemId,
        result_id: id,
        result_status: resultStatus,
      },
    });

    return { id };
  }

  async function listFindings(req) {
    const ctx = assertRole(req, READ_ROLES);
    const auditPlanId = Number(req.params.id);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const rows = await repo.listFindings({
      tenantId: ctx.tenantId,
      auditPlanId,
    });

    const items = await enrichFindingRows(repo, ctx.tenantId, rows);
    return { items };
  }

  async function createFinding(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);

    await requireInProgressPlanForExecution(repo, ctx.tenantId, auditPlanId);

    const body = req.body ?? {};
    const checklistItemId = body.checklist_item_id ?? null;
    const findingCode = normalizeText(body.finding_code);
    const title = normalizeText(body.title);
    const description = normalizeText(body.description);
    const severity = body.severity;
    const ownerIdentityId = body.owner_identity_id ?? null;
    const dueDate = body.due_date ?? null;

    if (checklistItemId) {
      const item = await repo.findChecklistItemById({
        tenantId: ctx.tenantId,
        auditPlanId,
        itemId: checklistItemId,
      });

      if (!item) {
        throw appError(
          'INTERNAL_AUDIT_CHECKLIST_ITEM_NOT_FOUND',
          'Checklist item not found.',
          404
        );
      }
    }

    if (ownerIdentityId) {
      await validateIdentityInTenant(
        repo,
        ctx.tenantId,
        ownerIdentityId,
        'Finding owner identity'
      );
    }

    try {
      const id = await repo.insertFinding({
        tenantId: ctx.tenantId,
        auditPlanId,
        checklistItemId,
        findingCode,
        title,
        description,
        severity,
        ownerIdentityId,
        dueDate,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.finding_created',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: auditPlanId,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          finding_id: id,
          finding_code: findingCode,
          severity,
        },
      });

      return { id };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_FINDING_CODE_EXISTS',
          `Finding code "${findingCode}" already exists.`,
          409
        );
      }
      throw err;
    }
  }

  async function updateFinding(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const findingId = Number(req.params.findingId);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const existing = await repo.findFindingById({
      tenantId: ctx.tenantId,
      auditPlanId,
      findingId,
    });

    if (!existing) {
      throw appError(
        'INTERNAL_AUDIT_FINDING_NOT_FOUND',
        'Internal audit finding not found.',
        404
      );
    }

    if (existing.status === 'CLOSED') {
      throw appError(
        'INTERNAL_AUDIT_FINDING_EDIT_BLOCKED',
        'Closed findings cannot be updated.',
        400
      );
    }

    const incoming = req.body ?? {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(incoming, 'checklist_item_id')) {
      patch.checklist_item_id = incoming.checklist_item_id ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'finding_code')) {
      patch.finding_code = normalizeText(incoming.finding_code);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'title')) {
      patch.title = normalizeText(incoming.title);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'description')) {
      patch.description = normalizeText(incoming.description);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'severity')) {
      patch.severity = incoming.severity;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'status')) {
      patch.status = incoming.status;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'owner_identity_id')) {
      patch.owner_identity_id = incoming.owner_identity_id ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'due_date')) {
      patch.due_date = incoming.due_date ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'checklist_item_id') && patch.checklist_item_id) {
      const item = await repo.findChecklistItemById({
        tenantId: ctx.tenantId,
        auditPlanId,
        itemId: patch.checklist_item_id,
      });

      if (!item) {
        throw appError(
          'INTERNAL_AUDIT_CHECKLIST_ITEM_NOT_FOUND',
          'Checklist item not found.',
          404
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'owner_identity_id') && patch.owner_identity_id) {
      await validateIdentityInTenant(
        repo,
        ctx.tenantId,
        patch.owner_identity_id,
        'Finding owner identity'
      );
    }

    if (Object.keys(patch).length === 0) {
      return { id: findingId };
    }

    try {
      await repo.updateFinding({
        tenantId: ctx.tenantId,
        auditPlanId,
        findingId,
        patch,
        userId: ctx.userId,
      });

      await safeWriteAuditEvent(fastify, {
        action: 'internal_audit.finding_updated',
        entity_type: 'INTERNAL_AUDIT_PLAN',
        entity_id: auditPlanId,
        tenant_id: ctx.tenantId,
        actor_user_id: ctx.userId,
        payload: {
          finding_id: findingId,
          ...patch,
        },
      });

      return { id: findingId };
    } catch (err) {
      if (err?.code === '23505') {
        throw appError(
          'INTERNAL_AUDIT_FINDING_CODE_EXISTS',
          `Finding code "${patch.finding_code}" already exists.`,
          409
        );
      }
      throw err;
    }
  }

  async function closeFindingAction(req) {
    const ctx = assertRole(req, WRITE_ROLES);
    const auditPlanId = Number(req.params.id);
    const findingId = Number(req.params.findingId);
    const body = req.body ?? {};
    const closureNotes = normalizeText(body.closure_notes);

    await requirePlanForRead(repo, ctx.tenantId, auditPlanId);

    const existing = await repo.findFindingById({
      tenantId: ctx.tenantId,
      auditPlanId,
      findingId,
    });

    if (!existing) {
      throw appError(
        'INTERNAL_AUDIT_FINDING_NOT_FOUND',
        'Internal audit finding not found.',
        404
      );
    }

    if (existing.status === 'CLOSED') {
      return { id: findingId, status: 'CLOSED' };
    }

    await repo.closeFinding({
      tenantId: ctx.tenantId,
      auditPlanId,
      findingId,
      closureNotes,
      userId: ctx.userId,
    });

    await safeWriteAuditEvent(fastify, {
      action: 'internal_audit.finding_closed',
      entity_type: 'INTERNAL_AUDIT_PLAN',
      entity_id: auditPlanId,
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.userId,
      payload: {
        finding_id: findingId,
      },
    });

    return { id: findingId, status: 'CLOSED' };
  }

  return {
    listPlans,
    createPlan,
    getPlan,
    updatePlan,
    listMembers,
    addMember,
    deleteMember,
    listChecklistSections,
    createChecklistSection,
    updateChecklistSection,
    listChecklistItems,
    createChecklistItem,
    updateChecklistItem,
    startPlan,
    completePlan,
    cancelPlan,
    recordChecklistResult,
    listFindings,
    createFinding,
    updateFinding,
    closeFindingAction,
  };
}
import {
  listApprovals,
  getApproval,
  createApproval,
  insertApprovalEvent,
  decideApproval,
} from './approvals.repo.js';

import { applyApprovedLifecycleTransition } from '../lifecycle/lifecycle.service.js';
import { insertAuditEvent } from '../../lib/audit.js';

function actorFromIdentityId(identityId) {
  if (Number.isFinite(identityId) && identityId > 0) return `IDENTITY:${identityId}`;
  return 'SYSTEM';
}

export async function listApprovalsService(app, { tenantId, status, q, page, pageSize }) {
  return await listApprovals(app, { tenantId, status, q, page, pageSize });
}

export async function getApprovalService(app, { tenantId, approvalId }) {
  return await getApproval(app, { tenantId, approvalId });
}

// dipakai dari lifecycle transition kalau require_approval=true
export async function createApprovalForLifecycleTransition(app, {
  tenantId,
  assetId,
  requestedBy,
  payload,
}) {
  const approval = await createApproval(app, {
    tenantId,
    subjectType: 'ASSET',
    subjectId: assetId,
    actionCode: 'LIFECYCLE_TRANSITION',
    requestedBy,
    payload,
  });

  if (!approval) {
    return { created: false, approval: null };
  }

  await insertApprovalEvent(app, {
    tenantId,
    approvalId: approval.id,
    eventType: 'CREATED',
    actorId: requestedBy ?? null,
    note: 'Approval created for lifecycle transition',
    eventPayload: payload ?? {},
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(requestedBy),
    action: 'APPROVAL_CREATED',
    entityType: 'APPROVAL',
    entityId: approval.id,
    payload: {
      subject_type: approval.subject_type,
      subject_id: approval.subject_id,
      action_code: approval.action_code,
    },
  });

  return { created: true, approval };
}

export async function decideApprovalService(app, {
  tenantId,
  approvalId,
  decision,     // 'APPROVE'|'REJECT'
  decidedBy,
  reason,
}) {
  const approval = await decideApproval(app, {
    tenantId,
    approvalId,
    decision,
    decidedBy,
    decisionReason: reason,
  });

  if (!approval) {
    return { ok: false, message: 'Approval not found / already decided' };
  }

  await insertApprovalEvent(app, {
    tenantId,
    approvalId,
    eventType: 'DECIDED',
    actorId: decidedBy ?? null,
    note: decision,
    eventPayload: { reason: reason ?? null },
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(decidedBy),
    action: 'APPROVAL_DECIDED',
    entityType: 'APPROVAL',
    entityId: approval.id,
    payload: {
      decision,
      reason: reason ?? null,
    },
  });

  if (decision === 'APPROVE' && approval.action_code === 'LIFECYCLE_TRANSITION') {
    const out = await applyApprovedLifecycleTransition(app, { tenantId, approval });

    // optional: catat event APPLY_RESULT biar audit trail enak
    await insertApprovalEvent(app, {
      tenantId,
      approvalId,
      eventType: 'APPLY_RESULT',
      actorId: decidedBy ?? null,
      note: out.applied ? 'APPLIED' : 'SKIPPED',
      eventPayload: out,
    });

    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(decidedBy),
      action: 'APPROVAL_APPLY_RESULT',
      entityType: 'APPROVAL',
      entityId: approval.id,
      payload: out,
    });
  }

  return { ok: true, approval };
}

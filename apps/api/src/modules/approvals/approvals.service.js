import {
  listApprovals,
  getApproval,
  createApproval,
  insertApprovalEvent,
  decideApproval,
} from './approvals.repo.js';

import { applyApprovedLifecycleTransition } from '../lifecycle/lifecycle.service.js';

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
  }

  return { ok: true, approval };
}
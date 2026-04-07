import {
  CANCEL_INTERNAL_AUDIT_BODY,
  CLOSE_FINDING_BODY,
  COMPLETE_INTERNAL_AUDIT_BODY,
  CREATE_CHECKLIST_ITEM_BODY,
  CREATE_CHECKLIST_SECTION_BODY,
  CREATE_FINDING_BODY,
  CREATE_INTERNAL_AUDIT_BODY,
  CREATE_INTERNAL_AUDIT_MEMBER_BODY,
  INTERNAL_AUDIT_FINDING_PARAMS,
  INTERNAL_AUDIT_ID_PARAMS,
  INTERNAL_AUDIT_ITEM_PARAMS,
  INTERNAL_AUDIT_MEMBER_PARAMS,
  INTERNAL_AUDIT_SECTION_PARAMS,
  LIST_INTERNAL_AUDITS_QUERYSTRING,
  RECORD_CHECKLIST_RESULT_BODY,
  START_INTERNAL_AUDIT_BODY,
  UPDATE_CHECKLIST_ITEM_BODY,
  UPDATE_CHECKLIST_SECTION_BODY,
  UPDATE_FINDING_BODY,
  UPDATE_INTERNAL_AUDIT_BODY,
} from './internal-audit.schemas.js';
import { buildInternalAuditRepo } from './internal-audit.repo.js';
import { buildInternalAuditService } from './internal-audit.service.js';

function resolveDb(fastify) {
  if (fastify.db && typeof fastify.db.query === 'function') {
    return fastify.db;
  }

  if (fastify.pg && typeof fastify.pg.query === 'function') {
    return fastify.pg;
  }

  throw new Error(
    'No supported DB adapter found on Fastify instance. Expected fastify.db.query or fastify.pg.query.'
  );
}

export default async function internalAuditRoutes(fastify) {
  const db = resolveDb(fastify);
  const repo = buildInternalAuditRepo({ db });
  const service = buildInternalAuditService({ repo, fastify });

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Internal Audits'],
        querystring: LIST_INTERNAL_AUDITS_QUERYSTRING,
      },
    },
    async function handler(req) {
      const data = await service.listPlans(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Internal Audits'],
        body: CREATE_INTERNAL_AUDIT_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.createPlan(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.getPlan(req);
      return { ok: true, data };
    }
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: UPDATE_INTERNAL_AUDIT_BODY,
      },
    },
    async function handler(req) {
      const data = await service.updatePlan(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/start',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: START_INTERNAL_AUDIT_BODY,
      },
    },
    async function handler(req) {
      const data = await service.startPlan(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/complete',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: COMPLETE_INTERNAL_AUDIT_BODY,
      },
    },
    async function handler(req) {
      const data = await service.completePlan(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/cancel',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: CANCEL_INTERNAL_AUDIT_BODY,
      },
    },
    async function handler(req) {
      const data = await service.cancelPlan(req);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id/members',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.listMembers(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/members',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: CREATE_INTERNAL_AUDIT_MEMBER_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.addMember(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.delete(
    '/:id/members/:memberId',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_MEMBER_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.deleteMember(req);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id/checklist-sections',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.listChecklistSections(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/checklist-sections',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: CREATE_CHECKLIST_SECTION_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.createChecklistSection(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.patch(
    '/:id/checklist-sections/:sectionId',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_SECTION_PARAMS,
        body: UPDATE_CHECKLIST_SECTION_BODY,
      },
    },
    async function handler(req) {
      const data = await service.updateChecklistSection(req);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id/checklist-items',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.listChecklistItems(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/checklist-items',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: CREATE_CHECKLIST_ITEM_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.createChecklistItem(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.patch(
    '/:id/checklist-items/:itemId',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ITEM_PARAMS,
        body: UPDATE_CHECKLIST_ITEM_BODY,
      },
    },
    async function handler(req) {
      const data = await service.updateChecklistItem(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/checklist-items/:itemId/results',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ITEM_PARAMS,
        body: RECORD_CHECKLIST_RESULT_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.recordChecklistResult(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id/findings',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
      },
    },
    async function handler(req) {
      const data = await service.listFindings(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/findings',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_ID_PARAMS,
        body: CREATE_FINDING_BODY,
      },
    },
    async function handler(req, reply) {
      const data = await service.createFinding(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.patch(
    '/:id/findings/:findingId',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_FINDING_PARAMS,
        body: UPDATE_FINDING_BODY,
      },
    },
    async function handler(req) {
      const data = await service.updateFinding(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/findings/:findingId/close',
    {
      schema: {
        tags: ['Internal Audits'],
        params: INTERNAL_AUDIT_FINDING_PARAMS,
        body: CLOSE_FINDING_BODY,
      },
    },
    async function handler(req) {
      const data = await service.closeFindingAction(req);
      return { ok: true, data };
    }
  );
}
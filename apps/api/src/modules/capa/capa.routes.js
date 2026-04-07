import { buildCapaRepo } from './capa.repo.js';
import { buildCapaService } from './capa.service.js';
import {
  cancelCapaBodySchema,
  capaIdParamSchema,
  capaListQuerySchema,
  closeCapaBodySchema,
  correctiveActionCapaBodySchema,
  createCapaBodySchema,
  preventiveActionCapaBodySchema,
  rootCauseCapaBodySchema,
  updateCapaBodySchema,
  verificationCapaBodySchema,
} from './capa.schemas.js';

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

export default async function capaRoutes(fastify) {
  const db = resolveDb(fastify);
  const repo = buildCapaRepo({ db });
  const service = buildCapaService({ repo, fastify });

  fastify.get(
    '/',
    {
      schema: {
        tags: ['CAPA'],
        querystring: capaListQuerySchema,
      },
    },
    async function handler(req) {
      const data = await service.listCases(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['CAPA'],
        body: createCapaBodySchema,
      },
    },
    async function handler(req, reply) {
      const data = await service.createCase(req);
      reply.code(201);
      return { ok: true, data };
    }
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
      },
    },
    async function handler(req) {
      const data = await service.getCase(req);
      return { ok: true, data };
    }
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: updateCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.updateCase(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/root-cause',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: rootCauseCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.setRootCause(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/corrective-action',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: correctiveActionCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.setCorrectiveAction(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/preventive-action',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: preventiveActionCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.setPreventiveAction(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/verification',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: verificationCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.setVerification(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/close',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: closeCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.closeCase(req);
      return { ok: true, data };
    }
  );

  fastify.post(
    '/:id/cancel',
    {
      schema: {
        tags: ['CAPA'],
        params: capaIdParamSchema,
        body: cancelCapaBodySchema,
      },
    },
    async function handler(req) {
      const data = await service.cancelCase(req);
      return { ok: true, data };
    }
  );
}

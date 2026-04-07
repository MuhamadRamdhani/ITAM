import {
  cancelManagementReviewService,
  completeManagementReviewService,
  createManagementReviewActionItemService,
  createManagementReviewDecisionService,
  createManagementReviewService,
  deleteManagementReviewActionItemService,
  deleteManagementReviewDecisionService,
  getManagementReviewDetailService,
  listManagementReviewActionItemsService,
  listManagementReviewActionTrackerService,
  listManagementReviewDecisionsService,
  listManagementReviewsService,
  updateManagementReviewActionItemService,
  updateManagementReviewDecisionService,
  updateManagementReviewService,
} from './management-review.service.js';

import {
  cancelManagementReviewBodySchema,
  createManagementReviewActionItemBodySchema,
  createManagementReviewBodySchema,
  createManagementReviewDecisionBodySchema,
  managementReviewActionItemParamSchema,
  managementReviewActionTrackerQuerySchema,
  managementReviewDecisionParamSchema,
  managementReviewIdParamSchema,
  managementReviewListQuerySchema,
  updateManagementReviewActionItemBodySchema,
  updateManagementReviewBodySchema,
  updateManagementReviewDecisionBodySchema,
} from './management-review.schema.js';

function getDb(fastify) {
  if (fastify?.db?.query) return fastify.db;
  if (fastify?.pg?.query) return fastify.pg;
  if (fastify?.pg?.pool?.query) return fastify.pg.pool;
  throw new Error('Database client with .query() was not found on Fastify instance');
}

function getAuthContext(request) {
  const requestContext = request.requestContext;
  const getCtxValue =
    typeof requestContext?.get === 'function'
      ? (key) => requestContext.get(key)
      : (key) => requestContext?.[key];

  const tenantId =
    getCtxValue?.('tenant_id') ??
    getCtxValue?.('tenantId') ??
    request.user?.tenant_id ??
    request.user?.tenantId ??
    request.auth?.tenant_id ??
    request.auth?.tenantId;

  const userId =
    getCtxValue?.('user_id') ??
    getCtxValue?.('userId') ??
    request.user?.user_id ??
    request.user?.userId ??
    request.user?.id ??
    request.auth?.user_id ??
    request.auth?.userId ??
    request.auth?.id;

  const identityId =
    getCtxValue?.('identity_id') ??
    getCtxValue?.('identityId') ??
    request.user?.identity_id ??
    request.user?.identityId ??
    request.auth?.identity_id ??
    request.auth?.identityId;

  const roles =
    getCtxValue?.('roles') ??
    request.user?.roles ??
    request.auth?.roles ??
    [];

  return {
    tenantId,
    userId,
    identityId,
    roles,
  };
}

function sendError(reply, error) {
  const statusCode = Number(error?.statusCode ?? 500);
  const code =
    error?.code && typeof error.code === 'string'
      ? error.code
      : 'INTERNAL_SERVER_ERROR';

  return reply.code(statusCode).send({
    ok: false,
    error: {
      code,
      message: error?.message || 'Internal server error',
    },
  });
}

function wrap(handler) {
  return async function wrappedHandler(request, reply) {
    try {
      return await handler(request, reply);
    } catch (error) {
      request.log?.error?.(error);
      return sendError(reply, error);
    }
  };
}

export default async function managementReviewRoutes(fastify) {
  const db = getDb(fastify);

  fastify.get(
    '/',
    {
      schema: {
        querystring: managementReviewListQuerySchema,
      },
    },
    wrap(async (request) => {
      const data = await listManagementReviewsService({
        db,
        auth: getAuthContext(request),
        query: request.query,
      });

      return { ok: true, data };
    }),
  );

  fastify.post(
    '/',
    {
      schema: {
        body: createManagementReviewBodySchema,
      },
    },
    wrap(async (request, reply) => {
      const data = await createManagementReviewService({
        db,
        auth: getAuthContext(request),
        body: request.body,
      });

      return reply.code(201).send({ ok: true, data });
    }),
  );

  fastify.get(
    '/action-items/tracker',
    {
      schema: {
        querystring: managementReviewActionTrackerQuerySchema,
      },
    },
    wrap(async (request) => {
      const data = await listManagementReviewActionTrackerService({
        db,
        auth: getAuthContext(request),
        query: request.query,
      });

      return { ok: true, data };
    }),
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: managementReviewIdParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await getManagementReviewDetailService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
      });

      return { ok: true, data };
    }),
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        params: managementReviewIdParamSchema,
        body: updateManagementReviewBodySchema,
      },
    },
    wrap(async (request) => {
      const data = await updateManagementReviewService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        body: request.body,
      });

      return { ok: true, data };
    }),
  );

  fastify.post(
    '/:id/complete',
    {
      schema: {
        params: managementReviewIdParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await completeManagementReviewService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
      });

      return { ok: true, data };
    }),
  );

  fastify.post(
    '/:id/cancel',
    {
      schema: {
        params: managementReviewIdParamSchema,
        body: cancelManagementReviewBodySchema,
      },
    },
    wrap(async (request) => {
      const data = await cancelManagementReviewService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        body: request.body ?? {},
      });

      return { ok: true, data };
    }),
  );

  fastify.get(
    '/:id/decisions',
    {
      schema: {
        params: managementReviewIdParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await listManagementReviewDecisionsService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
      });

      return { ok: true, data };
    }),
  );

  fastify.post(
    '/:id/decisions',
    {
      schema: {
        params: managementReviewIdParamSchema,
        body: createManagementReviewDecisionBodySchema,
      },
    },
    wrap(async (request, reply) => {
      const data = await createManagementReviewDecisionService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        body: request.body,
      });

      return reply.code(201).send({ ok: true, data });
    }),
  );

  fastify.patch(
    '/:id/decisions/:decisionId',
    {
      schema: {
        params: managementReviewDecisionParamSchema,
        body: updateManagementReviewDecisionBodySchema,
      },
    },
    wrap(async (request) => {
      const data = await updateManagementReviewDecisionService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        decisionId: Number(request.params.decisionId),
        body: request.body,
      });

      return { ok: true, data };
    }),
  );

  fastify.delete(
    '/:id/decisions/:decisionId',
    {
      schema: {
        params: managementReviewDecisionParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await deleteManagementReviewDecisionService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        decisionId: Number(request.params.decisionId),
      });

      return { ok: true, data };
    }),
  );

  fastify.get(
    '/:id/action-items',
    {
      schema: {
        params: managementReviewIdParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await listManagementReviewActionItemsService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
      });

      return { ok: true, data };
    }),
  );

  fastify.post(
    '/:id/action-items',
    {
      schema: {
        params: managementReviewIdParamSchema,
        body: createManagementReviewActionItemBodySchema,
      },
    },
    wrap(async (request, reply) => {
      const data = await createManagementReviewActionItemService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        body: request.body,
      });

      return reply.code(201).send({ ok: true, data });
    }),
  );

  fastify.patch(
    '/:id/action-items/:actionItemId',
    {
      schema: {
        params: managementReviewActionItemParamSchema,
        body: updateManagementReviewActionItemBodySchema,
      },
    },
    wrap(async (request) => {
      const data = await updateManagementReviewActionItemService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        actionItemId: Number(request.params.actionItemId),
        body: request.body,
      });

      return { ok: true, data };
    }),
  );

  fastify.delete(
    '/:id/action-items/:actionItemId',
    {
      schema: {
        params: managementReviewActionItemParamSchema,
      },
    },
    wrap(async (request) => {
      const data = await deleteManagementReviewActionItemService({
        db,
        auth: getAuthContext(request),
        sessionId: Number(request.params.id),
        actionItemId: Number(request.params.actionItemId),
      });

      return { ok: true, data };
    }),
  );
}
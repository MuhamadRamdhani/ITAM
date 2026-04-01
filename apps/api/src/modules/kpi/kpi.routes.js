import {
  createKpiMeasurementService,
  createKpiService,
  getKpiDetailService,
  getKpiMetadataService,
  getKpiScorecardSummaryService,
  getKpiSystemMetricsService,
  getKpiTrendService,
  listKpiMeasurementsService,
  listKpisService,
  updateKpiService,
} from './kpi.service.js';
import {
  createKpiMeasurementSchema,
  createKpiSchema,
  getKpiDetailSchema,
  getKpiMetadataSchema,
  getKpiScorecardSummarySchema,
  getKpiSystemMetricsSchema,
  getKpiTrendSchema,
  listKpiMeasurementsSchema,
  listKpisSchema,
  updateKpiSchema,
} from './kpi.schema.js';

function resolveDb(fastify) {
  const db =
    fastify.db ||
    fastify.pg?.pool ||
    fastify.pg ||
    null;

  if (!db || typeof db.query !== 'function') {
    const error = new Error(
      'Database client is not available on Fastify instance.'
    );
    error.statusCode = 500;
    error.code = 'DB_UNAVAILABLE';
    throw error;
  }

  return db;
}

export default async function kpiRoutes(fastify) {
  fastify.get(
    '/metadata',
    { schema: getKpiMetadataSchema },
    async function getKpiMetadataHandler(request, reply) {
      const data = await getKpiMetadataService({
        requestContext: request.requestContext,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/system-metrics',
    { schema: getKpiSystemMetricsSchema },
    async function getKpiSystemMetricsHandler(request, reply) {
      const data = await getKpiSystemMetricsService({
        requestContext: request.requestContext,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/scorecard-summary',
    { schema: getKpiScorecardSummarySchema },
    async function getKpiScorecardSummaryHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await getKpiScorecardSummaryService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        query: request.query,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/',
    { schema: listKpisSchema },
    async function listKpisHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await listKpisService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        query: request.query,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.post(
    '/',
    { schema: createKpiSchema },
    async function createKpiHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await createKpiService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        body: request.body,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/:id',
    { schema: getKpiDetailSchema },
    async function getKpiDetailHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await getKpiDetailService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        id: request.params.id,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.patch(
    '/:id',
    { schema: updateKpiSchema },
    async function updateKpiHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await updateKpiService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        id: request.params.id,
        body: request.body,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/:id/measurements',
    { schema: listKpiMeasurementsSchema },
    async function listKpiMeasurementsHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await listKpiMeasurementsService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        id: request.params.id,
        query: request.query,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.post(
    '/:id/measurements',
    { schema: createKpiMeasurementSchema },
    async function createKpiMeasurementHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await createKpiMeasurementService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        id: request.params.id,
        body: request.body,
      });

      return reply.send({ ok: true, data });
    }
  );

  fastify.get(
    '/:id/trend',
    { schema: getKpiTrendSchema },
    async function getKpiTrendHandler(request, reply) {
      const db = resolveDb(fastify);

      const data = await getKpiTrendService({
        db,
        tenantId: request.tenantId,
        requestContext: request.requestContext,
        id: request.params.id,
        query: request.query,
      });

      return reply.send({ ok: true, data });
    }
  );
}
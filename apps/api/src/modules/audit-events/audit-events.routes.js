import { listAuditEventsService } from "./audit-events.service.js";

function getDbFromFastify(fastify) {
  return fastify.db ?? fastify.pg ?? fastify.dbPool ?? null;
}

function sendError(reply, err) {
  const statusCode = err?.statusCode || 500;
  const code = err?.code || "INTERNAL_SERVER_ERROR";

  reply.code(statusCode).send({
    ok: false,
    error: {
      code,
      message: err?.message || "Internal server error",
      details: err?.details,
    },
  });
}

export default async function auditEventsRoutes(fastify) {
  const db = getDbFromFastify(fastify);

  if (!db || typeof db.query !== "function") {
    throw new Error("Database handle not found on fastify instance");
  }

  fastify.get("/", async function handler(request, reply) {
    try {
      const data = await listAuditEventsService(db, request, request.query);
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });
}
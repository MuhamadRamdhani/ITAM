import {
  listScopeVersionsService,
  getScopeVersionDetailService,
  createScopeVersionService,
  deleteScopeVersionService,
  submitScopeVersionService,
  approveScopeVersionService,
  activateScopeVersionService,
} from "./scope.service.js";

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

export default async function governanceScopeRoutes(fastify) {
  const db = getDbFromFastify(fastify);

  if (!db || typeof db.query !== "function") {
    throw new Error("Database handle not found on fastify instance");
  }

  fastify.get("/", async function handler(request, reply) {
    try {
      const data = await listScopeVersionsService(db, request, request.query);
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.get("/:id", async function handler(request, reply) {
    try {
      const data = await getScopeVersionDetailService(db, request, request.params.id);
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.post("/", async function handler(request, reply) {
    try {
      const data = await createScopeVersionService(db, request, request.body ?? {});
      reply.code(201).send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.post("/:id/submit", async function handler(request, reply) {
    try {
      const data = await submitScopeVersionService(
        db,
        request,
        request.params.id,
        request.body ?? {}
      );
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.post("/:id/approve", async function handler(request, reply) {
    try {
      const data = await approveScopeVersionService(
        db,
        request,
        request.params.id,
        request.body ?? {}
      );
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.post("/:id/activate", async function handler(request, reply) {
    try {
      const data = await activateScopeVersionService(
        db,
        request,
        request.params.id,
        request.body ?? {}
      );
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });

  fastify.delete("/:id", async function handler(request, reply) {
    try {
      const data = await deleteScopeVersionService(db, request, request.params.id);
      reply.send({ ok: true, data });
    } catch (err) {
      sendError(reply, err);
    }
  });
}

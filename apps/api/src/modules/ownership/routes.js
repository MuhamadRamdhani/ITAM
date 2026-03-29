import {
  listOwnershipHistoryService,
  changeOwnershipService,
  changeOwnerService,
  changeCustodianService,
  changeLocationService,
} from "./ownership.service.js";

export default async function ownershipRoutes(app) {
  if (!app.pg) throw new Error("Postgres plugin not registered (app.pg missing)");

  // GET /api/v1/assets/:id/ownership-history
  app.get("/:id/ownership-history", async (req, reply) => {
    try {
      const assetId = req.params.id;
      const result = await listOwnershipHistoryService(app, req, assetId);
      return reply.send({ ok: true, data: result });
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const code = err.code || "INTERNAL_ERROR";
      return reply.code(statusCode).send({
        ok: false,
        error: { code, message: err.message },
      });
    }
  });

  // POST /api/v1/assets/:id/ownership-changes
  app.post("/:id/ownership-changes", async (req, reply) => {
    try {
      const assetId = req.params.id;
      const result = await changeOwnershipService(app, req, assetId, req.body);
      return reply.send(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const code = err.code || "INTERNAL_ERROR";
      return reply.code(statusCode).send({
        ok: false,
        error: { code, message: err.message, details: err.details },
      });
    }
  });

  // POST /api/v1/assets/:id/change-owner (convenience endpoint)
  app.post("/:id/change-owner", async (req, reply) => {
    try {
      const assetId = req.params.id;
      const result = await changeOwnerService(app, req, assetId, req.body);
      return reply.send(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const code = err.code || "INTERNAL_ERROR";
      return reply.code(statusCode).send({
        ok: false,
        error: { code, message: err.message, details: err.details },
      });
    }
  });

  // POST /api/v1/assets/:id/change-custodian (convenience endpoint)
  app.post("/:id/change-custodian", async (req, reply) => {
    try {
      const assetId = req.params.id;
      const result = await changeCustodianService(app, req, assetId, req.body);
      return reply.send(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const code = err.code || "INTERNAL_ERROR";
      return reply.code(statusCode).send({
        ok: false,
        error: { code, message: err.message, details: err.details },
      });
    }
  });

  // POST /api/v1/assets/:id/change-location (convenience endpoint)
  app.post("/:id/change-location", async (req, reply) => {
    try {
      const assetId = req.params.id;
      const result = await changeLocationService(app, req, assetId, req.body);
      return reply.send(result);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const code = err.code || "INTERNAL_ERROR";
      return reply.code(statusCode).send({
        ok: false,
        error: { code, message: err.message, details: err.details },
      });
    }
  });
}
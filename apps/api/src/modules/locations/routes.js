import { Type } from "@sinclair/typebox";
import {
  listLocationsService,
  createLocationService,
  patchLocationService,
} from "./locations.service.js";

export default async function locationsRoutes(app) {
  app.get(
    "/locations",
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const out = await listLocationsService(app, req, {
        q: req.query.q,
        page: req.query.page,
        pageSize: req.query.page_size,
      });

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  app.post(
    "/locations",
    {
      schema: {
        body: Type.Object({
          code: Type.Optional(Type.String()),
          name: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const location = await createLocationService(app, req, req.body);

      return reply.send({
        ok: true,
        data: { location },
        meta: { request_id: req.id },
      });
    }
  );

  app.patch(
    "/locations/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          code: Type.Optional(Type.String()),
          name: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const locationId = Number(req.params.id);
      if (!Number.isFinite(locationId) || locationId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid location id" },
          meta: { request_id: req.id },
        });
      }

      const location = await patchLocationService(
        app,
        req,
        locationId,
        req.body
      );

      return reply.send({
        ok: true,
        data: { location },
        meta: { request_id: req.id },
      });
    }
  );
}
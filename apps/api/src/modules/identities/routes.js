import { Type } from "@sinclair/typebox";
import {
  listIdentitiesService,
  createIdentityService,
  patchIdentityService,
} from "./identities.service.js";

export default async function identitiesRoutes(app) {
  app.get(
    "/identities",
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
      const out = await listIdentitiesService(app, req, {
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
    "/identities",
    {
      schema: {
        body: Type.Object({
          name: Type.String(),
          email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          department_id: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
        }),
      },
    },
    async (req, reply) => {
      const identity = await createIdentityService(app, req, req.body);

      return reply.send({
        ok: true,
        data: { identity },
        meta: { request_id: req.id },
      });
    }
  );

  app.patch(
    "/identities/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          name: Type.String(),
          email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          department_id: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
        }),
      },
    },
    async (req, reply) => {
      const identityId = Number(req.params.id);
      if (!Number.isFinite(identityId) || identityId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid identity id" },
          meta: { request_id: req.id },
        });
      }

      const identity = await patchIdentityService(
        app,
        req,
        identityId,
        req.body
      );

      return reply.send({
        ok: true,
        data: { identity },
        meta: { request_id: req.id },
      });
    }
  );
}
import { Type } from "@sinclair/typebox";
import {
  listRolesService,
  listUsersService,
  createUserService,
  patchUserService,
  changeUserRoleService,
} from "./iam.service.js";

export default async function iamRoutes(app) {
  // GET /api/v1/roles
  app.get("/roles", async (req, reply) => {
    const items = await listRolesService(app, req);
    return reply.send({ ok: true, data: { items }, meta: { request_id: req.id } });
  });

  // GET /api/v1/users?q=&page=&page_size=
  app.get(
    "/users",
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
      const out = await listUsersService(app, req, {
        q: req.query.q,
        page: req.query.page,
        pageSize: req.query.page_size,
      });
      return reply.send({ ok: true, data: out, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/users
  app.post(
    "/users",
    {
      schema: {
        body: Type.Object({
          email: Type.String(),
          password: Type.String(),
          status_code: Type.Optional(Type.String()),
          identity_id: Type.Optional(Type.Integer()),
        }),
      },
    },
    async (req, reply) => {
      const user = await createUserService(app, req, req.body);
      return reply.send({ ok: true, data: { user }, meta: { request_id: req.id } });
    }
  );

  // PATCH /api/v1/users/:id
  app.patch(
    "/users/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          status_code: Type.Optional(Type.String()), // ACTIVE|DISABLED
          password: Type.Optional(Type.String()),    // optional reset
        }),
      },
    },
    async (req, reply) => {
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid user id" },
          meta: { request_id: req.id },
        });
      }

      const user = await patchUserService(app, req, userId, req.body);
      return reply.send({ ok: true, data: { user }, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/users/:id/roles  (B: ADD/REMOVE)
  app.post(
    "/users/:id/roles",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          op: Type.String(),        // ADD|REMOVE
          role_code: Type.String(), // role code
        }),
      },
    },
    async (req, reply) => {
      const userId = Number(req.params.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid user id" },
          meta: { request_id: req.id },
        });
      }

      const out = await changeUserRoleService(app, req, userId, req.body);
      return reply.send({ ok: true, data: out, meta: { request_id: req.id } });
    }
  );
}
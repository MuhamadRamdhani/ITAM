import { Type } from "@sinclair/typebox";
import {
  listTenantsService,
  createTenantService,
  patchTenantService,
  getTenantSummaryService,
} from "./superadmin.service.js";
import {
  listRolesByTenantService,
  listUsersByTenantService,
  createUserByTenantService,
  patchUserByTenantService,
  changeUserRoleByTenantService,
} from "../iam/iam.service.js";

export default async function superadminRoutes(app) {
  app.get(
  "/tenants",
  {
    schema: {
      querystring: Type.Object({
        q: Type.Optional(Type.String()),
        status_code: Type.Optional(Type.String()),
        contract_health: Type.Optional(Type.String()),
        sort_by: Type.Optional(Type.String()),
        sort_dir: Type.Optional(Type.String()),
        page: Type.Optional(Type.Integer({ minimum: 1 })),
        page_size: Type.Optional(Type.Integer({ minimum: 1 })),
      }),
    },
  },
  async (req, reply) => {
    const out = await listTenantsService(app, req, {
      q: req.query.q,
      statusCode: req.query.status_code,
      contractHealth: req.query.contract_health,
      sortBy: req.query.sort_by,
      sortDir: req.query.sort_dir,
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
    "/tenants",
    {
      schema: {
        body: Type.Object({
          code: Type.String(),
          name: Type.String(),
          status_code: Type.Optional(Type.String()),
          plan_code: Type.Optional(Type.String()),
          contract_start_date: Type.String(),
          contract_end_date: Type.String(),
          subscription_notes: Type.Optional(
            Type.Union([Type.String(), Type.Null()])
          ),
        }),
      },
    },
    async (req, reply) => {
      const tenant = await createTenantService(app, req, req.body);

      return reply.send({
        ok: true,
        data: { tenant },
        meta: { request_id: req.id },
      });
    }
  );

  app.patch(
    "/tenants/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          name: Type.Optional(Type.String()),
          status_code: Type.Optional(Type.String()),
          plan_code: Type.Optional(Type.String()),
          contract_start_date: Type.Optional(
            Type.Union([Type.String(), Type.Null()])
          ),
          contract_end_date: Type.Optional(
            Type.Union([Type.String(), Type.Null()])
          ),
          subscription_notes: Type.Optional(
            Type.Union([Type.String(), Type.Null()])
          ),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = Number(req.params.id);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid tenant id" },
          meta: { request_id: req.id },
        });
      }

      const tenant = await patchTenantService(app, req, tenantId, req.body);

      return reply.send({
        ok: true,
        data: { tenant },
        meta: { request_id: req.id },
      });
    }
  );

  app.get(
    "/tenants/:id/summary",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
      },
    },
    async (req, reply) => {
      const tenantId = Number(req.params.id);
      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid tenant id" },
          meta: { request_id: req.id },
        });
      }

      const out = await getTenantSummaryService(app, req, tenantId);

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  // =========================================================
  // SUPERADMIN USER MANAGEMENT BY TARGET TENANT
  // mounted under /api/v1/superadmin
  // =========================================================

  app.get(
    "/tenants/:tenantId/roles",
    {
      schema: {
        params: Type.Object({
          tenantId: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const items = await listRolesByTenantService(app, req, req.params.tenantId);

      return reply.send({
        ok: true,
        data: { items },
        meta: { request_id: req.id },
      });
    }
  );

  app.get(
    "/tenants/:tenantId/users",
    {
      schema: {
        params: Type.Object({
          tenantId: Type.String(),
        }),
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const out = await listUsersByTenantService(app, req, req.params.tenantId, {
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
    "/tenants/:tenantId/users",
    {
      schema: {
        params: Type.Object({
          tenantId: Type.String(),
        }),
        body: Type.Object({
          email: Type.String(),
          password: Type.String(),
          status_code: Type.Optional(Type.String()),
          identity_id: Type.Optional(Type.Integer()),
        }),
      },
    },
    async (req, reply) => {
      const user = await createUserByTenantService(
        app,
        req,
        req.params.tenantId,
        req.body
      );

      return reply.send({
        ok: true,
        data: { user },
        meta: { request_id: req.id },
      });
    }
  );

  app.patch(
    "/tenants/:tenantId/users/:userId",
    {
      schema: {
        params: Type.Object({
          tenantId: Type.String(),
          userId: Type.String(),
        }),
        body: Type.Object({
          status_code: Type.Optional(Type.String()),
          password: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const user = await patchUserByTenantService(
        app,
        req,
        req.params.tenantId,
        req.params.userId,
        req.body
      );

      return reply.send({
        ok: true,
        data: { user },
        meta: { request_id: req.id },
      });
    }
  );

  app.post(
    "/tenants/:tenantId/users/:userId/roles",
    {
      schema: {
        params: Type.Object({
          tenantId: Type.String(),
          userId: Type.String(),
        }),
        body: Type.Object({
          op: Type.String(),
          role_code: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const out = await changeUserRoleByTenantService(
        app,
        req,
        req.params.tenantId,
        req.params.userId,
        req.body
      );

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );
}
import { Type } from "@sinclair/typebox";
import {
  listTenantsService,
  createTenantService,
  patchTenantService,
  getTenantSummaryService,
} from "./superadmin.service.js";

export default async function superadminRoutes(app) {
  app.get(
    "/tenants",
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          status_code: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const out = await listTenantsService(app, req, {
        q: req.query.q,
        statusCode: req.query.status_code,
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
}
import { Type } from "@sinclair/typebox";
import {
  listDepartmentsService,
  createDepartmentService,
  patchDepartmentService,
  deleteDepartmentService,
} from "./departments.service.js";

export default async function departmentsRoutes(app) {
  app.get(
    "/departments",
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
      const out = await listDepartmentsService(app, req, {
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
    "/departments",
    {
      schema: {
        body: Type.Object({
          code: Type.Optional(Type.String()),
          name: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const department = await createDepartmentService(app, req, req.body);

      return reply.send({
        ok: true,
        data: { department },
        meta: { request_id: req.id },
      });
    }
  );

  app.patch(
    "/departments/:id",
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
      const departmentId = Number(req.params.id);
      if (!Number.isFinite(departmentId) || departmentId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid department id" },
          meta: { request_id: req.id },
        });
      }

      const department = await patchDepartmentService(
        app,
        req,
        departmentId,
        req.body
      );

      return reply.send({
        ok: true,
        data: { department },
        meta: { request_id: req.id },
      });
    }
  );

  app.delete(
    "/departments/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
      },
    },
    async (req, reply) => {
      const departmentId = Number(req.params.id);
      if (!Number.isFinite(departmentId) || departmentId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid department id" },
          meta: { request_id: req.id },
        });
      }

      const department = await deleteDepartmentService(app, req, departmentId);

      return reply.send({
        ok: true,
        data: { department },
        meta: { request_id: req.id },
      });
    }
  );
}

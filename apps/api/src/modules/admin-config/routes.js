import { Type } from "@sinclair/typebox";
import {
  listAssetTypesAdminService,
  patchAssetTypeAdminService,
  listLifecycleStatesAdminService,
  patchLifecycleStateAdminService,
} from "./admin-config.service.js";

export default async function adminConfigRoutes(app) {
  app.get("/asset-types", async (req, reply) => {
    const items = await listAssetTypesAdminService(app, req);
    return reply.send({
      ok: true,
      data: { items },
      meta: { request_id: req.id },
    });
  });

  app.patch(
    "/asset-types/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          display_name: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid asset type id" },
          meta: { request_id: req.id },
        });
      }

      const item = await patchAssetTypeAdminService(app, req, id, req.body);
      return reply.send({
        ok: true,
        data: { item },
        meta: { request_id: req.id },
      });
    }
  );

  app.get("/lifecycle-states", async (req, reply) => {
    const items = await listLifecycleStatesAdminService(app, req);
    return reply.send({
      ok: true,
      data: { items },
      meta: { request_id: req.id },
    });
  });

  app.patch(
    "/lifecycle-states/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          display_name: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid lifecycle state id" },
          meta: { request_id: req.id },
        });
      }

      const item = await patchLifecycleStateAdminService(app, req, id, req.body);
      return reply.send({
        ok: true,
        data: { item },
        meta: { request_id: req.id },
      });
    }
  );
}
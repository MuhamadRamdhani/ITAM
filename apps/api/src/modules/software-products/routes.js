import {
  SoftwareProductsListQuerySchema,
  SoftwareProductParamsSchema,
  SoftwareProductCreateBodySchema,
  SoftwareProductPatchBodySchema,
} from "./software-products.schemas.js";

import {
  getSoftwareProductsService,
  getSoftwareProductDetailService,
  createSoftwareProductService,
  patchSoftwareProductService,
  deleteSoftwareProductService,
} from "./software-products.service.js";

function mustHaveAnyRole(req, allowed) {
  const raw = Array.isArray(req.requestContext?.roles)
    ? req.requestContext.roles
    : [];

  const roles = raw
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        return x.code ?? x.role_code ?? x.roleCode ?? "";
      }
      return "";
    })
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);

  const ok = allowed.some((r) => roles.includes(r));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowed, got: roles };
    throw e;
  }
}

const READ_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
  "AUDITOR",
];

const WRITE_ROLES = [
  "SUPERADMIN",
  "TENANT_ADMIN",
  "ITAM_MANAGER",
  "PROCUREMENT_CONTRACT_MANAGER",
];

export default async function softwareProductsRoutes(app) {
  app.get(
    "/",
    {
      schema: {
        querystring: SoftwareProductsListQuerySchema,
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, READ_ROLES);
      const data = await getSoftwareProductsService(app, req);
      return reply.send({ ok: true, data });
    }
  );

  app.get(
    "/:id",
    {
      schema: {
        params: SoftwareProductParamsSchema,
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, READ_ROLES);
      const data = await getSoftwareProductDetailService(app, req);
      return reply.send({ ok: true, data });
    }
  );

  app.post(
    "/",
    {
      schema: {
        body: SoftwareProductCreateBodySchema,
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, WRITE_ROLES);
      const data = await createSoftwareProductService(app, req, req.body || {});
      return reply.code(201).send({ ok: true, data });
    }
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: SoftwareProductParamsSchema,
        body: SoftwareProductPatchBodySchema,
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, WRITE_ROLES);
      const data = await patchSoftwareProductService(
        app,
        req,
        req.params.id,
        req.body || {}
      );
      return reply.send({ ok: true, data });
    }
  );

  app.delete(
    "/:id",
    {
      schema: {
        params: SoftwareProductParamsSchema,
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, WRITE_ROLES);
      const data = await deleteSoftwareProductService(
        app,
        req,
        req.params.id
      );
      return reply.send({ ok: true, data });
    }
  );
}

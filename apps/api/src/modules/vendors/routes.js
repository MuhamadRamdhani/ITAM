import { Type } from "@sinclair/typebox";
import {
  getVendorsService,
  getVendorDetailService,
  createVendorService,
  patchVendorService,
} from "./vendors.service.js";

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

export default async function vendorsRoutes(app) {
  app.get(
    "/",
    {
      schema: {
        querystring: Type.Object({
          search: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          page: Type.Optional(Type.Union([Type.String(), Type.Number()])),
          pageSize: Type.Optional(Type.Union([Type.String(), Type.Number()])),
        }),
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, READ_ROLES);
      const data = await getVendorsService(app, req);
      return reply.send({ ok: true, data });
    }
  );

  app.get(
    "/:id",
    {
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, READ_ROLES);
      const data = await getVendorDetailService(app, req);
      return reply.send({ ok: true, data });
    }
  );

  app.post(
    "/",
    {
      schema: {
        body: Type.Object({
          vendor_code: Type.String(),
          vendor_name: Type.String(),
          vendor_type: Type.String(),
          status: Type.Optional(Type.String()),
          primary_contact_name: Type.Optional(Type.String()),
          primary_contact_email: Type.Optional(Type.String()),
          primary_contact_phone: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, WRITE_ROLES);
      const data = await createVendorService(app, req, req.body || {});
      return reply.code(201).send({ ok: true, data });
    }
  );

  app.patch(
    "/:id",
    {
      schema: {
        params: Type.Object({
          id: Type.String(),
        }),
        body: Type.Object({
          vendor_code: Type.Optional(Type.String()),
          vendor_name: Type.Optional(Type.String()),
          vendor_type: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          primary_contact_name: Type.Optional(Type.String()),
          primary_contact_email: Type.Optional(Type.String()),
          primary_contact_phone: Type.Optional(Type.String()),
          notes: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      mustHaveAnyRole(req, WRITE_ROLES);
      const data = await patchVendorService(app, req, req.params.id, req.body || {});
      return reply.send({ ok: true, data });
    }
  );
}
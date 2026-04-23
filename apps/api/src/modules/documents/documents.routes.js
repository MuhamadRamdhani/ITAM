import { Type } from "@sinclair/typebox";
import {
  listDocumentsService,
  createDocumentService,
  getDocumentService,
  deleteDocumentService,
  addDocumentVersionService,
  submitDocumentService,
  approveDocumentService,
  publishDocumentService,
  archiveDocumentService,
} from "./documents.service.js";
import { getUiConfig } from "../config/config.repo.js";

function mustTenantId(req) {
  const tenantId = req.tenantId ?? req.requestContext?.tenantId;
  if (!tenantId) {
    const e = new Error("Missing tenantId in request context");
    e.statusCode = 500;
    e.code = "TENANT_CONTEXT_MISSING";
    throw e;
  }
  return tenantId;
}

function mustHaveAnyRole(req, allowed) {
  const raw = Array.isArray(req.requestContext?.roles) ? req.requestContext.roles : [];
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

async function resolvePageSize(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options) ? cfg.page_size_options : [];
  const def = Number(cfg.documents_page_size_default);

  if (requested == null) return def;

  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error("Invalid page_size");
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    throw e;
  }
  if (!options.includes(n)) {
    const e = new Error(`page_size must be one of: ${options.join(", ")}`);
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { allowed: options, got: n };
    throw e;
  }
  return n;
}

export default async function documentsRoutes(app) {
  // GET /api/v1/documents?q=&status=&type=&page=&page_size=
  app.get(
    "/documents",
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          status: Type.Optional(Type.String()),
          type: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);

      const page = req.query.page ?? 1;
      const pageSize = await resolvePageSize(app, tenantId, req.query.page_size);

      // tolerate status=ALL (even though FE omits)
      const status = req.query.status === "ALL" ? undefined : req.query.status;

      const out = await listDocumentsService(app, {
        tenantId,
        q: req.query.q,
        status,
        type: req.query.type,
        page,
        pageSize,
      });

      return reply.send({
        ok: true,
        data: {
          items: Array.isArray(out?.items) ? out.items : [],
          total: Number(out?.total ?? 0),
          page,
          page_size: pageSize,
        },
        meta: { request_id: req.id },
      });
    }
  );

  // POST /api/v1/documents
  app.post(
    "/documents",
    {
      schema: {
        body: Type.Object({
          doc_type_code: Type.String(),
          title: Type.String(),
          content_json: Type.Optional(Type.Any()),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

      const actorId = req.requestContext?.identityId ?? null;

      const out = await createDocumentService(app, {
        tenantId,
        docTypeCode: req.body.doc_type_code,
        title: req.body.title,
        contentJson: req.body.content_json ?? {},
        actorId,
      });

      if (!out.ok) {
        if (out.code === "DUPLICATE_DOCUMENT_TITLE") {
          return reply
            .code(409)
            .send({ ok: false, error: { code: out.code, message: out.message }, meta: { request_id: req.id } });
        }
        return reply
          .code(400)
          .send({ ok: false, error: { code: out.code, message: out.message }, meta: { request_id: req.id } });
      }

      return reply.send({
        ok: true,
        data: { document: out.document, version: out.version },
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/documents/:id
  app.get(
    "/documents/:id",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const data = await getDocumentService(app, { tenantId, documentId });
      if (!data) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Document not found" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data, meta: { request_id: req.id } });
    }
  );

  // DELETE /api/v1/documents/:id
  app.delete(
    "/documents/:id",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (req, reply) => {
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await deleteDocumentService(app, req, documentId);
      if (!out.ok) {
        return reply.code(out.statusCode ?? 400).send({
          ok: false,
          error: { code: out.code, message: out.message, details: out.details },
          meta: { request_id: req.id },
        });
      }

      return reply.send({
        ok: true,
        data: out.document,
        meta: { request_id: req.id },
      });
    }
  );

  // POST /api/v1/documents/:id/versions
  app.post(
    "/documents/:id/versions",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          content_json: Type.Optional(Type.Any()),
          note: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

      const actorId = req.requestContext?.identityId ?? null;
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await addDocumentVersionService(app, {
        tenantId,
        documentId,
        contentJson: req.body.content_json ?? {},
        actorId,
        note: req.body.note,
      });

      if (!out.ok) {
        const status = out.code === "NOT_FOUND" ? 404 : 400;
        return reply
          .code(status)
          .send({ ok: false, error: { code: out.code, message: out.message }, meta: { request_id: req.id } });
      }

      return reply.send({ ok: true, data: out, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/documents/:id/submit
  app.post(
    "/documents/:id/submit",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Optional(Type.Object({ note: Type.Optional(Type.String()) })),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

      const actorId = req.requestContext?.identityId ?? null;
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await submitDocumentService(app, { tenantId, documentId, actorId, note: req.body?.note });
      if (!out.ok) {
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_STATE", message: "Only DRAFT can be submitted" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data: out.document, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/documents/:id/approve
  app.post(
    "/documents/:id/approve",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Optional(Type.Object({ note: Type.Optional(Type.String()) })),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN"]);

      const actorId = req.requestContext?.identityId ?? null;
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await approveDocumentService(app, { tenantId, documentId, actorId, note: req.body?.note });
      if (!out.ok) {
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_STATE", message: "Only IN_REVIEW can be approved" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data: out.document, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/documents/:id/publish
  app.post(
    "/documents/:id/publish",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Optional(Type.Object({ note: Type.Optional(Type.String()) })),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN"]);

      const actorId = req.requestContext?.identityId ?? null;
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await publishDocumentService(app, { tenantId, documentId, actorId, note: req.body?.note });
      if (!out.ok) {
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_STATE", message: "Only APPROVED can be published" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data: out.document, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/documents/:id/archive
  app.post(
    "/documents/:id/archive",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Optional(Type.Object({ note: Type.Optional(Type.String()) })),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN"]);

      const actorId = req.requestContext?.identityId ?? null;
      const documentId = Number(req.params.id);

      if (!Number.isFinite(documentId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid document id" },
          meta: { request_id: req.id },
        });
      }

      const out = await archiveDocumentService(app, { tenantId, documentId, actorId, note: req.body?.note });
      if (!out.ok) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Not found or already archived" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data: out.document, meta: { request_id: req.id } });
    }
  );
}

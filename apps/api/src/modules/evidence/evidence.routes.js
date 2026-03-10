import { Type } from "@sinclair/typebox";
import fs from "node:fs";
import path from "node:path";

import {
  uploadEvidenceFileService,
  getEvidenceFileService,
  listEvidenceFilesService,
  attachEvidenceLinkService,
  listEvidenceLinksService,
} from "./evidence.service.js";

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

export default async function evidenceRoutes(app) {
  // GET /api/v1/evidence/files?q=&page=&page_size=
  app.get(
    "/evidence/files",
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
      const tenantId = mustTenantId(req);

      const out = await listEvidenceFilesService(app, {
        tenantId,
        q: req.query.q,
        page: req.query.page,
        pageSize: req.query.page_size,
      });

      return reply.send({ ok: true, data: out, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/evidence/files (multipart)
  app.post("/evidence/files", async (req, reply) => {
    const tenantId = mustTenantId(req);
    const actorId = req.requestContext?.identityId ?? null;

    const part = await req.file(); // expects field name "file"
    if (!part) {
      return reply.code(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Missing file (multipart field name: file)" },
        meta: { request_id: req.id },
      });
    }

    const fileRow = await uploadEvidenceFileService(app, { tenantId, actorId, part });

    return reply.send({
      ok: true,
      data: { file: fileRow },
      meta: { request_id: req.id },
    });
  });

  // GET /api/v1/evidence/files/:id (metadata)
  app.get(
    "/evidence/files/:id",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const fileId = Number(req.params.id);

      if (!Number.isFinite(fileId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid file id" },
          meta: { request_id: req.id },
        });
      }

      const file = await getEvidenceFileService(app, { tenantId, fileId });
      if (!file) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Evidence file not found" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({
        ok: true,
        data: {
          file,
          download_url: `/api/v1/evidence/files/${fileId}/download`,
        },
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/evidence/files/:id/download (stream file)
  app.get(
    "/evidence/files/:id/download",
    { schema: { params: Type.Object({ id: Type.String() }) } },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const fileId = Number(req.params.id);

      if (!Number.isFinite(fileId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid file id" },
          meta: { request_id: req.id },
        });
      }

      const file = await getEvidenceFileService(app, { tenantId, fileId });
      if (!file) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Evidence file not found" },
          meta: { request_id: req.id },
        });
      }

      const uploadsRoot = path.join(process.cwd(), "uploads");
      const fullPath = path.join(uploadsRoot, file.storage_path);

      if (!fs.existsSync(fullPath)) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Stored file missing on disk" },
          meta: { request_id: req.id },
        });
      }

      reply.header("Content-Type", file.mime_type || "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${file.original_name}"`);
      return reply.send(fs.createReadStream(fullPath));
    }
  );

  // POST /api/v1/evidence/links
  app.post(
    "/evidence/links",
    {
      schema: {
        body: Type.Object({
          target_type: Type.String(), // ASSET|DOCUMENT|APPROVAL
          target_id: Type.Integer(),
          evidence_file_id: Type.Integer(),
          note: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const actorId = req.requestContext?.identityId ?? null;

      const link = await attachEvidenceLinkService(app, {
        tenantId,
        actorId,
        body: req.body,
      });

      return reply.send({ ok: true, data: { link }, meta: { request_id: req.id } });
    }
  );

  // GET /api/v1/evidence/links?target_type=&target_id=&page=&page_size=
  app.get(
    "/evidence/links",
    {
      schema: {
        querystring: Type.Object({
          target_type: Type.String(),
          target_id: Type.Integer(),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);

      const out = await listEvidenceLinksService(app, {
        tenantId,
        targetType: req.query.target_type,
        targetId: req.query.target_id,
        page: req.query.page,
        pageSize: req.query.page_size,
      });

      return reply.send({ ok: true, data: out, meta: { request_id: req.id } });
    }
  );
}
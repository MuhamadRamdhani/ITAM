import { Type } from "@sinclair/typebox";
import fs from "node:fs";
import path from "node:path";

import {
  uploadEvidenceFileService,
  getEvidenceFileService,
  listEvidenceFilesService,
  attachEvidenceLinkService,
  listEvidenceLinksService,
  deleteEvidenceFileService,
} from "./evidence.service.js";
import { checkUploadRateLimit } from "../../lib/uploadRateLimit.js";

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

  // POST /api/v1/evidence/files (multipart with file upload security)
  app.post("/evidence/files", async (req, reply) => {
    const tenantId = mustTenantId(req);
    mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"]);

    const actorId = req.requestContext?.identityId ?? null;
    const userIp = req.ip;

    // Check rate limit BEFORE reading file
    const rateLimitCheck = checkUploadRateLimit({
      userId: actorId,
      userIp,
      fileSizeMB: 0, // Will check after getting file size
    });

    if (!rateLimitCheck.allowed) {
      return reply.code(429).send({
        ok: false,
        error: {
          code: rateLimitCheck.code,
          message: rateLimitCheck.reason,
          retry_after_seconds: rateLimitCheck.retryAfterSeconds,
        },
        meta: { request_id: req.id },
      });
    }

    const part = await req.file(); // expects field name "file"
    if (!part) {
      return reply.code(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Missing file (multipart field name: file)" },
        meta: { request_id: req.id },
      });
    }

    try {
      const fileRow = await uploadEvidenceFileService(app, { tenantId, actorId, part });

      // Record successful upload in rate limit
      checkUploadRateLimit({
        userId: actorId,
        userIp,
        fileSizeMB: fileRow.size_bytes / 1024 / 1024,
      });

      return reply.send({
        ok: true,
        data: { file: fileRow },
        meta: { request_id: req.id },
      });
    } catch (err) {
      // Handle upload security errors
      if (
        err.code === "INVALID_FILE_TYPE" ||
        err.code === "FILE_TOO_LARGE" ||
        err.code === "DANGEROUS_FILE_TYPE" ||
        err.code === "SUSPICIOUS_FILE_CONTENT" ||
        err.code === "INVALID_FILE_PATH"
      ) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: err.code,
            message: err.message,
          },
          meta: { request_id: req.id },
        });
      }

      // Re-throw other errors
      throw err;
    }
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

  // DELETE /api/v1/evidence/files/:id
  app.delete(
    "/evidence/files/:id",
    {
      schema: { params: Type.Object({ id: Type.String() }) },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "SUPERADMIN"]);

      const fileId = Number(req.params.id);
      if (!Number.isFinite(fileId) || fileId <= 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid file id" },
          meta: { request_id: req.id },
        });
      }

      const file = await deleteEvidenceFileService(app, {
        tenantId,
        actorId: req.requestContext?.identityId ?? null,
        fileId,
      });

      return reply.send({
        ok: true,
        data: { file },
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
      mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER", "ASSET_CUSTODIAN"]);

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

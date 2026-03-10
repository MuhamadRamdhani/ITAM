import { Type } from "@sinclair/typebox";
import {
  listApprovalsService,
  getApprovalService,
  decideApprovalService,
} from "./approvals.service.js";
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

export default async function approvalsRoutes(app) {
  // GET /api/v1/approvals?status=&q=&page=&page_size=
  app.get(
    "/approvals",
    {
      schema: {
        querystring: Type.Object({
          status: Type.Optional(Type.String()),
          q: Type.Optional(Type.String()),
          page: Type.Optional(Type.Integer({ minimum: 1 })),
          page_size: Type.Optional(Type.Integer({ minimum: 1 })),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const page = req.query.page ?? 1;
      const pageSize = await resolvePageSize(app, tenantId, req.query.page_size);

      const out = await listApprovalsService(app, {
        tenantId,
        status: req.query.status,
        q: req.query.q,
        page,
        pageSize,
      });

      // standard list envelope
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

  // GET /api/v1/approvals/:id
  app.get(
    "/approvals/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const approvalId = Number(req.params.id);

      if (!Number.isFinite(approvalId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid approval id" },
          meta: { request_id: req.id },
        });
      }

      const data = await getApprovalService(app, { tenantId, approvalId });
      if (!data) {
        return reply.code(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: "Approval not found" },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data, meta: { request_id: req.id } });
    }
  );

  // POST /api/v1/approvals/:id/decide
  app.post(
    "/approvals/:id/decide",
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
          decision: Type.Union([Type.Literal("APPROVE"), Type.Literal("REJECT")]),
          reason: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const tenantId = mustTenantId(req);
      const approvalId = Number(req.params.id);

      if (!Number.isFinite(approvalId)) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid approval id" },
          meta: { request_id: req.id },
        });
      }

      const decidedBy = req.requestContext?.identityId ?? null;

      const out = await decideApprovalService(app, {
        tenantId,
        approvalId,
        decision: req.body.decision,
        decidedBy,
        reason: req.body.reason,
      });

      if (!out.ok) {
        return reply.code(400).send({
          ok: false,
          error: { code: "BAD_REQUEST", message: out.message },
          meta: { request_id: req.id },
        });
      }

      return reply.send({ ok: true, data: out.approval, meta: { request_id: req.id } });
    }
  );
}
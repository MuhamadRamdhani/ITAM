import {
  createContractService,
  getContractDetailService,
  getContractSoftwareComplianceSummaryService,
  getContractSoftwareConsumptionSummaryService,
  getContractSoftwareOptimizationSummaryService,
  getContractSoftwareRenewalSummaryService,
  listContractsService,
  updateContractService,
} from "./contracts.service.js";

import {
  listContractDocumentsService,
  attachContractDocumentService,
  detachContractDocumentService,
  listContractAssetsService,
  attachContractAssetService,
  detachContractAssetService,
  listContractEvidenceService,
  attachContractEvidenceService,
  detachContractEvidenceService,
} from "./contracts.relations.service.js";

export default async function contractsRoutes(app) {
  // GET /api/v1/contracts
  app.get("/", async function getContractsHandler(req, reply) {
    const result = await listContractsService(app, req);

    return reply.send({
      ok: true,
      data: {
        items: result.rows,
        total: result.pagination.total,
        page: result.pagination.page,
        page_size: result.pagination.page_size,
        total_pages: result.pagination.total_pages,
      },
      meta: { request_id: req.id },
    });
  });

  // GET /api/v1/contracts/:id
  app.get("/:id", async function getContractDetailHandler(req, reply) {
    const row = await getContractDetailService(app, req);

    return reply.send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });

  // GET /api/v1/contracts/:id/software-compliance-summary
  app.get(
    "/:id/software-compliance-summary",
    async function getContractSoftwareComplianceSummaryHandler(req, reply) {
      const out = await getContractSoftwareComplianceSummaryService(app, req);

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/contracts/:id/software-consumption-summary
  app.get(
    "/:id/software-consumption-summary",
    async function getContractSoftwareConsumptionSummaryHandler(req, reply) {
      const out = await getContractSoftwareConsumptionSummaryService(app, req);

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/contracts/:id/software-optimization-summary
  app.get(
    "/:id/software-optimization-summary",
    async function getContractSoftwareOptimizationSummaryHandler(req, reply) {
      const out = await getContractSoftwareOptimizationSummaryService(app, req);

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/contracts/:id/software-renewal-summary
  app.get(
    "/:id/software-renewal-summary",
    async function getContractSoftwareRenewalSummaryHandler(req, reply) {
      const out = await getContractSoftwareRenewalSummaryService(app, req);

      return reply.send({
        ok: true,
        data: out,
        meta: { request_id: req.id },
      });
    }
  );

  // POST /api/v1/contracts
  app.post("/", async function createContractHandler(req, reply) {
    const row = await createContractService(app, req);

    return reply.code(201).send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });

  // PATCH /api/v1/contracts/:id
  app.patch("/:id", async function updateContractHandler(req, reply) {
    const row = await updateContractService(app, req);

    return reply.send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });

  // =========================
  // CONTRACT <-> DOCUMENTS
  // =========================

  // GET /api/v1/contracts/:id/documents
  app.get("/:id/documents", async function listContractDocumentsHandler(req, reply) {
    const out = await listContractDocumentsService(app, req);

    return reply.send({
      ok: true,
      data: out,
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/contracts/:id/documents
  app.post("/:id/documents", async function attachContractDocumentHandler(req, reply) {
    const link = await attachContractDocumentService(app, req);

    return reply.code(201).send({
      ok: true,
      data: { link },
      meta: { request_id: req.id },
    });
  });

  // DELETE /api/v1/contracts/:id/documents/:documentId
  app.delete("/:id/documents/:documentId", async function detachContractDocumentHandler(req, reply) {
    const deleted = await detachContractDocumentService(app, req);

    return reply.send({
      ok: true,
      data: { link: deleted },
      meta: { request_id: req.id },
    });
  });

  // =========================
  // CONTRACT <-> ASSETS
  // =========================

  // GET /api/v1/contracts/:id/assets
  app.get("/:id/assets", async function listContractAssetsHandler(req, reply) {
    const out = await listContractAssetsService(app, req);

    return reply.send({
      ok: true,
      data: out,
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/contracts/:id/assets
  app.post("/:id/assets", async function attachContractAssetHandler(req, reply) {
    const link = await attachContractAssetService(app, req);

    return reply.code(201).send({
      ok: true,
      data: { link },
      meta: { request_id: req.id },
    });
  });

  // DELETE /api/v1/contracts/:id/assets/:assetId
  app.delete("/:id/assets/:assetId", async function detachContractAssetHandler(req, reply) {
    const deleted = await detachContractAssetService(app, req);

    return reply.send({
      ok: true,
      data: { link: deleted },
      meta: { request_id: req.id },
    });
  });

  // =========================
  // CONTRACT <-> EVIDENCE
  // =========================

  // GET /api/v1/contracts/:id/evidence
  app.get("/:id/evidence", async function listContractEvidenceHandler(req, reply) {
    const out = await listContractEvidenceService(app, req);

    return reply.send({
      ok: true,
      data: out,
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/contracts/:id/evidence
  app.post("/:id/evidence", async function attachContractEvidenceHandler(req, reply) {
    const link = await attachContractEvidenceService(app, req);

    return reply.code(201).send({
      ok: true,
      data: { link },
      meta: { request_id: req.id },
    });
  });

  // DELETE /api/v1/contracts/:id/evidence-links/:linkId
  app.delete("/:id/evidence-links/:linkId", async function detachContractEvidenceHandler(req, reply) {
    const deleted = await detachContractEvidenceService(app, req);

    return reply.send({
      ok: true,
      data: { link: deleted },
      meta: { request_id: req.id },
    });
  });
}
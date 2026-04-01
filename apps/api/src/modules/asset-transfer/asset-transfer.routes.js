import {
  createAssetTransferRequestService,
  decideAssetTransferRequestService,
  getAssetTransferPreviewService,
  getAssetTransferRequestDetailService,
  getTargetTenantOptionsService,
  listAssetTransferRequestsService,
  submitAssetTransferRequestService,
} from "./asset-transfer.service.js";

export default async function assetTransferRoutes(app) {
  // GET /api/v1/asset-transfer-requests/preview?asset_id=..&target_tenant_id=..
  app.get("/preview", async function getAssetTransferPreviewHandler(req, reply) {
    const out = await getAssetTransferPreviewService(app, req);

    return reply.send({
      ok: true,
      data: out,
      meta: { request_id: req.id },
    });
  });

  // GET /api/v1/asset-transfer-requests/target-tenant-options?q=...&limit=50
  // IMPORTANT: static route must be before "/:id"
  app.get(
    "/target-tenant-options",
    async function getTargetTenantOptionsHandler(req, reply) {
      const items = await getTargetTenantOptionsService(app, req);

      return reply.send({
        ok: true,
        data: {
          items,
        },
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/asset-transfer-requests
  app.get("/", async function listAssetTransferRequestsHandler(req, reply) {
    const result = await listAssetTransferRequestsService(app, req);

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

  // POST /api/v1/asset-transfer-requests
  app.post("/", async function createAssetTransferRequestHandler(req, reply) {
    const row = await createAssetTransferRequestService(app, req);

    return reply.code(201).send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });

  // GET /api/v1/asset-transfer-requests/:id
  app.get("/:id", async function getAssetTransferRequestDetailHandler(req, reply) {
    const out = await getAssetTransferRequestDetailService(app, req);

    return reply.send({
      ok: true,
      data: out,
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/asset-transfer-requests/:id/submit
  app.post("/:id/submit", async function submitAssetTransferRequestHandler(req, reply) {
    const row = await submitAssetTransferRequestService(app, req);

    return reply.send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/asset-transfer-requests/:id/decide
  app.post("/:id/decide", async function decideAssetTransferRequestHandler(req, reply) {
    const row = await decideAssetTransferRequestService(app, req);

    return reply.send({
      ok: true,
      data: row,
      meta: { request_id: req.id },
    });
  });
}
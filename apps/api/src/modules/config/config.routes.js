import { listAssetTypes, listLifecycleStates, getUiConfig } from "./config.repo.js";

export default async function configRoutes(app) {
  app.get("/asset-types", async (req) => {
    const items = await listAssetTypes(app, req.tenantId);
    return { ok: true, data: { items }, meta: { request_id: req.id } };
  });

  app.get("/lifecycle-states", async (req) => {
    const items = await listLifecycleStates(app, req.tenantId);
    return { ok: true, data: { items }, meta: { request_id: req.id } };
  });

  app.get("/ui", async (req) => {
    const cfg = await getUiConfig(app, req.tenantId);
    return { ok: true, data: cfg, meta: { request_id: req.id } };
  });
}
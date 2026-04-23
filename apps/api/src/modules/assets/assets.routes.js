import {
  AssetListQuery,
  AssetListResponse,
  AssetDetailResponse,
  AssetCreateBody,
  AssetUpdateBody,
  SimpleOkResponse,
} from "./assets.schemas.js";

import {
  listAssets,
  getAssetDetail,
  createAsset,
  patchAsset,
  deleteAssetService,
} from "./assets.service.js";

export default async function assetsRoutes(app) {
  app.get(
    "/",
    { schema: { querystring: AssetListQuery, response: { 200: AssetListResponse } } },
    async (req) => {
      const data = await listAssets(app, req, req.query);
      return { ok: true, data, meta: { request_id: req.id } };
    }
  );

  app.get(
    "/:id",
    { schema: { response: { 200: AssetDetailResponse } } },
    async (req) => {
      const assetId = Number(req.params.id);
      if (!Number.isFinite(assetId)) {
        const e = new Error("Invalid asset id");
        e.statusCode = 400;
        throw e;
      }

      const asset = await getAssetDetail(app, req, assetId);
      if (!asset) {
        const e = new Error("Asset not found");
        e.statusCode = 404;
        throw e;
      }

      return { ok: true, data: { asset }, meta: { request_id: req.id } };
    }
  );

  app.post(
    "/",
    { schema: { body: AssetCreateBody, response: { 200: SimpleOkResponse } } },
    async (req) => {
      const id = await createAsset(app, req, req.body);
      return { ok: true, data: { id }, meta: { request_id: req.id } };
    }
  );

  app.patch(
    "/:id",
    { schema: { body: AssetUpdateBody, response: { 200: SimpleOkResponse } } },
    async (req) => {
      const assetId = Number(req.params.id);
      if (!Number.isFinite(assetId)) {
        const e = new Error("Invalid asset id");
        e.statusCode = 400;
        throw e;
      }

      const id = await patchAsset(app, req, assetId, req.body);
      if (!id) {
        const e = new Error("Asset not found");
        e.statusCode = 404;
        throw e;
      }

      return { ok: true, data: { id }, meta: { request_id: req.id } };
    }
  );

  app.delete(
    "/:id",
    { schema: { response: { 200: SimpleOkResponse } } },
    async (req) => {
      const assetId = Number(req.params.id);
      if (!Number.isFinite(assetId)) {
        const e = new Error("Invalid asset id");
        e.statusCode = 400;
        throw e;
      }

      const data = await deleteAssetService(app, req, assetId);
      return { ok: true, data: { id: data.id }, meta: { request_id: req.id } };
    }
  );
}

import {
  AssetCoverageListQuery,
  AssetCoverageSummaryQuery,
  AssetCoverageListResponse,
  AssetCoverageSummaryResponse,
} from "./asset-coverage.schemas.js";

import {
  listAssetCoverageService,
  getAssetCoverageSummaryService,
  exportAssetCoverageXlsxService,
} from "./asset-coverage.service.js";

export default async function reportsRoutes(app) {
  app.get(
    "/asset-coverage",
    {
      schema: {
        querystring: AssetCoverageListQuery,
        response: { 200: AssetCoverageListResponse },
      },
    },
    async (req) => {
      const data = await listAssetCoverageService(app, req);
      return { ok: true, data, meta: { request_id: req.id } };
    }
  );

  app.get(
    "/asset-coverage/summary",
    {
      schema: {
        querystring: AssetCoverageSummaryQuery,
        response: { 200: AssetCoverageSummaryResponse },
      },
    },
    async (req) => {
      const data = await getAssetCoverageSummaryService(app, req);
      return { ok: true, data, meta: { request_id: req.id } };
    }
  );

  app.get(
    "/asset-coverage/export.xlsx",
    {
      schema: {
        querystring: AssetCoverageSummaryQuery,
      },
    },
    async (req, reply) => {
      return await exportAssetCoverageXlsxService(app, req, reply);
    }
  );
}
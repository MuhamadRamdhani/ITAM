import {
  assetSoftwareInstallationsParamsSchema,
  assetSoftwareInstallationMutationParamsSchema,
  createAssetSoftwareInstallationBodySchema,
  updateAssetSoftwareInstallationBodySchema,
} from "./software-installations.schemas.js";

import {
  listAssetSoftwareInstallationsService,
  createAssetSoftwareInstallationService,
  updateAssetSoftwareInstallationService,
  deleteAssetSoftwareInstallationService,
} from "./software-installations.service.js";

export default async function softwareInstallationsRoutes(app) {
  app.get(
    "/:id/software-installations",
    {
      schema: {
        tags: ["Software Installations"],
        params: assetSoftwareInstallationsParamsSchema,
      },
    },
    async function listAssetSoftwareInstallationsHandler(req, reply) {
      const data = await listAssetSoftwareInstallationsService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );

  app.post(
    "/:id/software-installations",
    {
      schema: {
        tags: ["Software Installations"],
        params: assetSoftwareInstallationsParamsSchema,
        body: createAssetSoftwareInstallationBodySchema,
      },
    },
    async function createAssetSoftwareInstallationHandler(req, reply) {
      const data = await createAssetSoftwareInstallationService(app, req);

      return reply.code(201).send({
        ok: true,
        data,
      });
    }
  );

  app.patch(
    "/:id/software-installations/:installationId",
    {
      schema: {
        tags: ["Software Installations"],
        params: assetSoftwareInstallationMutationParamsSchema,
        body: updateAssetSoftwareInstallationBodySchema,
      },
    },
    async function updateAssetSoftwareInstallationHandler(req, reply) {
      const data = await updateAssetSoftwareInstallationService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );

  app.delete(
    "/:id/software-installations/:installationId",
    {
      schema: {
        tags: ["Software Installations"],
        params: assetSoftwareInstallationMutationParamsSchema,
      },
    },
    async function deleteAssetSoftwareInstallationHandler(req, reply) {
      const data = await deleteAssetSoftwareInstallationService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );
}

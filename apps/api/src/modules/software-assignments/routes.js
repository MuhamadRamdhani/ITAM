import {
  assetSoftwareAssignmentsParamsSchema,
  assetSoftwareAssignmentMutationParamsSchema,
  createAssetSoftwareAssignmentBodySchema,
  updateAssetSoftwareAssignmentBodySchema,
} from "./software-assignments.schemas.js";

import {
  listAssetSoftwareAssignmentsService,
  createAssetSoftwareAssignmentService,
  updateAssetSoftwareAssignmentService,
} from "./software-assignments.service.js";

export default async function softwareAssignmentsRoutes(app) {
  app.get(
    "/:id/software-assignments",
    {
      schema: {
        tags: ["Software Assignments"],
        params: assetSoftwareAssignmentsParamsSchema,
      },
    },
    async function listAssetSoftwareAssignmentsHandler(req, reply) {
      const data = await listAssetSoftwareAssignmentsService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );

  app.post(
    "/:id/software-assignments",
    {
      schema: {
        tags: ["Software Assignments"],
        params: assetSoftwareAssignmentsParamsSchema,
        body: createAssetSoftwareAssignmentBodySchema,
      },
    },
    async function createAssetSoftwareAssignmentHandler(req, reply) {
      const data = await createAssetSoftwareAssignmentService(app, req);

      return reply.code(201).send({
        ok: true,
        data,
      });
    }
  );

  app.patch(
    "/:id/software-assignments/:assignmentId",
    {
      schema: {
        tags: ["Software Assignments"],
        params: assetSoftwareAssignmentMutationParamsSchema,
        body: updateAssetSoftwareAssignmentBodySchema,
      },
    },
    async function updateAssetSoftwareAssignmentHandler(req, reply) {
      const data = await updateAssetSoftwareAssignmentService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );
}
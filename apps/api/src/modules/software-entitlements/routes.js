import {
  contractSoftwareEntitlementsParamsSchema,
  contractSoftwareEntitlementMutationParamsSchema,
  createContractSoftwareEntitlementBodySchema,
  updateContractSoftwareEntitlementBodySchema,
} from "./software-entitlements.schemas.js";

import {
  listContractSoftwareEntitlementsService,
  createContractSoftwareEntitlementService,
  updateContractSoftwareEntitlementService,
} from "./software-entitlements.service.js";

export default async function softwareEntitlementsRoutes(app) {
  app.get(
    "/:id/software-entitlements",
    {
      schema: {
        tags: ["Software Entitlements"],
        params: contractSoftwareEntitlementsParamsSchema,
      },
    },
    async function listContractSoftwareEntitlementsHandler(req, reply) {
      const data = await listContractSoftwareEntitlementsService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );

  app.post(
    "/:id/software-entitlements",
    {
      schema: {
        tags: ["Software Entitlements"],
        params: contractSoftwareEntitlementsParamsSchema,
        body: createContractSoftwareEntitlementBodySchema,
      },
    },
    async function createContractSoftwareEntitlementHandler(req, reply) {
      const data = await createContractSoftwareEntitlementService(app, req);

      return reply.code(201).send({
        ok: true,
        data,
      });
    }
  );

  app.patch(
    "/:id/software-entitlements/:entitlementId",
    {
      schema: {
        tags: ["Software Entitlements"],
        params: contractSoftwareEntitlementMutationParamsSchema,
        body: updateContractSoftwareEntitlementBodySchema,
      },
    },
    async function updateContractSoftwareEntitlementHandler(req, reply) {
      const data = await updateContractSoftwareEntitlementService(app, req);

      return reply.send({
        ok: true,
        data,
      });
    }
  );
}
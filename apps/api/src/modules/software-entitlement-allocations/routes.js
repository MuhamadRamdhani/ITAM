import {
  entitlementAllocationsParamsSchema,
  entitlementAllocationMutationParamsSchema,
  createEntitlementAllocationBodySchema,
  updateEntitlementAllocationBodySchema,
} from "./software-entitlement-allocations.schemas.js";

import {
  listEntitlementAllocationsService,
  createEntitlementAllocationService,
  updateEntitlementAllocationService,
} from "./software-entitlement-allocations.service.js";

export default async function softwareEntitlementAllocationsRoutes(app) {
  app.get(
    "/:id/allocations",
    {
      schema: {
        tags: ["Software Entitlement Allocations"],
        params: entitlementAllocationsParamsSchema,
      },
    },
    async function listEntitlementAllocationsHandler(req, reply) {
      const data = await listEntitlementAllocationsService(app, req);
      return reply.send({ ok: true, data });
    }
  );

  app.post(
    "/:id/allocations",
    {
      schema: {
        tags: ["Software Entitlement Allocations"],
        params: entitlementAllocationsParamsSchema,
        body: createEntitlementAllocationBodySchema,
      },
    },
    async function createEntitlementAllocationHandler(req, reply) {
      const data = await createEntitlementAllocationService(app, req);
      return reply.code(201).send({ ok: true, data });
    }
  );

  app.patch(
    "/:id/allocations/:allocationId",
    {
      schema: {
        tags: ["Software Entitlement Allocations"],
        params: entitlementAllocationMutationParamsSchema,
        body: updateEntitlementAllocationBodySchema,
      },
    },
    async function updateEntitlementAllocationHandler(req, reply) {
      const data = await updateEntitlementAllocationService(app, req);
      return reply.send({ ok: true, data });
    }
  );
}
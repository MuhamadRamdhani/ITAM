import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";

import dbPlugin from "./plugins/db.js";
import errorHandler from "./plugins/errorHandler.js";
import requestContext from "./plugins/requestContext.js";
import { securityHeadersPlugin } from "./plugins/securityHeaders.js";
import iamRoutes from "./modules/iam/routes.js";
import superadminRoutes from "./modules/superadmin/routes.js";
import departmentsRoutes from "./modules/departments/routes.js";
import locationsRoutes from "./modules/locations/routes.js";
import identitiesRoutes from "./modules/identities/routes.js";
import adminConfigRoutes from "./modules/admin-config/routes.js";

import authRoutes from "./modules/auth/auth.routes.js";
import configRoutes from "./modules/config/config.routes.js";
import assetsRoutes from "./modules/assets/assets.routes.js";
import masterdataRoutes from "./modules/masterdata/routes.js";
import ownershipRoutes from "./modules/ownership/routes.js";
import lifecycleRoutes from "./modules/lifecycle/routes.js";
import approvalsRoutes from "./modules/approvals/approvals.routes.js";
import documentsRoutes from "./modules/documents/documents.routes.js";
import evidenceRoutes from "./modules/evidence/evidence.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import auditEventsRoutes from "./modules/audit-events/audit-events.routes.js";
import vendorsRoutes from "./modules/vendors/routes.js";
import contractsRoutes from "./modules/contracts/routes.js";
import reportsRoutes from "./modules/reports/routes.js";
import governanceScopeRoutes from "./modules/governance/scope.routes.js";
import governanceContextRoutes from "./modules/governance/context.routes.js"; 
import governanceStakeholdersRoutes from "./modules/governance/stakeholders.routes.js";
import softwareProductsRoutes from "./modules/software-products/routes.js";
import softwareInstallationsRoutes from "./modules/software-installations/routes.js";
import softwareAssignmentsRoutes from "./modules/software-assignments/routes.js";
import softwareEntitlementsRoutes from "./modules/software-entitlements/routes.js";
import softwareEntitlementAllocationsRoutes from "./modules/software-entitlement-allocations/routes.js";
import assetTransferRoutes from "./modules/asset-transfer/asset-transfer.routes.js";
import capaRoutes from "./modules/capa/capa.routes.js";
import kpiRoutes from "./modules/kpi/kpi.routes.js";
import internalAuditRoutes from './modules/internal-audits/internal-audit.routes.js';
import managementReviewRoutes from './modules/management-review/management-review.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(dbPlugin);

  await app.register(cookie);

  if (!process.env.AUTH_JWT_SECRET) {
    const e = new Error("AUTH_JWT_SECRET is missing");
    e.statusCode = 500;
    e.code = "CONFIG_MISSING";
    throw e;
  }

  await app.register(jwt, {
    secret: process.env.AUTH_JWT_SECRET,
  });

  await app.register(errorHandler);

  await app.register(securityHeadersPlugin);

  app.get("/health", async () => ({
    ok: true,
    service: "api",
    time: new Date().toISOString(),
  }));

  await app.register(authRoutes, { prefix: "/api/v1/auth" });

  await app.register(requestContext);
  await app.register(iamRoutes, { prefix: "/api/v1" });
  await app.register(superadminRoutes, { prefix: "/api/v1/superadmin" });
  await app.register(departmentsRoutes, { prefix: "/api/v1/admin" });
  await app.register(locationsRoutes, { prefix: "/api/v1/admin" });
  await app.register(identitiesRoutes, { prefix: "/api/v1/admin" });
  await app.register(adminConfigRoutes, { prefix: "/api/v1/admin" });
  
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  });

  await app.register(configRoutes, { prefix: "/api/v1/config" });
  await app.register(assetsRoutes, { prefix: "/api/v1/assets" });
  await app.register(lifecycleRoutes, { prefix: "/api/v1/assets" });
  await app.register(masterdataRoutes, { prefix: "/api/v1" });
  await app.register(ownershipRoutes, { prefix: "/api/v1/assets" });
  await app.register(approvalsRoutes, { prefix: "/api/v1" });
  await app.register(documentsRoutes, { prefix: "/api/v1" });
  await app.register(evidenceRoutes, { prefix: "/api/v1" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(auditEventsRoutes, { prefix: "/api/v1/audit-events"});
  await app.register(reportsRoutes, { prefix: "/api/v1/reports" });
  await app.register(vendorsRoutes, { prefix: "/api/v1/vendors" });
  await app.register(contractsRoutes, { prefix: "/api/v1/contracts" });
  await app.register(softwareProductsRoutes, { prefix: "/api/v1/software-products" });
  await app.register(softwareInstallationsRoutes, { prefix: "/api/v1/assets" });
  await app.register(softwareAssignmentsRoutes, { prefix: "/api/v1/assets" });
  await app.register(softwareEntitlementsRoutes, { prefix: "/api/v1/contracts" });
  await app.register(softwareEntitlementAllocationsRoutes, { prefix: "/api/v1/software-entitlements" });
  await app.register(assetTransferRoutes, { prefix: "/api/v1/asset-transfer-requests" });
  await app.register(capaRoutes, { prefix: "/api/v1/capa" });
  await app.register(kpiRoutes, { prefix: "/api/v1/kpis" });
  await app.register(internalAuditRoutes, { prefix: "/api/v1/internal-audits"});
  await app.register(managementReviewRoutes, { prefix: "/api/v1/management-reviews" });
  

  await app.register(governanceScopeRoutes, {
    prefix: "/api/v1/governance/scope/versions",
  });
  await app.register(governanceContextRoutes, {
    prefix: "/api/v1/governance/context",
  });
  await app.register(governanceStakeholdersRoutes, {
  prefix: "/api/v1/governance/stakeholders",
  });



  return app;
}

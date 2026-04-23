import assert from "node:assert/strict";
import test from "node:test";

import { deleteContractSoftwareEntitlementService } from "./software-entitlements.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeEntitlementRow(overrides = {}) {
  return {
    id: 404,
    tenant_id: 14,
    contract_id: 52,
    software_product_id: 77,
    entitlement_code: "ENT-404",
    entitlement_name: "Wave 3 Entitlement",
    licensing_metric: "SUBSCRIPTION",
    quantity_purchased: 15,
    start_date: "2026-04-22",
    end_date: "2026-12-31",
    status: "ACTIVE",
    notes: "Wave 3 entitlement",
    created_at: "2026-04-22T00:00:00.000Z",
    updated_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeMockApp(state) {
  const queries = [];

  const client = {
    async query(sql, params) {
      const normalized = normalizeSql(sql);
      queries.push({ normalized, params });

      if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
        return { rows: [] };
      }

      if (
        normalized.startsWith(
          "select id, tenant_id, contract_id, software_product_id, entitlement_code, entitlement_name, licensing_metric, quantity_purchased, start_date, end_date, status, notes, created_at, updated_at from public.software_entitlements where tenant_id = $1 and contract_id = $2 and id = $3 for update limit 1"
        )
      ) {
        return { rows: state.entitlement ? [state.entitlement] : [] };
      }

      if (
        normalized.startsWith(
          "select count(1)::int as total from public.software_entitlement_allocations where tenant_id = $1 and software_entitlement_id = $2"
        )
      ) {
        return { rows: [{ total: state.softwareEntitlementAllocations.length }] };
      }

      if (
        normalized.startsWith(
          "lock table public.software_entitlement_allocations in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (normalized.startsWith("delete from public.software_entitlements")) {
        if (state.entitlement && state.entitlement.id === params[1]) {
          const deleted = state.entitlement;
          state.entitlement = null;
          return { rows: [deleted] };
        }
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in software entitlement delete test: ${sql}`);
    },
    release() {},
  };

  return {
    queries,
    app: {
      pg: {
        async connect() {
          return client;
        },
      },
    },
  };
}

function makeReq({
  roles,
  tenantId = 14,
  identityId = 44,
  contractId = 52,
  entitlementId = 404,
} = {}) {
  return {
    tenantId,
    params: {
      id: String(contractId),
      entitlementId: String(entitlementId),
    },
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteContractSoftwareEntitlementService deletes an unused entitlement", async () => {
  const state = {
    entitlement: makeEntitlementRow(),
    softwareEntitlementAllocations: [],
  };
  const { app, queries } = makeMockApp(state);

  const deleted = await deleteContractSoftwareEntitlementService(
    app,
    makeReq({ roles: ["PROCUREMENT_CONTRACT_MANAGER"] })
  );

  assert.equal(deleted.id, 404);
  assert.equal(state.entitlement, null);
  assert.ok(queries.some((entry) => entry.normalized === "begin"));
  assert.ok(queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    queries.some((entry) =>
      entry.normalized.startsWith(
        "lock table public.software_entitlement_allocations in share row exclusive mode"
      )
    )
  );
  assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

test("deleteContractSoftwareEntitlementService blocks entitlement when allocations exist", async () => {
  const state = {
    entitlement: makeEntitlementRow(),
    softwareEntitlementAllocations: [{ id: 1 }],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteContractSoftwareEntitlementService(app, makeReq({ roles: ["TENANT_ADMIN"] })),
    (error) => {
      assert.equal(error.code, "SOFTWARE_ENTITLEMENT_IN_USE");
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  assert.equal(state.entitlement.id, 404);
  assert.ok(queries.some((entry) => entry.normalized === "rollback"));
  assert.equal(
    queries.some((entry) => entry.normalized.startsWith("delete from public.software_entitlements")),
    false
  );
});

test("deleteContractSoftwareEntitlementService rejects non-manage roles", async () => {
  const state = {
    entitlement: makeEntitlementRow(),
    softwareEntitlementAllocations: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteContractSoftwareEntitlementService(app, makeReq({ roles: ["AUDITOR"] })),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(queries.length, 0);
});

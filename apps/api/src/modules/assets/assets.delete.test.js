import assert from "node:assert/strict";
import test from "node:test";

import { deleteAssetService } from "./assets.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeAssetRow(overrides = {}) {
  return {
    id: 91,
    tenant_id: 12,
    asset_tag: "AST-091",
    name: "Wave 3 Asset",
    asset_type_id: 7,
    current_state_id: 3,
    status: "ACTIVE",
    location_id: 21,
    owner_department_id: 31,
    current_custodian_identity_id: 41,
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
          "select a.id, a.tenant_id, a.asset_tag, a.name, a.asset_type_id, a.current_state_id, a.status, a.location_id, a.owner_department_id, a.current_custodian_identity_id from public.assets a where a.tenant_id = $1 and a.id = $2 for update limit 1"
        )
      ) {
        return { rows: state.asset ? [state.asset] : [] };
      }

      if (
        normalized.startsWith(
          "select (select count(*)::int from public.asset_ownership_history aoh where aoh.tenant_id = $1 and aoh.asset_id = $2) as asset_ownership_history_count"
        )
      ) {
        return {
          rows: [
            {
              asset_ownership_history_count: state.assetOwnershipHistory.length,
              asset_state_history_count: state.assetStateHistory.length,
              contract_assets_count: state.contractAssets.length,
              software_installations_count: state.softwareInstallations.length,
              asset_transfer_requests_count: state.assetTransferRequests.length,
              software_entitlement_allocations_count:
                state.softwareEntitlementAllocations.length,
              evidence_links_count: state.evidenceLinks.length,
            },
          ],
        };
      }

      if (
        normalized.startsWith(
          "lock table public.asset_ownership_history, public.asset_state_history, public.contract_assets, public.software_installations, public.asset_transfer_requests, public.software_entitlement_allocations, public.evidence_links in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (normalized.startsWith("delete from public.assets")) {
        if (state.asset && state.asset.id === params[1]) {
          const deleted = state.asset;
          state.asset = null;
          return { rows: [deleted] };
        }
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in assets delete test: ${sql}`);
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

function makeReq({ roles, tenantId = 12, identityId = 55 } = {}) {
  return {
    tenantId,
    actor: { type: "USER", id: identityId },
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteAssetService deletes an unused asset", async () => {
  const state = {
    asset: makeAssetRow(),
    assetOwnershipHistory: [],
    assetStateHistory: [],
    contractAssets: [],
    softwareInstallations: [],
    assetTransferRequests: [],
    softwareEntitlementAllocations: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  const deleted = await deleteAssetService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 91);

  assert.equal(deleted.id, 91);
  assert.equal(state.asset, null);
  assert.ok(queries.some((entry) => entry.normalized === "begin"));
  assert.ok(queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    queries.some((entry) =>
      entry.normalized.startsWith(
        "lock table public.asset_ownership_history, public.asset_state_history, public.contract_assets, public.software_installations, public.asset_transfer_requests, public.software_entitlement_allocations, public.evidence_links in share row exclusive mode"
      )
    )
  );
  assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

for (const [label, key] of [
  ["asset_ownership_history", "assetOwnershipHistory"],
  ["asset_state_history", "assetStateHistory"],
  ["contract_assets", "contractAssets"],
  ["software_installations", "softwareInstallations"],
  ["asset_transfer_requests", "assetTransferRequests"],
  ["software_entitlement_allocations", "softwareEntitlementAllocations"],
  ["evidence_links", "evidenceLinks"],
]) {
  test(`deleteAssetService blocks asset when ${label} exist`, async () => {
    const state = {
      asset: makeAssetRow(),
      assetOwnershipHistory: [],
      assetStateHistory: [],
      contractAssets: [],
      softwareInstallations: [],
      assetTransferRequests: [],
      softwareEntitlementAllocations: [],
      evidenceLinks: [],
    };
    state[key].push({ id: 1 });
    const { app, queries } = makeMockApp(state);

    await assert.rejects(
      deleteAssetService(app, makeReq({ roles: ["ITAM_MANAGER"] }), 91),
      (error) => {
        assert.equal(error.code, "ASSET_IN_USE");
        assert.equal(error.statusCode, 409);
        return true;
      }
    );

    assert.equal(state.asset.id, 91);
    assert.ok(queries.some((entry) => entry.normalized === "rollback"));
    assert.equal(
      queries.some((entry) => entry.normalized.startsWith("delete from public.assets")),
      false
    );
  });
}

test("deleteAssetService rejects non-manage roles", async () => {
  const state = {
    asset: makeAssetRow(),
    assetOwnershipHistory: [],
    assetStateHistory: [],
    contractAssets: [],
    softwareInstallations: [],
    assetTransferRequests: [],
    softwareEntitlementAllocations: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteAssetService(app, makeReq({ roles: ["AUDITOR"] }), 91),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(queries.length, 0);
});

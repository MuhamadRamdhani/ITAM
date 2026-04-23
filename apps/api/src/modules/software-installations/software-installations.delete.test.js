import assert from "node:assert/strict";
import test from "node:test";

import { deleteAssetSoftwareInstallationService } from "./software-installations.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeInstallationRow(overrides = {}) {
  return {
    id: 202,
    tenant_id: 13,
    asset_id: 99,
    software_product_id: 301,
    installation_status: "INSTALLED",
    installed_version: "1.0.0",
    installation_date: "2026-04-22",
    uninstalled_date: null,
    discovered_by: "MANUAL",
    discovery_source: "MANUAL",
    notes: "Wave 3 installation",
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
          "select id, tenant_id, asset_id, software_product_id, installation_status, installed_version, installation_date, uninstalled_date, discovered_by, discovery_source, notes, created_at, updated_at from public.software_installations where tenant_id = $1 and asset_id = $2 and id = $3 for update limit 1"
        )
      ) {
        return { rows: state.installation ? [state.installation] : [] };
      }

      if (
        normalized.startsWith(
          "select count(1)::int as total from public.software_assignments where tenant_id = $1 and software_installation_id = $2"
        )
      ) {
        return { rows: [{ total: state.softwareAssignments.length }] };
      }

      if (
        normalized.startsWith(
          "select count(1)::int as total from public.software_entitlement_allocations where tenant_id = $1 and software_installation_id = $2"
        )
      ) {
        return { rows: [{ total: state.softwareEntitlementAllocations.length }] };
      }

      if (
        normalized.startsWith(
          "lock table public.software_assignments, public.software_entitlement_allocations in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (normalized.startsWith("delete from public.software_installations")) {
        if (state.installation && state.installation.id === params[1]) {
          const deleted = state.installation;
          state.installation = null;
          return { rows: [deleted] };
        }
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in software installation delete test: ${sql}`);
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
  tenantId = 13,
  identityId = 44,
  assetId = 99,
  installationId = 202,
} = {}) {
  return {
    tenantId,
    params: {
      id: String(assetId),
      installationId: String(installationId),
    },
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteAssetSoftwareInstallationService deletes an unused installation", async () => {
  const state = {
    installation: makeInstallationRow(),
    softwareAssignments: [],
    softwareEntitlementAllocations: [],
  };
  const { app, queries } = makeMockApp(state);

  const deleted = await deleteAssetSoftwareInstallationService(
    app,
    makeReq({ roles: ["ITAM_MANAGER"] })
  );

  assert.equal(deleted.id, 202);
  assert.equal(state.installation, null);
  assert.ok(queries.some((entry) => entry.normalized === "begin"));
  assert.ok(queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    queries.some((entry) =>
      entry.normalized.startsWith(
        "lock table public.software_assignments, public.software_entitlement_allocations in share row exclusive mode"
      )
    )
  );
  assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

for (const [label, key] of [
  ["software_assignments", "softwareAssignments"],
  ["software_entitlement_allocations", "softwareEntitlementAllocations"],
]) {
  test(`deleteAssetSoftwareInstallationService blocks installation when ${label} exist`, async () => {
    const state = {
      installation: makeInstallationRow(),
      softwareAssignments: [],
      softwareEntitlementAllocations: [],
    };
    state[key].push({ id: 1 });
    const { app, queries } = makeMockApp(state);

    await assert.rejects(
      deleteAssetSoftwareInstallationService(app, makeReq({ roles: ["TENANT_ADMIN"] })),
      (error) => {
        assert.equal(error.code, "SOFTWARE_INSTALLATION_IN_USE");
        assert.equal(error.statusCode, 409);
        return true;
      }
    );

    assert.equal(state.installation.id, 202);
    assert.ok(queries.some((entry) => entry.normalized === "rollback"));
    assert.equal(
      queries.some((entry) => entry.normalized.startsWith("delete from public.software_installations")),
      false
    );
  });
}

test("deleteAssetSoftwareInstallationService rejects non-manage roles", async () => {
  const state = {
    installation: makeInstallationRow(),
    softwareAssignments: [],
    softwareEntitlementAllocations: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteAssetSoftwareInstallationService(app, makeReq({ roles: ["AUDITOR"] })),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(queries.length, 0);
});

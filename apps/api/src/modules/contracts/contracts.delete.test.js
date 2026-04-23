import assert from "node:assert/strict";
import test from "node:test";

import { deleteContractService } from "./contracts.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeContractRow(overrides = {}) {
  return {
    id: 44,
    tenant_id: 9,
    vendor_id: 71,
    contract_code: "CON-044",
    contract_name: "Wave 2 Draft Contract",
    contract_type: "SOFTWARE",
    status: "DRAFT",
    start_date: "2026-04-01",
    end_date: "2026-12-31",
    renewal_notice_days: 30,
    owner_identity_id: null,
    notes: null,
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
          "select id, tenant_id, vendor_id, contract_code, contract_name, contract_type, status, start_date, end_date, renewal_notice_days, owner_identity_id, notes, created_at, updated_at from public.contracts where tenant_id = $1 and id = $2 for update limit 1"
        )
      ) {
        return { rows: state.contract ? [state.contract] : [] };
      }

      if (
        normalized.startsWith(
          "select (select count(*)::int from public.contract_assets ca where ca.tenant_id = $1 and ca.contract_id = $2) as contract_assets_count, (select count(*)::int from public.contract_documents cd where cd.tenant_id = $1 and cd.contract_id = $2) as contract_documents_count, (select count(*)::int from public.software_entitlements se where se.tenant_id = $1 and se.contract_id = $2) as software_entitlements_count, (select count(*)::int from public.evidence_links el where el.tenant_id = $1 and el.target_type = 'contract' and el.target_id = $2) as evidence_links_count"
        )
      ) {
        return {
          rows: [
            {
              contract_assets_count: state.contractAssets.length,
              contract_documents_count: state.contractDocuments.length,
              software_entitlements_count: state.softwareEntitlements.length,
              evidence_links_count: state.evidenceLinks.length,
            },
          ],
        };
      }

      if (
        normalized.startsWith(
          "lock table public.contract_assets, public.contract_documents, public.evidence_links, public.software_entitlements in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (
        normalized.startsWith(
          "delete from public.contracts where tenant_id = $1 and id = $2 and status = 'draft' returning"
        )
      ) {
        if (state.deleteFailureMessage) {
          throw new Error(state.deleteFailureMessage);
        }

        if (
          state.contract &&
          state.contract.tenant_id === params[0] &&
          state.contract.id === params[1] &&
          String(state.contract.status).toUpperCase() === "DRAFT"
        ) {
          const deleted = state.contract;
          state.contract = null;
          return { rows: [deleted] };
        }

        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in contracts delete test: ${sql}`);
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

function makeReq({ roles, tenantId = 9, identityId = 77 } = {}) {
  return {
    tenantId,
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteContractService deletes a draft contract without dependencies", async () => {
  const state = {
    contract: makeContractRow(),
    contractAssets: [],
    contractDocuments: [],
    softwareEntitlements: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  const deleted = await deleteContractService(app, makeReq({ roles: ["PROCUREMENT_CONTRACT_MANAGER"] }), 44);

  assert.equal(deleted.id, 44);
  assert.equal(state.contract, null);
  assert.ok(queries.some((entry) => entry.normalized === "begin"));
  assert.ok(queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    queries.some((entry) =>
      entry.normalized.startsWith(
        "lock table public.contract_assets, public.contract_documents, public.evidence_links, public.software_entitlements in share row exclusive mode"
      )
    )
  );
  assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

for (const [label, key] of [
  ["contract_assets", "contractAssets"],
  ["contract_documents", "contractDocuments"],
  ["software_entitlements", "softwareEntitlements"],
  ["evidence_links", "evidenceLinks"],
]) {
  test(`deleteContractService blocks draft contract when ${label} exist`, async () => {
    const state = {
      contract: makeContractRow(),
      contractAssets: [],
      contractDocuments: [],
      softwareEntitlements: [],
      evidenceLinks: [],
    };
    state[key].push({ id: 1 });
    const { app, queries } = makeMockApp(state);

    await assert.rejects(
      deleteContractService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 44),
      (error) => {
        assert.equal(error.code, "CONTRACT_IN_USE");
        assert.equal(error.statusCode, 409);
        return true;
      }
    );

    assert.equal(state.contract.id, 44);
    assert.ok(queries.some((entry) => entry.normalized === "rollback"));
  });
}

test("deleteContractService rejects non-draft contracts", async () => {
  const state = {
    contract: makeContractRow({ status: "ACTIVE" }),
    contractAssets: [],
    contractDocuments: [],
    softwareEntitlements: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteContractService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 44),
    (error) => {
      assert.equal(error.code, "CONTRACT_NOT_DELETABLE");
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  assert.equal(state.contract.id, 44);
  assert.ok(queries.some((entry) => entry.normalized === "rollback"));
  assert.equal(
    queries.some((entry) => entry.normalized.startsWith("select (select count(*)::int from public.contract_assets")),
    false
  );
});

test("deleteContractService rejects non-manage roles", async () => {
  const state = {
    contract: makeContractRow(),
    contractAssets: [],
    contractDocuments: [],
    softwareEntitlements: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteContractService(app, makeReq({ roles: ["AUDITOR"] }), 44),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(queries.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import { deleteDocumentService } from "./documents.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeDocumentRow(overrides = {}) {
  return {
    id: 17,
    tenant_id: 5,
    doc_type_code: "POLICY",
    title: "Wave 2 Draft Policy",
    status_code: "DRAFT",
    current_version: 2,
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
          "select id, tenant_id, doc_type_code, title, status_code, current_version, created_at, updated_at from public.documents where tenant_id = $1 and id = $2 for update limit 1"
        )
      ) {
        return { rows: state.document ? [state.document] : [] };
      }

      if (
        normalized.startsWith(
          "select (select count(*)::int from public.contract_documents cd where cd.tenant_id = $1 and cd.document_id = $2) as contract_documents_count, (select count(*)::int from public.evidence_links el where el.tenant_id = $1 and el.target_type = 'document' and el.target_id = $2) as evidence_links_count"
        )
      ) {
        return {
          rows: [
            {
              contract_documents_count: state.contractDocuments.length,
              evidence_links_count: state.evidenceLinks.length,
            },
          ],
        };
      }

      if (
        normalized.startsWith(
          "lock table public.contract_documents, public.document_events, public.document_versions, public.evidence_links in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (normalized.startsWith("delete from public.document_versions")) {
        const before = state.versions.length;
        state.versions = state.versions.filter(
          (row) => !(row.tenant_id === params[0] && row.document_id === params[1])
        );
        return { rowCount: before - state.versions.length, rows: [] };
      }

      if (normalized.startsWith("delete from public.document_events")) {
        const before = state.events.length;
        state.events = state.events.filter(
          (row) => !(row.tenant_id === params[0] && row.document_id === params[1])
        );
        return { rowCount: before - state.events.length, rows: [] };
      }

      if (normalized.startsWith("delete from public.documents")) {
        if (state.deleteFailureMessage) {
          throw new Error(state.deleteFailureMessage);
        }

        if (
          state.document &&
          state.document.tenant_id === params[0] &&
          state.document.id === params[1]
        ) {
          const deleted = state.document;
          state.document = null;
          return { rows: [deleted] };
        }

        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in documents delete test: ${sql}`);
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

function makeReq({ roles, tenantId = 5, identityId = 88 } = {}) {
  return {
    tenantId,
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteDocumentService deletes a draft document and cleans child rows", async () => {
  const state = {
    document: makeDocumentRow(),
    versions: [
      { id: 1, tenant_id: 5, document_id: 17, version_no: 1 },
      { id: 2, tenant_id: 5, document_id: 17, version_no: 2 },
    ],
    events: [
      { id: 10, tenant_id: 5, document_id: 17, event_type: "CREATED" },
      { id: 11, tenant_id: 5, document_id: 17, event_type: "VERSION_ADDED" },
    ],
    contractDocuments: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  const out = await deleteDocumentService(app, makeReq({ roles: ["ITAM_MANAGER"] }), 17);

  assert.equal(out.ok, true);
  assert.equal(out.document.id, 17);
  assert.equal(state.document, null);
  assert.equal(state.versions.length, 0);
  assert.equal(state.events.length, 0);
  assert.ok(queries.some((entry) => entry.normalized === "begin"));
  assert.ok(queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    queries.some((entry) =>
      entry.normalized.startsWith(
        "lock table public.contract_documents, public.document_events, public.document_versions, public.evidence_links in share row exclusive mode"
      )
    )
  );
  assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

test("deleteDocumentService blocks draft document when contract_documents exist", async () => {
  const state = {
    document: makeDocumentRow(),
    versions: [{ id: 1, tenant_id: 5, document_id: 17, version_no: 1 }],
    events: [{ id: 10, tenant_id: 5, document_id: 17, event_type: "CREATED" }],
    contractDocuments: [{ id: 91, tenant_id: 5, document_id: 17, contract_id: 31 }],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  const out = await deleteDocumentService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 17);

  assert.equal(out.ok, false);
  assert.equal(out.code, "DOCUMENT_IN_USE");
  assert.equal(out.statusCode, 409);
  assert.equal(state.document.id, 17);
  assert.equal(state.versions.length, 1);
  assert.ok(queries.some((entry) => entry.normalized === "rollback"));
  assert.equal(
    queries.some((entry) => entry.normalized.startsWith("delete from public.document_versions")),
    false
  );
});

test("deleteDocumentService blocks draft document when evidence links exist", async () => {
  const state = {
    document: makeDocumentRow(),
    versions: [{ id: 1, tenant_id: 5, document_id: 17, version_no: 1 }],
    events: [{ id: 10, tenant_id: 5, document_id: 17, event_type: "CREATED" }],
    contractDocuments: [],
    evidenceLinks: [{ id: 71, tenant_id: 5, target_type: "DOCUMENT", target_id: 17 }],
  };
  const { app } = makeMockApp(state);

  const out = await deleteDocumentService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 17);

  assert.equal(out.ok, false);
  assert.equal(out.code, "DOCUMENT_IN_USE");
  assert.equal(out.statusCode, 409);
  assert.equal(state.document.id, 17);
  assert.equal(state.versions.length, 1);
});

test("deleteDocumentService rejects non-draft documents", async () => {
  const state = {
    document: makeDocumentRow({ status_code: "APPROVED" }),
    versions: [{ id: 1, tenant_id: 5, document_id: 17, version_no: 1 }],
    events: [{ id: 10, tenant_id: 5, document_id: 17, event_type: "CREATED" }],
    contractDocuments: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  const out = await deleteDocumentService(app, makeReq({ roles: ["TENANT_ADMIN"] }), 17);

  assert.equal(out.ok, false);
  assert.equal(out.code, "DOCUMENT_NOT_DELETABLE");
  assert.equal(out.statusCode, 409);
  assert.ok(queries.some((entry) => entry.normalized === "rollback"));
  assert.equal(
    queries.some((entry) => entry.normalized.startsWith("select (select count(*)::int from public.contract_documents")),
    false
  );
});

test("deleteDocumentService rejects non-manage roles", async () => {
  const state = {
    document: makeDocumentRow(),
    versions: [{ id: 1, tenant_id: 5, document_id: 17, version_no: 1 }],
    events: [{ id: 10, tenant_id: 5, document_id: 17, event_type: "CREATED" }],
    contractDocuments: [],
    evidenceLinks: [],
  };
  const { app, queries } = makeMockApp(state);

  await assert.rejects(
    deleteDocumentService(app, makeReq({ roles: ["AUDITOR"] }), 17),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(queries.length, 0);
});

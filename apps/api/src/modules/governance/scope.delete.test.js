import assert from "node:assert/strict";
import test from "node:test";

import { deleteScopeVersionService } from "./scope.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeScopeVersionRow(overrides = {}) {
  return {
    id: 63,
    tenant_id: 11,
    version_no: 4,
    status: "DRAFT",
    scope_json: { notes: "Wave 2 draft scope" },
    note: "Draft scope note",
    created_by_user_id: 21,
    updated_by_user_id: 21,
    submitted_at: null,
    approved_at: null,
    activated_at: null,
    superseded_at: null,
    created_at: "2026-04-22T00:00:00.000Z",
    updated_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeMockDb(state) {
  const queries = [];

  const queryHandler = async (sql, params) => {
      const normalized = normalizeSql(sql);
      queries.push({ normalized, params });

      if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
        return { rows: [] };
      }

      if (
        normalized.startsWith(
          "select id, tenant_id, version_no, status, scope_json, note, created_by_user_id, updated_by_user_id, submitted_at, approved_at, activated_at, superseded_at, created_at, updated_at from public.scope_versions where tenant_id = $1 and id = $2 for update limit 1"
        )
      ) {
        return { rows: state.version ? [state.version] : [] };
      }

      if (normalized.startsWith("insert into public.audit_events")) {
        return { rows: [] };
      }

      if (
        normalized.startsWith(
          "lock table public.scope_events in share row exclusive mode"
        )
      ) {
        return { rows: [] };
      }

      if (normalized.startsWith("delete from public.scope_events")) {
        const before = state.events.length;
        state.events = state.events.filter(
          (row) => !(row.tenant_id === params[0] && row.scope_version_id === params[1])
        );
        return { rowCount: before - state.events.length, rows: [] };
      }

      if (
        normalized.startsWith(
          "delete from public.scope_versions where tenant_id = $1 and id = $2 and status = 'draft' returning"
        )
      ) {
        if (
          state.version &&
          state.version.tenant_id === params[0] &&
          state.version.id === params[1] &&
          String(state.version.status).toUpperCase() === "DRAFT"
        ) {
          const deleted = state.version;
          state.version = null;
          return { rows: [deleted] };
        }

        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in scope delete test: ${sql}`);
    };

  const client = {
    query: queryHandler,
    release() {},
  };

  return {
    queries,
    async query(sql, params) {
      return queryHandler(sql, params);
    },
    async connect() {
      return client;
    },
  };
}

function makeReq({ roles, tenantId = 11, identityId = 55 } = {}) {
  return {
    tenantId,
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteScopeVersionService deletes draft scope version and its events", async () => {
  const state = {
    version: makeScopeVersionRow(),
    events: [
      { id: 1, tenant_id: 11, scope_version_id: 63, event_type: "SCOPE_VERSION_CREATED" },
      { id: 2, tenant_id: 11, scope_version_id: 63, event_type: "SCOPE_VERSION_NOTE_UPDATED" },
    ],
  };
  const db = makeMockDb(state);

  const deleted = await deleteScopeVersionService(db, makeReq({ roles: ["ITAM_MANAGER"] }), 63);

  assert.equal(deleted.id, 63);
  assert.equal(state.version, null);
  assert.equal(state.events.length, 0);
  assert.ok(db.queries.some((entry) => entry.normalized === "begin"));
  assert.ok(db.queries.some((entry) => entry.normalized === "commit"));
  assert.ok(
    db.queries.some((entry) =>
      entry.normalized.startsWith("lock table public.scope_events in share row exclusive mode")
    )
  );
  assert.ok(db.queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

test("deleteScopeVersionService rejects non-draft scope versions", async () => {
  const state = {
    version: makeScopeVersionRow({ status: "APPROVED" }),
    events: [{ id: 1, tenant_id: 11, scope_version_id: 63, event_type: "SCOPE_VERSION_CREATED" }],
  };
  const db = makeMockDb(state);

  await assert.rejects(
    deleteScopeVersionService(db, makeReq({ roles: ["SUPERADMIN"] }), 63),
    (error) => {
      assert.equal(error.code, "GOVERNANCE_SCOPE_NOT_DELETABLE");
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  assert.equal(state.version.id, 63);
  assert.equal(state.events.length, 1);
  assert.ok(db.queries.some((entry) => entry.normalized === "rollback"));
});

test("deleteScopeVersionService rejects non-manage roles", async () => {
  const state = {
    version: makeScopeVersionRow(),
    events: [],
  };
  const db = makeMockDb(state);

  await assert.rejects(
    deleteScopeVersionService(db, makeReq({ roles: ["AUDITOR"] }), 63),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(db.queries.length, 0);
});

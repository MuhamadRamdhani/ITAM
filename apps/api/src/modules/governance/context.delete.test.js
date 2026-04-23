import assert from "node:assert/strict";
import test from "node:test";

import { deleteContextRegisterService } from "./context.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeRow(overrides = {}) {
  return {
    id: 27,
    tenant_id: 4,
    title: "Cloud migration pressure",
    category_code: "EXTERNAL",
    priority_code: "HIGH",
    status_code: "OPEN",
    description: "Draft context note",
    owner_identity_id: 88,
    review_date: "2026-04-22",
    created_by_user_id: 11,
    updated_by_user_id: 11,
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
        "select id, tenant_id, title, category_code, priority_code, status_code, description, owner_identity_id, review_date, created_by_user_id, updated_by_user_id, created_at, updated_at from public.context_register where tenant_id = $1 and id = $2 for update limit 1"
      )
    ) {
      return { rows: state.row ? [state.row] : [] };
    }

    if (normalized.startsWith("insert into public.audit_events")) {
      return { rows: [] };
    }

    if (
      normalized.startsWith(
        "delete from public.context_register where tenant_id = $1 and id = $2 returning"
      )
    ) {
      if (state.row && state.row.id === params[1]) {
        const deleted = state.row;
        state.row = null;
        return { rows: [deleted] };
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in context delete test: ${sql}`);
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

function makeReq({ roles, tenantId = 4, identityId = 77 } = {}) {
  return {
    tenantId,
    requestContext: {
      tenantId,
      identityId,
      roles,
    },
  };
}

test("deleteContextRegisterService deletes a governance context row", async () => {
  const state = { row: makeRow() };
  const db = makeMockDb(state);

  const deleted = await deleteContextRegisterService(db, makeReq({ roles: ["ITAM_MANAGER"] }), 27);

  assert.equal(deleted.id, 27);
  assert.equal(state.row, null);
  assert.ok(db.queries.some((entry) => entry.normalized === "begin"));
  assert.ok(db.queries.some((entry) => entry.normalized === "commit"));
  assert.ok(db.queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
});

test("deleteContextRegisterService rejects non-manage roles", async () => {
  const state = { row: makeRow() };
  const db = makeMockDb(state);

  await assert.rejects(
    deleteContextRegisterService(db, makeReq({ roles: ["AUDITOR"] }), 27),
    (error) => {
      assert.equal(error.code, "FORBIDDEN");
      assert.equal(error.statusCode, 403);
      return true;
    }
  );

  assert.equal(db.queries.length, 0);
});

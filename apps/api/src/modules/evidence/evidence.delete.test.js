import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { deleteEvidenceFileService } from "./evidence.service.js";

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function makeFileRow(overrides = {}) {
  return {
    id: 41,
    tenant_id: 7,
    storage_path: `tenant-7/2026/04/${crypto.randomUUID()}.txt`,
    original_name: "evidence.txt",
    mime_type: "text/plain",
    size_bytes: 18,
    sha256: "abc123",
    uploaded_by_identity_id: 99,
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeMockApp(fileRow, options = {}) {
  const queries = [];

  return {
    queries,
    app: {
      pg: {
        async query(sql, params) {
          const normalized = normalizeSql(sql);
          queries.push({ normalized, params });

          if (
            normalized.startsWith(
              "select id, tenant_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by_identity_id, created_at from public.evidence_files"
            )
          ) {
            return { rows: [fileRow] };
          }

          if (
            normalized.startsWith(
              "select count(*)::int as total from public.evidence_links"
            )
          ) {
            return { rows: [{ total: 0 }] };
          }

          if (normalized.startsWith("insert into public.audit_events")) {
            return { rows: [] };
          }

          if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
            return { rows: [] };
          }

          if (normalized.startsWith("delete from public.evidence_files")) {
            if (options.deleteFailureMessage) {
              throw new Error(options.deleteFailureMessage);
            }

            return { rows: [fileRow] };
          }

          throw new Error(`Unexpected SQL in evidence delete test: ${sql}`);
        },
      },
    },
  };
}

async function withTempUploadsRoot(run) {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "itam-evidence-delete-"));
  process.chdir(tempRoot);

  try {
    return await run({
      tempRoot,
      uploadsRoot: path.join(tempRoot, "uploads"),
    });
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test("deleteEvidenceFileService stages and removes the stored file on success", { concurrency: false }, async () => {
  await withTempUploadsRoot(async ({ uploadsRoot }) => {
    const fileRow = makeFileRow();
    const originalPath = path.join(uploadsRoot, fileRow.storage_path);
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, "evidence payload", "utf8");

    const { app, queries } = makeMockApp(fileRow);
    const deleted = await deleteEvidenceFileService(app, {
      tenantId: fileRow.tenant_id,
      actorId: 123,
      fileId: fileRow.id,
    });

    assert.equal(deleted.id, fileRow.id);
    assert.equal(fs.existsSync(originalPath), false);
    assert.equal(fs.readdirSync(path.dirname(originalPath)).length, 0);
    assert.ok(queries.some((entry) => entry.normalized === "begin"));
    assert.ok(queries.some((entry) => entry.normalized === "commit"));
    assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
  });
});

test("deleteEvidenceFileService restores the file when DB delete fails", { concurrency: false }, async () => {
  await withTempUploadsRoot(async ({ uploadsRoot }) => {
    const fileRow = makeFileRow();
    const originalPath = path.join(uploadsRoot, fileRow.storage_path);
    fs.mkdirSync(path.dirname(originalPath), { recursive: true });
    fs.writeFileSync(originalPath, "evidence payload", "utf8");

    const { app, queries } = makeMockApp(fileRow, {
      deleteFailureMessage: "simulated db delete failure",
    });

    await assert.rejects(
      deleteEvidenceFileService(app, {
        tenantId: fileRow.tenant_id,
        actorId: 123,
        fileId: fileRow.id,
      }),
      (error) => {
        assert.equal(error.code, "EVIDENCE_FILE_DELETE_FAILED");
        assert.equal(error.statusCode, 500);
        return true;
      }
    );

    assert.equal(fs.existsSync(originalPath), true);
    assert.equal(
      fs.readdirSync(path.dirname(originalPath)).some((name) => name.includes(".deleting-")),
      false
    );
    assert.ok(queries.some((entry) => entry.normalized === "rollback"));
    assert.ok(queries.some((entry) => entry.normalized.startsWith("insert into public.audit_events")));
  });
});

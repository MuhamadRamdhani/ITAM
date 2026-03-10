import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

import { getUiConfig } from "../config/config.repo.js";
import { requireExistsById } from "../../lib/refIntegrity.js";
import {
  insertEvidenceFile,
  getEvidenceFileById,
  listEvidenceFiles,
  insertEvidenceLink,
  listEvidenceLinksByTarget,
} from "./evidence.repo.js";

function mustTargetTable(targetType) {
  const t = String(targetType || "").toUpperCase();
  if (t === "ASSET") return "assets";
  if (t === "DOCUMENT") return "documents";
  if (t === "APPROVAL") return "approvals";
  const e = new Error("Invalid target_type (must be ASSET|DOCUMENT|APPROVAL)");
  e.statusCode = 400;
  e.code = "BAD_REQUEST";
  throw e;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function resolvePageSizeStrict(app, tenantId, requested) {
  const cfg = await getUiConfig(app, tenantId);
  const options = Array.isArray(cfg.page_size_options) ? cfg.page_size_options : [];
  const def = Number(cfg.documents_page_size_default);

  if (requested == null) return def;

  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) {
    const e = new Error("Invalid page_size");
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { got: requested };
    throw e;
  }
  if (!options.includes(n)) {
    const e = new Error(`page_size must be one of: ${options.join(", ")}`);
    e.statusCode = 400;
    e.code = "INVALID_PAGE_SIZE";
    e.details = { allowed: options, got: n };
    throw e;
  }
  return n;
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || "file"));
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadEvidenceFileService(app, { tenantId, actorId, part }) {
  if (!part) {
    const e = new Error("Missing file");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const originalName = sanitizeFilename(part.filename);
  const ext = path.extname(originalName);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  const rand = crypto.randomUUID();
  const storagePath = `tenant-${tenantId}/${yyyy}/${mm}/${rand}${ext || ""}`;

  const uploadsRoot = path.join(process.cwd(), "uploads");
  const fullPath = path.join(uploadsRoot, storagePath);

  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

  const hash = crypto.createHash("sha256");
  let sizeBytes = 0;

  const tap = new Transform({
    transform(chunk, _enc, cb) {
      sizeBytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  await pipeline(part.file, tap, fs.createWriteStream(fullPath));

  const sha256 = hash.digest("hex");
  const mimeType = part.mimetype || "application/octet-stream";

  const row = await insertEvidenceFile(app, {
    tenant_id: tenantId,
    storage_path: storagePath,
    original_name: originalName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    sha256,
    uploaded_by_identity_id: actorId ?? null,
  });

  return row;
}

export async function getEvidenceFileService(app, { tenantId, fileId }) {
  return await getEvidenceFileById(app, tenantId, fileId);
}

export async function listEvidenceFilesService(app, { tenantId, q, page, pageSize }) {
  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const out = await listEvidenceFiles(app, tenantId, q ? String(q).trim() : null, p, ps);
  return { items: out.items, total: out.total, page: p, page_size: ps };
}

export async function attachEvidenceLinkService(app, { tenantId, actorId, body }) {
  const targetType = String(body.target_type || "").toUpperCase();
  const targetId = Number(body.target_id);
  const evidenceFileId = Number(body.evidence_file_id);

  if (!Number.isFinite(targetId) || targetId <= 0) {
    const e = new Error("Invalid target_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }
  if (!Number.isFinite(evidenceFileId) || evidenceFileId <= 0) {
    const e = new Error("Invalid evidence_file_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const targetTable = mustTargetTable(targetType);

  // validate existence (no FK)
  await requireExistsById(app, tenantId, targetTable, targetId);
  await requireExistsById(app, tenantId, "evidence_files", evidenceFileId);

  // config-driven limit (fallback 10)
  const uiCfg = await getUiConfig(app, tenantId);
  const maxPerTarget = toPositiveInt(uiCfg?.evidence_max_per_target, 10);

  const cntRes = await app.pg.query(
    `
    select count(*)::int as c
    from public.evidence_links
    where tenant_id = $1 and target_type = $2 and target_id = $3
    `,
    [tenantId, targetType, targetId]
  );

  const currentCount = Number(cntRes.rows?.[0]?.c ?? 0);
  if (currentCount >= maxPerTarget) {
    const e = new Error(`Max ${maxPerTarget} evidence files per target`);
    e.statusCode = 400;
    e.code = "EVIDENCE_LIMIT_REACHED";
    e.details = {
      max_files: maxPerTarget,
      current: currentCount,
      target_type: targetType,
      target_id: targetId,
    };
    throw e;
  }

  const link = await insertEvidenceLink(app, {
    tenant_id: tenantId,
    target_type: targetType,
    target_id: targetId,
    evidence_file_id: evidenceFileId,
    note: body.note ?? null,
    created_by_identity_id: actorId ?? null,
  });

  return link;
}

export async function listEvidenceLinksService(app, { tenantId, targetType, targetId, page, pageSize }) {
  const ps = await resolvePageSizeStrict(app, tenantId, pageSize);
  const p = Math.max(Number(page ?? 1), 1);

  const t = String(targetType || "").toUpperCase();
  const table = mustTargetTable(t);

  const tid = Number(targetId);
  if (!Number.isFinite(tid) || tid <= 0) {
    const e = new Error("Invalid target_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  // validate target exists
  await requireExistsById(app, tenantId, table, tid);

  const out = await listEvidenceLinksByTarget(app, tenantId, t, tid, p, ps);
  return { items: out.items, total: out.total, page: p, page_size: ps };
}
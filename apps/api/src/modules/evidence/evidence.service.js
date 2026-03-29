import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

import { getUiConfig } from "../config/config.repo.js";
import { requireExistsById } from "../../lib/refIntegrity.js";
import { insertAuditEvent } from "../../lib/audit.js";
import {
  insertEvidenceFile,
  getEvidenceFileById,
  listEvidenceFiles,
  insertEvidenceLink,
  listEvidenceLinksByTarget,
  deleteEvidenceLinkById,
} from "./evidence.repo.js";
import {
  validateFileUpload,
  detectFileTypeFromMagicBytes,
  checkFileSuspicious,
  isSafeFilePath,
} from "../../lib/uploadSecurity.js";

function mustTargetTable(targetType) {
  const t = String(targetType || "").toUpperCase();
  if (t === "ASSET") return "assets";
  if (t === "DOCUMENT") return "documents";
  if (t === "APPROVAL") return "approvals";
  if (t === "CONTRACT") return "contracts";

  const e = new Error("Invalid target_type (must be ASSET|DOCUMENT|APPROVAL|CONTRACT)");
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

function actorFromIdentityId(identityId) {
  if (Number.isFinite(identityId) && identityId > 0) return `IDENTITY:${identityId}`;
  return "SYSTEM";
}

export async function uploadEvidenceFileService(app, { tenantId, actorId, part }) {
  if (!part) {
    const e = new Error("Missing file");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const originalName = sanitizeFilename(part.filename);

  if (!originalName || originalName === "file") {
    const e = new Error("Invalid filename");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const ext = path.extname(originalName);
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");

  const rand = crypto.randomUUID();
  const storagePath = `tenant-${tenantId}/${yyyy}/${mm}/${rand}${ext || ""}`;

  const uploadsRoot = path.join(process.cwd(), "uploads");
  const fullPath = path.join(uploadsRoot, storagePath);

  if (!isSafeFilePath(uploadsRoot, fullPath)) {
    const e = new Error("Invalid file path (directory traversal detected)");
    e.statusCode = 400;
    e.code = "INVALID_FILE_PATH";
    throw e;
  }

  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

  const hash = crypto.createHash("sha256");
  let sizeBytes = 0;
  let firstChunk = null;

  const tap = new Transform({
    transform(chunk, _enc, cb) {
      sizeBytes += chunk.length;
      hash.update(chunk);

      if (firstChunk === null) {
        firstChunk = chunk;
      }

      cb(null, chunk);
    },
  });

  await pipeline(part.file, tap, fs.createWriteStream(fullPath));

  const sha256 = hash.digest("hex");
  const clientMimeType = part.mimetype || "application/octet-stream";
  const detectedMimeType = detectFileTypeFromMagicBytes(firstChunk);
  const actualMimeType = detectedMimeType || clientMimeType;

  const validation = validateFileUpload({
    filename: originalName,
    mimetype: clientMimeType,
    sizeBytes,
    detectedMimeType,
  });

  if (!validation.valid) {
    try {
      await fs.promises.unlink(fullPath);
    } catch {
      // ignore
    }

    const e = new Error(validation.error);
    e.statusCode = 400;
    e.code = validation.code;
    throw e;
  }

  const suspiciousCheck = checkFileSuspicious(firstChunk);
  if (suspiciousCheck.suspicious) {
    try {
      await fs.promises.unlink(fullPath);
    } catch {
      // ignore
    }

    const e = new Error(`File rejected: ${suspiciousCheck.reason}`);
    e.statusCode = 400;
    e.code = "SUSPICIOUS_FILE_CONTENT";
    throw e;
  }

  const row = await insertEvidenceFile(app, {
    tenant_id: tenantId,
    storage_path: storagePath,
    original_name: originalName,
    mime_type: actualMimeType,
    size_bytes: sizeBytes,
    sha256,
    uploaded_by_identity_id: actorId ?? null,
  });

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "EVIDENCE_FILE_UPLOADED",
    entityType: "EVIDENCE_FILE",
    entityId: row?.id ?? null,
    payload: {
      original_name: row?.original_name ?? originalName,
      mime_type: row?.mime_type ?? actualMimeType,
      size_bytes: row?.size_bytes ?? sizeBytes,
      sha256: row?.sha256 ?? sha256,
      mime_detected: detectedMimeType ? true : false,
    },
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

  await requireExistsById(app, tenantId, targetTable, targetId);
  await requireExistsById(app, tenantId, "evidence_files", evidenceFileId);

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

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "EVIDENCE_LINK_ATTACHED",
    entityType: "EVIDENCE_LINK",
    entityId: link?.id ?? null,
    payload: {
      target_type: targetType,
      target_id: targetId,
      evidence_file_id: evidenceFileId,
      note: body.note ?? null,
    },
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

  await requireExistsById(app, tenantId, table, tid);

  const out = await listEvidenceLinksByTarget(app, tenantId, t, tid, p, ps);
  return { items: out.items, total: out.total, page: p, page_size: ps };
}

export async function detachEvidenceLinkService(app, { tenantId, actorId, linkId, targetType, targetId }) {
  const lid = Number(linkId);
  if (!Number.isFinite(lid) || lid <= 0) {
    const e = new Error("Invalid link id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const t = String(targetType || "").toUpperCase();
  const table = mustTargetTable(t);

  const tid = Number(targetId);
  if (!Number.isFinite(tid) || tid <= 0) {
    const e = new Error("Invalid target_id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  await requireExistsById(app, tenantId, table, tid);

  const deleted = await deleteEvidenceLinkById(app, tenantId, lid, t, tid);
  if (!deleted) {
    const e = new Error("Evidence link not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "EVIDENCE_LINK_DETACHED",
    entityType: "EVIDENCE_LINK",
    entityId: deleted?.id ?? null,
    payload: {
      target_type: deleted?.target_type ?? t,
      target_id: deleted?.target_id ?? tid,
      evidence_file_id: deleted?.evidence_file_id ?? null,
    },
  });

  return deleted;
}
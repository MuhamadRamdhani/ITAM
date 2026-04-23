import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import sharp from "sharp";

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
  countEvidenceLinksByFileId,
  deleteEvidenceFileById,
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

const COMPRESSIBLE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_IMAGE_EDGE = 2560;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;

function safeUnlink(filePath) {
  return fs.promises.unlink(filePath).catch(() => {});
}

function getUploadsRoot() {
  return path.join(process.cwd(), "uploads");
}

function buildDeleteStagingPath(originalPath) {
  const dir = path.dirname(originalPath);
  const base = path.basename(originalPath);
  return path.join(dir, `${base}.deleting-${crypto.randomUUID()}`);
}

async function restoreFileFromStaging(stagedPath, originalPath) {
  try {
    await fs.promises.rename(stagedPath, originalPath);
    return;
  } catch {
    await fs.promises.copyFile(stagedPath, originalPath);
    await safeUnlink(stagedPath);
  }
}

function isCompressibleImageMimeType(mimeType) {
  return COMPRESSIBLE_IMAGE_MIME_TYPES.has(String(mimeType || "").toLowerCase());
}

async function compressEvidenceImage(inputPath, mimeType) {
  const image = sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (mimeType === "image/jpeg") {
    const { data, info } = await image
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, sizeBytes: info.size };
  }

  if (mimeType === "image/png") {
    const { data, info } = await image
      .png({
        compressionLevel: 9,
        palette: true,
        adaptiveFiltering: true,
      })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, sizeBytes: info.size };
  }

  if (mimeType === "image/webp") {
    const { data, info } = await image
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, sizeBytes: info.size };
  }

  return null;
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
  const tempStoragePath = `${storagePath}.uploading`;

  const uploadsRoot = path.join(process.cwd(), "uploads");
  const tempFullPath = path.join(uploadsRoot, tempStoragePath);
  const finalFullPath = path.join(uploadsRoot, storagePath);

  if (!isSafeFilePath(uploadsRoot, tempFullPath) || !isSafeFilePath(uploadsRoot, finalFullPath)) {
    const e = new Error("Invalid file path (directory traversal detected)");
    e.statusCode = 400;
    e.code = "INVALID_FILE_PATH";
    throw e;
  }

  await fs.promises.mkdir(path.dirname(tempFullPath), { recursive: true });

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

  await pipeline(part.file, tap, fs.createWriteStream(tempFullPath));

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
      await safeUnlink(tempFullPath);
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
      await safeUnlink(tempFullPath);
    } catch {
      // ignore
    }

    const e = new Error(`File rejected: ${suspiciousCheck.reason}`);
    e.statusCode = 400;
    e.code = "SUSPICIOUS_FILE_CONTENT";
    throw e;
  }

  let storedSizeBytes = sizeBytes;
  let storedSha256 = sha256;
  let compressionApplied = false;

  if (isCompressibleImageMimeType(actualMimeType)) {
    try {
      const compressed = await compressEvidenceImage(tempFullPath, actualMimeType);
      if (compressed && compressed.sizeBytes < sizeBytes) {
        await fs.promises.writeFile(finalFullPath, compressed.buffer);
        storedSizeBytes = compressed.sizeBytes;
        storedSha256 = crypto.createHash("sha256").update(compressed.buffer).digest("hex");
        compressionApplied = true;
      }
    } catch {
      // Compression is an optimization only; fall back to the original file.
      compressionApplied = false;
    }
  }

  if (!compressionApplied) {
    await fs.promises.rename(tempFullPath, finalFullPath);
  } else {
    await safeUnlink(tempFullPath);
  }

  const row = await insertEvidenceFile(app, {
    tenant_id: tenantId,
    storage_path: storagePath,
    original_name: originalName,
    mime_type: actualMimeType,
    size_bytes: storedSizeBytes,
    sha256: storedSha256,
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
      size_bytes: row?.size_bytes ?? storedSizeBytes,
      sha256: row?.sha256 ?? storedSha256,
      mime_detected: detectedMimeType ? true : false,
      compressed: compressionApplied,
      original_size_bytes: sizeBytes,
      stored_size_bytes: storedSizeBytes,
      compression_ratio: sizeBytes > 0 ? storedSizeBytes / sizeBytes : null,
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

  const duplicateRes = await app.pg.query(
    `
    select id
    from public.evidence_links
    where tenant_id = $1
      and target_type = $2
      and target_id = $3
      and evidence_file_id = $4
    limit 1
    `,
    [tenantId, targetType, targetId, evidenceFileId]
  );

  if (duplicateRes.rows?.[0]) {
    const e = new Error("Evidence already attached to this target");
    e.statusCode = 409;
    e.code = "DUPLICATE_RELATION";
    e.details = {
      target_type: targetType,
      target_id: targetId,
      evidence_file_id: evidenceFileId,
    };
    throw e;
  }

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

export async function deleteEvidenceFileService(app, { tenantId, actorId, fileId }) {
  const idNum = Number(fileId);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    const e = new Error("Invalid file id");
    e.statusCode = 400;
    e.code = "BAD_REQUEST";
    throw e;
  }

  const current = await getEvidenceFileById(app, tenantId, idNum);
  if (!current) {
    const e = new Error("Evidence file not found");
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }

  const linkedCount = await countEvidenceLinksByFileId(app, tenantId, idNum);
  if (linkedCount > 0) {
    const e = new Error("Evidence file is still attached to other records");
    e.statusCode = 409;
    e.code = "EVIDENCE_FILE_IN_USE";
    e.details = {
      linked_count: linkedCount,
    };
    throw e;
  }

  await insertAuditEvent(app, {
    tenantId,
    actor: actorFromIdentityId(actorId),
    action: "EVIDENCE_FILE_DELETED",
    entityType: "EVIDENCE_FILE",
    entityId: idNum,
    payload: {
      id: Number(current.id),
      tenant_id: Number(current.tenant_id),
      storage_path: current.storage_path,
      original_name: current.original_name,
      mime_type: current.mime_type,
      size_bytes: Number(current.size_bytes ?? 0),
      sha256: current.sha256 ?? null,
      uploaded_by_identity_id:
        current.uploaded_by_identity_id == null
          ? null
          : Number(current.uploaded_by_identity_id),
    },
  });

  const uploadsRoot = getUploadsRoot();
  const fullPath = path.join(uploadsRoot, current.storage_path);

  if (!isSafeFilePath(uploadsRoot, fullPath)) {
    const e = new Error("Invalid stored file path");
    e.statusCode = 400;
    e.code = "INVALID_FILE_PATH";
    throw e;
  }

  const stagedPath = buildDeleteStagingPath(fullPath);
  if (!isSafeFilePath(uploadsRoot, stagedPath)) {
    const e = new Error("Invalid staged file path");
    e.statusCode = 400;
    e.code = "INVALID_FILE_PATH";
    throw e;
  }

  try {
    await fs.promises.rename(fullPath, stagedPath);
  } catch (error) {
    const e = new Error("Failed to delete stored evidence file from disk");
    e.statusCode = 500;
    e.code = "EVIDENCE_FILE_DELETE_FAILED";
    e.details = {
      storage_path: current.storage_path,
      reason: error?.message || "stage_failed",
    };
    throw e;
  }

  await app.pg.query("BEGIN");
  try {
    const deleted = await deleteEvidenceFileById(app, tenantId, idNum);
    if (!deleted) {
      throw Object.assign(new Error("Evidence file not found"), {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    await app.pg.query("COMMIT");
    await safeUnlink(stagedPath);
    return deleted;
  } catch (error) {
    let rollbackError = null;
    try {
      await app.pg.query("ROLLBACK");
    } catch (err) {
      rollbackError = err;
    }

    try {
      await restoreFileFromStaging(stagedPath, fullPath);
    } catch (restoreError) {
      const e = new Error("Failed to restore stored evidence file after delete failure");
      e.statusCode = 500;
      e.code = "EVIDENCE_FILE_DELETE_FAILED";
      e.details = {
        storage_path: current.storage_path,
        reason: restoreError?.message || "restore_failed",
      };
      throw e;
    }

    if (error?.code === "NOT_FOUND" || error?.statusCode === 404) {
      throw error;
    }

    if (rollbackError) {
      const e = new Error("Failed to delete stored evidence file from database");
      e.statusCode = 500;
      e.code = "EVIDENCE_FILE_DELETE_FAILED";
      e.details = {
        storage_path: current.storage_path,
        reason: rollbackError?.message || "rollback_failed",
      };
      throw e;
    }

    const e = new Error("Failed to delete stored evidence file from database");
    e.statusCode = 500;
    e.code = "EVIDENCE_FILE_DELETE_FAILED";
    e.details = {
      storage_path: current.storage_path,
      reason: error?.message || "db_delete_failed",
    };
    throw e;
  }
}

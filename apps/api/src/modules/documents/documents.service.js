// itam/apps/api/src/modules/documents/documents.service.js

import {
  listDocuments,
  createDocumentTx,
  getDocumentBundle,
  addVersionTx,
  transitionStatusTx,
  archiveTx,
} from "./documents.repo.js";

const DOC_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"];

function normStatus(s) {
  return String(s ?? "").toUpperCase();
}

function normType(s) {
  return String(s ?? "").toUpperCase();
}

export async function listDocumentsService(app, { tenantId, q, status, type, page, pageSize }) {
  const st = status ? normStatus(status) : undefined;
  const tp = type ? normType(type) : undefined;

  if (st && !DOC_STATUSES.includes(st)) {
    return { total: 0, items: [] };
  }

  return listDocuments(app, { tenantId, q, status: st, type: tp, page, pageSize });
}

export async function createDocumentService(app, {
  tenantId,
  docTypeCode,
  title,
  contentJson,
  actorId,
}) {
  if (!title || !String(title).trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "title is required" };
  }
  if (!docTypeCode || !String(docTypeCode).trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "doc_type_code is required" };
  }

  try {
    const out = await createDocumentTx(app, {
      tenantId,
      docTypeCode: normType(docTypeCode),
      title: String(title).trim(),
      contentJson: contentJson ?? {},
      actorId: actorId ?? null,
    });
    return { ok: true, ...out };
  } catch (e) {
    // unique violation (tenant_id, doc_type_code, lower(title)) optional index
    if (e?.code === "23505") {
      return {
        ok: false,
        code: "DUPLICATE_DOCUMENT_TITLE",
        message: "Document dengan title & type yang sama sudah ada.",
      };
    }
    throw e;
  }
}

export async function getDocumentService(app, { tenantId, documentId }) {
  return getDocumentBundle(app, { tenantId, documentId });
}

export async function addDocumentVersionService(app, {
  tenantId,
  documentId,
  contentJson,
  actorId,
  note,
}) {
  try {
    const out = await addVersionTx(app, {
      tenantId,
      documentId,
      contentJson: contentJson ?? {},
      actorId: actorId ?? null,
      note: note ?? null,
    });

    if (!out.ok) {
      if (out.code === "NOT_FOUND") {
        return { ok: false, code: "NOT_FOUND", message: "Document not found" };
      }
      if (out.code === "INVALID_STATE") {
        return {
          ok: false,
          code: "INVALID_STATE",
          message: `Tidak bisa tambah version saat status = ${out.status}. (Allowed: DRAFT, IN_REVIEW)`,
        };
      }
      return { ok: false, code: "BAD_REQUEST", message: "Failed to add version" };
    }

    return { ok: true, version: out.version, version_no: out.version_no };
  } catch (e) {
    if (e?.code === "23505") {
      return { ok: false, code: "DUPLICATE_VERSION", message: "Version already exists" };
    }
    throw e;
  }
}

// Workflow transitions
export async function submitDocumentService(app, { tenantId, documentId, actorId, note }) {
  return transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "DRAFT",
    toStatus: "IN_REVIEW",
    eventType: "SUBMITTED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });
}

export async function approveDocumentService(app, { tenantId, documentId, actorId, note }) {
  return transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "IN_REVIEW",
    toStatus: "APPROVED",
    eventType: "APPROVED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });
}

export async function publishDocumentService(app, { tenantId, documentId, actorId, note }) {
  return transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "APPROVED",
    toStatus: "PUBLISHED",
    eventType: "PUBLISHED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });
}

export async function archiveDocumentService(app, { tenantId, documentId, actorId, note }) {
  return archiveTx(app, {
    tenantId,
    documentId,
    actorId: actorId ?? null,
    note: note ?? null,
  });
}
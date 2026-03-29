import {
  listDocuments,
  createDocumentTx,
  getDocumentBundle,
  addVersionTx,
  transitionStatusTx,
  archiveTx,
} from "./documents.repo.js";
import { insertAuditEvent } from "../../lib/audit.js";

const DOC_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"];

function normStatus(s) {
  return String(s ?? "").toUpperCase();
}

function normType(s) {
  return String(s ?? "").toUpperCase();
}

function actorFromIdentityId(identityId) {
  if (Number.isFinite(identityId) && identityId > 0) return `IDENTITY:${identityId}`;
  return "SYSTEM";
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

    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_CREATED",
      entityType: "DOCUMENT",
      entityId: out.document?.id ?? null,
      payload: {
        doc_type_code: out.document?.doc_type_code ?? null,
        title: out.document?.title ?? null,
        status_code: out.document?.status_code ?? null,
        version_no: out.document?.current_version ?? 1,
      },
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

    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_VERSION_ADDED",
      entityType: "DOCUMENT",
      entityId: documentId,
      payload: { version_no: out.version_no, note: note ?? null },
    });

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
  const out = await transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "DRAFT",
    toStatus: "IN_REVIEW",
    eventType: "SUBMITTED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });

  if (out?.ok) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_SUBMITTED",
      entityType: "DOCUMENT",
      entityId: documentId,
      payload: { from_status: "DRAFT", to_status: "IN_REVIEW", note: note ?? null },
    });
  }

  return out;
}

export async function approveDocumentService(app, { tenantId, documentId, actorId, note }) {
  const out = await transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "IN_REVIEW",
    toStatus: "APPROVED",
    eventType: "APPROVED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });

  if (out?.ok) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_APPROVED",
      entityType: "DOCUMENT",
      entityId: documentId,
      payload: { from_status: "IN_REVIEW", to_status: "APPROVED", note: note ?? null },
    });
  }

  return out;
}

export async function publishDocumentService(app, { tenantId, documentId, actorId, note }) {
  const out = await transitionStatusTx(app, {
    tenantId,
    documentId,
    fromStatus: "APPROVED",
    toStatus: "PUBLISHED",
    eventType: "PUBLISHED",
    actorId: actorId ?? null,
    note: note ?? null,
    payload: {},
  });

  if (out?.ok) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_PUBLISHED",
      entityType: "DOCUMENT",
      entityId: documentId,
      payload: { from_status: "APPROVED", to_status: "PUBLISHED", note: note ?? null },
    });
  }

  return out;
}

export async function archiveDocumentService(app, { tenantId, documentId, actorId, note }) {
  const out = await archiveTx(app, {
    tenantId,
    documentId,
    actorId: actorId ?? null,
    note: note ?? null,
  });

  if (out?.ok) {
    await insertAuditEvent(app, {
      tenantId,
      actor: actorFromIdentityId(actorId),
      action: "DOCUMENT_ARCHIVED",
      entityType: "DOCUMENT",
      entityId: documentId,
      payload: { note: note ?? null },
    });
  }

  return out;
}

import {
  listDocuments,
  createDocumentTx,
  getDocumentBundle,
  getDocumentByIdForDelete,
  addVersionTx,
  countDocumentDeleteDependencies,
  lockDocumentDeleteRelatedTables,
  deleteDocumentById,
  deleteDocumentEventsByDocumentId,
  deleteDocumentVersionsByDocumentId,
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

function mustTenantId(req) {
  const tenantId = req?.tenantId ?? req?.requestContext?.tenantId ?? null;
  if (!tenantId) {
    const e = new Error("Unauthorized tenant context");
    e.statusCode = 401;
    e.code = "AUTH_REQUIRED";
    throw e;
  }
  return Number(tenantId);
}

function mustHaveAnyRole(req, allowedRoles) {
  const raw = Array.isArray(req?.requestContext?.roles) ? req.requestContext.roles : [];
  const roles = raw
    .map((role) => {
      if (typeof role === "string") return role;
      if (role && typeof role === "object") {
        return role.code ?? role.role_code ?? role.roleCode ?? "";
      }
      return "";
    })
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  const ok = allowedRoles.some((role) => roles.includes(role));
  if (!ok) {
    const e = new Error("Forbidden");
    e.statusCode = 403;
    e.code = "FORBIDDEN";
    e.details = { required_any: allowedRoles, got: roles };
    throw e;
  }
}

function makeDeleteError(statusCode, code, message, details) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  e.details = details;
  return e;
}

async function withTransaction(app, fn) {
  const client = await app.pg.connect();

  try {
    await client.query("BEGIN");
    const result = await fn({ pg: client });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
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

export async function deleteDocumentService(app, req, documentId) {
  const tenantId = mustTenantId(req);
  mustHaveAnyRole(req, ["TENANT_ADMIN", "ITAM_MANAGER"]);

  const actorId = req?.requestContext?.identityId ?? null;

  try {
    const deleted = await withTransaction(app, async (tx) => {
      const current = await getDocumentByIdForDelete(tx, { tenantId, documentId });
      if (!current) {
        throw makeDeleteError(404, "NOT_FOUND", "Document not found");
      }

      const statusCode = String(current.status_code ?? "").toUpperCase();
      if (statusCode !== "DRAFT") {
        throw makeDeleteError(
          409,
          "DOCUMENT_NOT_DELETABLE",
          "Only DRAFT documents can be deleted",
          { status_code: current.status_code ?? null }
        );
      }

      await lockDocumentDeleteRelatedTables(tx);

      const dependencies = await countDocumentDeleteDependencies(tx, {
        tenantId,
        documentId,
      });

      if (dependencies.total > 0) {
        throw makeDeleteError(409, "DOCUMENT_IN_USE", "Document is still in use", dependencies);
      }

      await insertAuditEvent(tx, {
        tenantId,
        actor: actorFromIdentityId(actorId),
        action: "DOCUMENT_DELETED",
        entityType: "DOCUMENT",
        entityId: documentId,
        payload: {
          id: Number(current.id),
          tenant_id: Number(current.tenant_id),
          doc_type_code: current.doc_type_code ?? null,
          title: current.title ?? null,
          status_code: current.status_code ?? null,
          current_version: Number(current.current_version ?? 1),
        },
      });

      await deleteDocumentVersionsByDocumentId(tx, { tenantId, documentId });
      await deleteDocumentEventsByDocumentId(tx, { tenantId, documentId });

      const removed = await deleteDocumentById(tx, { tenantId, documentId });
      if (!removed) {
        throw makeDeleteError(404, "NOT_FOUND", "Document not found");
      }

      return removed;
    });

    return { ok: true, document: deleted };
  } catch (error) {
    if (
      error?.code === "DOCUMENT_NOT_DELETABLE" ||
      error?.code === "DOCUMENT_IN_USE" ||
      error?.code === "NOT_FOUND"
    ) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode ?? 409,
        details: error.details,
      };
    }

    throw error;
  }
}

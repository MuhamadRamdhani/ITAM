function toNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function mapDoc(row) {
  if (!row) return row;
  return {
    ...row,
    id: toNum(row.id),
    tenant_id: toNum(row.tenant_id),
    current_version: row.current_version == null ? 1 : Number(row.current_version),
  };
}

function mapVersion(row) {
  if (!row) return row;
  return {
    ...row,
    id: toNum(row.id),
    tenant_id: toNum(row.tenant_id),
    document_id: toNum(row.document_id),
    version_no: Number(row.version_no),
    created_by_identity_id:
      row.created_by_identity_id == null ? null : toNum(row.created_by_identity_id),
  };
}

function mapEvent(row) {
  if (!row) return row;
  return {
    ...row,
    id: toNum(row.id),
    tenant_id: toNum(row.tenant_id),
    document_id: toNum(row.document_id),
    actor_identity_id: row.actor_identity_id == null ? null : toNum(row.actor_identity_id),
  };
}

export async function listDocuments(app, { tenantId, q, status, type, page, pageSize }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  const where = ["d.tenant_id = $1"];
  const params = [tenantId];

  if (status) {
    params.push(status);
    where.push(`d.status_code = $${params.length}`);
  }

  if (type) {
    params.push(type);
    where.push(`d.doc_type_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(`(d.title ILIKE ${p} OR d.doc_type_code ILIKE ${p})`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalRes = await app.pg.query(
    `SELECT COUNT(*)::bigint AS total FROM documents d ${whereSql}`,
    params
  );
  const total = Number(totalRes.rows?.[0]?.total ?? 0);

  const res = await app.pg.query(
    `
    SELECT
      d.id, d.tenant_id,
      d.doc_type_code, d.title,
      d.status_code, d.current_version,
      d.created_at, d.updated_at
    FROM documents d
    ${whereSql}
    ORDER BY d.updated_at DESC, d.id DESC
    LIMIT ${safePageSize} OFFSET ${offset}
    `,
    params
  );

  return { total, items: res.rows.map(mapDoc) };
}

export async function createDocumentTx(app, {
  tenantId,
  docTypeCode,
  title,
  contentJson,
  actorId,
}) {
  await app.pg.query("BEGIN");
  try {
    const dRes = await app.pg.query(
      `
      INSERT INTO documents
        (tenant_id, doc_type_code, title, status_code, current_version)
      VALUES
        ($1, $2, $3, 'DRAFT', 1)
      RETURNING
        id, tenant_id, doc_type_code, title, status_code, current_version, created_at, updated_at
      `,
      [tenantId, docTypeCode, title]
    );

    const document = mapDoc(dRes.rows[0]);

    const vRes = await app.pg.query(
      `
      INSERT INTO document_versions
        (tenant_id, document_id, version_no, content_json, created_by_identity_id)
      VALUES
        ($1, $2, 1, $3, $4)
      RETURNING
        id, tenant_id, document_id, version_no, content_json, created_by_identity_id, created_at
      `,
      [tenantId, document.id, contentJson ?? {}, actorId ?? null]
    );
    const version = mapVersion(vRes.rows[0]);

    // events (append-only)
    await app.pg.query(
      `
      INSERT INTO document_events
        (tenant_id, document_id, event_type, actor_identity_id, note, event_payload)
      VALUES
        ($1, $2, 'CREATED', $3, $4, $5)
      `,
      [
        tenantId,
        document.id,
        actorId ?? null,
        null,
        {
          doc_type_code: document.doc_type_code,
          title: document.title,
          status_code: document.status_code,
          version_no: 1,
        },
      ]
    );

    await app.pg.query(
      `
      INSERT INTO document_events
        (tenant_id, document_id, event_type, actor_identity_id, note, event_payload)
      VALUES
        ($1, $2, 'VERSION_ADDED', $3, $4, $5)
      `,
      [
        tenantId,
        document.id,
        actorId ?? null,
        null,
        { version_no: 1 },
      ]
    );

    await app.pg.query("COMMIT");
    return { document, version };
  } catch (e) {
    await app.pg.query("ROLLBACK");
    throw e;
  }
}

export async function getDocumentBundle(app, { tenantId, documentId }) {
  const dRes = await app.pg.query(
    `
    SELECT
      id, tenant_id, doc_type_code, title, status_code, current_version, created_at, updated_at
    FROM documents
    WHERE tenant_id = $1 AND id = $2
    `,
    [tenantId, documentId]
  );
  const document = mapDoc(dRes.rows[0]);
  if (!document) return null;

  const latestRes = await app.pg.query(
    `
    SELECT
      id, tenant_id, document_id, version_no, content_json, created_by_identity_id, created_at
    FROM document_versions
    WHERE tenant_id = $1 AND document_id = $2 AND version_no = $3
    LIMIT 1
    `,
    [tenantId, documentId, document.current_version]
  );
  const latest_version = mapVersion(latestRes.rows[0] ?? null) || null;

  const vRes = await app.pg.query(
    `
    SELECT
      id, tenant_id, document_id, version_no, created_by_identity_id, created_at
    FROM document_versions
    WHERE tenant_id = $1 AND document_id = $2
    ORDER BY version_no DESC
    `,
    [tenantId, documentId]
  );
  const versions = vRes.rows.map(mapVersion);

  const eRes = await app.pg.query(
    `
    SELECT
      id, tenant_id, document_id, event_type, actor_identity_id, note, event_payload, created_at
    FROM document_events
    WHERE tenant_id = $1 AND document_id = $2
    ORDER BY created_at DESC
    `,
    [tenantId, documentId]
  );
  const events = eRes.rows.map(mapEvent);

  return { document, latest_version, versions, events };
}

export async function addVersionTx(app, {
  tenantId,
  documentId,
  contentJson,
  actorId,
  note,
}) {
  await app.pg.query("BEGIN");
  try {
    // lock doc row (avoid race)
    const dRes = await app.pg.query(
      `
      SELECT id, status_code, current_version
      FROM documents
      WHERE tenant_id = $1 AND id = $2
      FOR UPDATE
      `,
      [tenantId, documentId]
    );
    const doc = dRes.rows[0];
    if (!doc) {
      await app.pg.query("ROLLBACK");
      return { ok: false, code: "NOT_FOUND" };
    }

    const status = String(doc.status_code || "").toUpperCase();

    // MVP rule: version edit only allowed in DRAFT/IN_REVIEW
    if (!(status === "DRAFT" || status === "IN_REVIEW")) {
      await app.pg.query("ROLLBACK");
      return { ok: false, code: "INVALID_STATE", status };
    }

    const nextVer = Number(doc.current_version || 1) + 1;

    const vRes = await app.pg.query(
      `
      INSERT INTO document_versions
        (tenant_id, document_id, version_no, content_json, created_by_identity_id)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING
        id, tenant_id, document_id, version_no, content_json, created_by_identity_id, created_at
      `,
      [tenantId, documentId, nextVer, contentJson ?? {}, actorId ?? null]
    );
    const version = mapVersion(vRes.rows[0]);

    await app.pg.query(
      `
      UPDATE documents
      SET current_version = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, documentId, nextVer]
    );

    await app.pg.query(
      `
      INSERT INTO document_events
        (tenant_id, document_id, event_type, actor_identity_id, note, event_payload)
      VALUES
        ($1, $2, 'VERSION_ADDED', $3, $4, $5)
      `,
      [
        tenantId,
        documentId,
        actorId ?? null,
        note ?? null,
        { version_no: nextVer },
      ]
    );

    await app.pg.query("COMMIT");
    return { ok: true, version_no: nextVer, version };
  } catch (e) {
    await app.pg.query("ROLLBACK");
    throw e;
  }
}

export async function transitionStatusTx(app, {
  tenantId,
  documentId,
  fromStatus,
  toStatus,
  eventType,
  actorId,
  note,
  payload,
}) {
  await app.pg.query("BEGIN");
  try {
    const res = await app.pg.query(
      `
      UPDATE documents
      SET status_code = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status_code = $3
      RETURNING id, tenant_id, doc_type_code, title, status_code, current_version, created_at, updated_at
      `,
      [tenantId, documentId, fromStatus, toStatus]
    );

    const document = mapDoc(res.rows[0] ?? null);
    if (!document) {
      await app.pg.query("ROLLBACK");
      return { ok: false, code: "INVALID_STATE" };
    }

    await app.pg.query(
      `
      INSERT INTO document_events
        (tenant_id, document_id, event_type, actor_identity_id, note, event_payload)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      `,
      [tenantId, documentId, eventType, actorId ?? null, note ?? null, payload ?? {}]
    );

    await app.pg.query("COMMIT");
    return { ok: true, document };
  } catch (e) {
    await app.pg.query("ROLLBACK");
    throw e;
  }
}

export async function archiveTx(app, { tenantId, documentId, actorId, note }) {
  await app.pg.query("BEGIN");
  try {
    const res = await app.pg.query(
      `
      UPDATE documents
      SET status_code = 'ARCHIVED', updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status_code <> 'ARCHIVED'
      RETURNING id, tenant_id, doc_type_code, title, status_code, current_version, created_at, updated_at
      `,
      [tenantId, documentId]
    );

    const document = mapDoc(res.rows[0] ?? null);
    if (!document) {
      await app.pg.query("ROLLBACK");
      return { ok: false, code: "NOT_FOUND_OR_ALREADY_ARCHIVED" };
    }

    await app.pg.query(
      `
      INSERT INTO document_events
        (tenant_id, document_id, event_type, actor_identity_id, note, event_payload)
      VALUES
        ($1, $2, 'ARCHIVED', $3, $4, $5)
      `,
      [tenantId, documentId, actorId ?? null, note ?? null, {}]
    );

    await app.pg.query("COMMIT");
    return { ok: true, document };
  } catch (e) {
    await app.pg.query("ROLLBACK");
    throw e;
  }
}
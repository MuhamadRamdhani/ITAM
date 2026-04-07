function ensureDb(db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('DB adapter is not available. Expected fastify.db.query(...) or fastify.pg.query(...).');
  }
  return db;
}

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    tenant_id: Number(row.tenant_id),
    capa_code: row.capa_code,
    title: row.title,
    source_type: row.source_type,
    source_id: row.source_id == null ? null : Number(row.source_id),
    source_label: row.source_label ?? null,
    severity: row.severity,
    status: row.status,
    owner_identity_id: row.owner_identity_id == null ? null : Number(row.owner_identity_id),
    owner_identity_name: row.owner_identity_name ?? null,
    owner_identity_email: row.owner_identity_email ?? null,
    due_date: row.due_date ?? null,
    nonconformity_summary: row.nonconformity_summary ?? null,
    root_cause_summary: row.root_cause_summary ?? null,
    corrective_action_summary: row.corrective_action_summary ?? null,
    preventive_action_summary: row.preventive_action_summary ?? null,
    verification_summary: row.verification_summary ?? null,
    closure_notes: row.closure_notes ?? null,
    notes: row.notes ?? null,
    opened_at: row.opened_at ?? null,
    root_caused_at: row.root_caused_at ?? null,
    corrective_action_at: row.corrective_action_at ?? null,
    preventive_action_at: row.preventive_action_at ?? null,
    verified_at: row.verified_at ?? null,
    closed_at: row.closed_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    created_by: row.created_by == null ? null : Number(row.created_by),
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_overdue: Boolean(row.is_overdue),
  };
}

export function buildCapaRepo({ db }) {
  const conn = ensureDb(db);

  async function listCases({
    tenantId,
    q,
    status,
    sourceType,
    severity,
    ownerIdentityId,
    overdueOnly,
    limit,
    offset,
  }) {
    const values = [tenantId];
    let idx = 2;
    let where = `WHERE c.tenant_id = $1`;

    if (q) {
      where += ` AND (
        c.capa_code ILIKE $${idx}
        OR c.title ILIKE $${idx}
        OR COALESCE(c.source_label, '') ILIKE $${idx}
        OR COALESCE(c.nonconformity_summary, '') ILIKE $${idx}
      )`;
      values.push(`%${q}%`);
      idx += 1;
    }

    if (status && status !== 'ALL') {
      where += ` AND c.status = $${idx}`;
      values.push(status);
      idx += 1;
    }

    if (sourceType && sourceType !== 'ALL') {
      where += ` AND c.source_type = $${idx}`;
      values.push(sourceType);
      idx += 1;
    }

    if (severity && severity !== 'ALL') {
      where += ` AND c.severity = $${idx}`;
      values.push(severity);
      idx += 1;
    }

    if (ownerIdentityId) {
      where += ` AND c.owner_identity_id = $${idx}`;
      values.push(ownerIdentityId);
      idx += 1;
    }

    if (overdueOnly) {
      where += ` AND c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE`;
    }

    values.push(limit);
    const limitIndex = idx;
    idx += 1;

    values.push(offset);
    const offsetIndex = idx;

    const sql = `
      SELECT
        c.*,
        oi.name AS owner_identity_name,
        oi.email AS owner_identity_email,
        CASE
          WHEN c.status NOT IN ('CLOSED', 'CANCELLED')
           AND c.due_date IS NOT NULL
           AND c.due_date < CURRENT_DATE
          THEN TRUE
          ELSE FALSE
        END AS is_overdue
      FROM capa_cases c
      LEFT JOIN identities oi
        ON oi.tenant_id = c.tenant_id
       AND oi.id = c.owner_identity_id
      ${where}
      ORDER BY
        CASE c.status
          WHEN 'OPEN' THEN 1
          WHEN 'ROOT_CAUSE' THEN 2
          WHEN 'CORRECTIVE_ACTION' THEN 3
          WHEN 'PREVENTIVE_ACTION' THEN 4
          WHEN 'VERIFICATION' THEN 5
          WHEN 'CLOSED' THEN 6
          ELSE 7
        END,
        CASE c.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        c.due_date ASC NULLS LAST,
        c.created_at DESC,
        c.id DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `;

    const result = await conn.query(sql, values);
    return result.rows.map(normalizeRow);
  }

  async function countCases({
    tenantId,
    q,
    status,
    sourceType,
    severity,
    ownerIdentityId,
    overdueOnly,
  }) {
    const values = [tenantId];
    let idx = 2;
    let where = `WHERE c.tenant_id = $1`;

    if (q) {
      where += ` AND (
        c.capa_code ILIKE $${idx}
        OR c.title ILIKE $${idx}
        OR COALESCE(c.source_label, '') ILIKE $${idx}
        OR COALESCE(c.nonconformity_summary, '') ILIKE $${idx}
      )`;
      values.push(`%${q}%`);
      idx += 1;
    }

    if (status && status !== 'ALL') {
      where += ` AND c.status = $${idx}`;
      values.push(status);
      idx += 1;
    }

    if (sourceType && sourceType !== 'ALL') {
      where += ` AND c.source_type = $${idx}`;
      values.push(sourceType);
      idx += 1;
    }

    if (severity && severity !== 'ALL') {
      where += ` AND c.severity = $${idx}`;
      values.push(severity);
      idx += 1;
    }

    if (ownerIdentityId) {
      where += ` AND c.owner_identity_id = $${idx}`;
      values.push(ownerIdentityId);
      idx += 1;
    }

    if (overdueOnly) {
      where += ` AND c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE`;
    }

    const sql = `
      SELECT COUNT(*)::int AS total_items
      FROM capa_cases c
      ${where}
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.total_items ?? 0;
  }

  async function countSummary({
    tenantId,
    q,
    status,
    sourceType,
    severity,
    ownerIdentityId,
    overdueOnly,
  }) {
    const values = [tenantId];
    let idx = 2;
    let where = `WHERE c.tenant_id = $1`;

    if (q) {
      where += ` AND (
        c.capa_code ILIKE $${idx}
        OR c.title ILIKE $${idx}
        OR COALESCE(c.source_label, '') ILIKE $${idx}
        OR COALESCE(c.nonconformity_summary, '') ILIKE $${idx}
      )`;
      values.push(`%${q}%`);
      idx += 1;
    }

    if (status && status !== 'ALL') {
      where += ` AND c.status = $${idx}`;
      values.push(status);
      idx += 1;
    }

    if (sourceType && sourceType !== 'ALL') {
      where += ` AND c.source_type = $${idx}`;
      values.push(sourceType);
      idx += 1;
    }

    if (severity && severity !== 'ALL') {
      where += ` AND c.severity = $${idx}`;
      values.push(severity);
      idx += 1;
    }

    if (ownerIdentityId) {
      where += ` AND c.owner_identity_id = $${idx}`;
      values.push(ownerIdentityId);
      idx += 1;
    }

    if (overdueOnly) {
      where += ` AND c.status NOT IN ('CLOSED', 'CANCELLED') AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE`;
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total_items,
        COUNT(*) FILTER (WHERE c.status = 'OPEN')::int AS open_count,
        COUNT(*) FILTER (WHERE c.status = 'ROOT_CAUSE')::int AS root_cause_count,
        COUNT(*) FILTER (WHERE c.status = 'CORRECTIVE_ACTION')::int AS corrective_action_count,
        COUNT(*) FILTER (WHERE c.status = 'PREVENTIVE_ACTION')::int AS preventive_action_count,
        COUNT(*) FILTER (WHERE c.status = 'VERIFICATION')::int AS verification_count,
        COUNT(*) FILTER (WHERE c.status = 'CLOSED')::int AS closed_count,
        COUNT(*) FILTER (WHERE c.status = 'CANCELLED')::int AS cancelled_count,
        COUNT(*) FILTER (
          WHERE c.status NOT IN ('CLOSED', 'CANCELLED')
            AND c.due_date IS NOT NULL
            AND c.due_date < CURRENT_DATE
        )::int AS overdue_count
      FROM capa_cases c
      ${where}
    `;

    const result = await conn.query(sql, values);
    return result.rows[0] ?? {};
  }

  async function findCaseById({ tenantId, id }) {
    const sql = `
      SELECT
        c.*,
        oi.name AS owner_identity_name,
        oi.email AS owner_identity_email,
        CASE
          WHEN c.status NOT IN ('CLOSED', 'CANCELLED')
           AND c.due_date IS NOT NULL
           AND c.due_date < CURRENT_DATE
          THEN TRUE
          ELSE FALSE
        END AS is_overdue
      FROM capa_cases c
      LEFT JOIN identities oi
        ON oi.tenant_id = c.tenant_id
       AND oi.id = c.owner_identity_id
      WHERE c.tenant_id = $1
        AND c.id = $2
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, id]);
    return normalizeRow(result.rows[0] ?? null);
  }

  async function findIdentityById({ tenantId, id }) {
    const sql = `
      SELECT *
      FROM identities
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, id]);
    return result.rows[0] ?? null;
  }

  async function insertCase({
    tenantId,
    capaCode,
    title,
    sourceType,
    sourceId,
    sourceLabel,
    severity,
    ownerIdentityId,
    dueDate,
    nonconformitySummary,
    notes,
    userId,
  }) {
    const sql = `
      INSERT INTO capa_cases (
        tenant_id,
        capa_code,
        title,
        source_type,
        source_id,
        source_label,
        severity,
        status,
        owner_identity_id,
        due_date,
        nonconformity_summary,
        notes,
        opened_at,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, $10, $11, NOW(), $12, $12
      )
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      capaCode,
      title,
      sourceType,
      sourceId,
      sourceLabel,
      severity,
      ownerIdentityId,
      dueDate,
      nonconformitySummary,
      notes,
      userId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updateCase({ tenantId, id, patch, userId }) {
    const fieldMap = {
      capa_code: 'capa_code',
      title: 'title',
      source_type: 'source_type',
      source_id: 'source_id',
      source_label: 'source_label',
      severity: 'severity',
      owner_identity_id: 'owner_identity_id',
      due_date: 'due_date',
      nonconformity_summary: 'nonconformity_summary',
      notes: 'notes',
      status: 'status',
      root_cause_summary: 'root_cause_summary',
      corrective_action_summary: 'corrective_action_summary',
      preventive_action_summary: 'preventive_action_summary',
      verification_summary: 'verification_summary',
      closure_notes: 'closure_notes',
      opened_at: 'opened_at',
      root_caused_at: 'root_caused_at',
      corrective_action_at: 'corrective_action_at',
      preventive_action_at: 'preventive_action_at',
      verified_at: 'verified_at',
      closed_at: 'closed_at',
      cancelled_at: 'cancelled_at',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
    }

    sets.push(`updated_at = NOW()`);
    sets.push(`updated_by = $${idx}`);
    values.push(userId);
    idx += 1;

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(id);
    const idIndex = idx;

    const sql = `
      UPDATE capa_cases
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND id = $${idIndex}
      RETURNING id
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.id ?? null;
  }

  async function touchCase({
    tenantId,
    id,
    patch,
    userId,
  }) {
    return updateCase({ tenantId, id, patch, userId });
  }

  return {
    listCases,
    countCases,
    countSummary,
    findCaseById,
    findIdentityById,
    insertCase,
    updateCase,
    touchCase,
  };
}

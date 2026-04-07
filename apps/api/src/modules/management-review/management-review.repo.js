function toNumberOrNull(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateOnly(value) {
  if (value == null) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function mapSessionRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toNumberOrNull(row.id),
    tenant_id: toNumberOrNull(row.tenant_id),
    chairperson_identity_id: toNumberOrNull(row.chairperson_identity_id),
    created_by: toNumberOrNull(row.created_by),
    updated_by: toNumberOrNull(row.updated_by),
    review_date: formatDateOnly(row.review_date),
    decision_count: Number(row.decision_count ?? 0),
    action_item_count: Number(row.action_item_count ?? 0),
    open_action_item_count: Number(row.open_action_item_count ?? 0),
    done_action_item_count: Number(row.done_action_item_count ?? 0),
    cancelled_action_item_count: Number(row.cancelled_action_item_count ?? 0),
    overdue_action_item_count: Number(row.overdue_action_item_count ?? 0),
  };
}

function mapDecisionRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toNumberOrNull(row.id),
    tenant_id: toNumberOrNull(row.tenant_id),
    session_id: toNumberOrNull(row.session_id),
    owner_identity_id: toNumberOrNull(row.owner_identity_id),
    target_date: formatDateOnly(row.target_date),
    sort_order: Number(row.sort_order ?? 0),
    created_by: toNumberOrNull(row.created_by),
    updated_by: toNumberOrNull(row.updated_by),
  };
}

function mapActionItemRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: toNumberOrNull(row.id),
    tenant_id: toNumberOrNull(row.tenant_id),
    session_id: toNumberOrNull(row.session_id),
    decision_id: toNumberOrNull(row.decision_id),
    owner_identity_id: toNumberOrNull(row.owner_identity_id),
    due_date: formatDateOnly(row.due_date),
    session_review_date: formatDateOnly(row.session_review_date),
    sort_order: Number(row.sort_order ?? 0),
    created_by: toNumberOrNull(row.created_by),
    updated_by: toNumberOrNull(row.updated_by),
    is_overdue: Boolean(row.is_overdue),
  };
}

function buildSessionWhereClause({ tenantId, search, status }) {
  const params = [tenantId];
  const conditions = ['s.tenant_id = $1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(s.session_code ILIKE $${params.length} OR s.title ILIKE $${params.length})`);
  }

  if (status) {
    params.push(status);
    conditions.push(`s.status = $${params.length}`);
  }

  return {
    params,
    whereSql: `WHERE ${conditions.join(' AND ')}`,
  };
}

function buildActionTrackerWhereClause({
  tenantId,
  search,
  status,
  ownerIdentityId,
  overdueOnly,
  sessionId,
}) {
  const params = [tenantId];
  const conditions = ['a.tenant_id = $1'];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(a.title ILIKE $${params.length} OR COALESCE(a.description, '') ILIKE $${params.length})`);
  }

  if (status) {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (ownerIdentityId) {
    params.push(ownerIdentityId);
    conditions.push(`a.owner_identity_id = $${params.length}`);
  }

  if (sessionId) {
    params.push(sessionId);
    conditions.push(`a.session_id = $${params.length}`);
  }

  if (overdueOnly) {
    conditions.push(`a.status NOT IN ('DONE', 'CANCELLED') AND a.due_date < CURRENT_DATE`);
  }

  return {
    params,
    whereSql: `WHERE ${conditions.join(' AND ')}`,
  };
}

const sessionSummaryJoinSql = `
  LEFT JOIN (
    SELECT
      d.tenant_id,
      d.session_id,
      COUNT(*)::int AS decision_count
    FROM management_review_decisions d
    WHERE d.tenant_id = $1
    GROUP BY d.tenant_id, d.session_id
  ) dsum ON dsum.tenant_id = s.tenant_id AND dsum.session_id = s.id
  LEFT JOIN (
    SELECT
      a.tenant_id,
      a.session_id,
      COUNT(*)::int AS action_item_count,
      COUNT(*) FILTER (WHERE a.status = 'OPEN')::int AS open_action_item_count,
      COUNT(*) FILTER (WHERE a.status = 'DONE')::int AS done_action_item_count,
      COUNT(*) FILTER (WHERE a.status = 'CANCELLED')::int AS cancelled_action_item_count,
      COUNT(*) FILTER (
        WHERE a.status NOT IN ('DONE', 'CANCELLED')
          AND a.due_date < CURRENT_DATE
      )::int AS overdue_action_item_count
    FROM management_review_action_items a
    WHERE a.tenant_id = $1
    GROUP BY a.tenant_id, a.session_id
  ) asum ON asum.tenant_id = s.tenant_id AND asum.session_id = s.id
`;

export async function countManagementReviewSessions(db, filters) {
  const { params, whereSql } = buildSessionWhereClause(filters);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM management_review_sessions s ${whereSql}`,
    params,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listManagementReviewSessions(db, filters) {
  const { params, whereSql } = buildSessionWhereClause(filters);
  const limitIndex = params.push(filters.limit ?? 25);
  const offsetIndex = params.push(filters.offset ?? 0);

  const sql = `
    SELECT
      s.*,
      COALESCE(dsum.decision_count, 0) AS decision_count,
      COALESCE(asum.action_item_count, 0) AS action_item_count,
      COALESCE(asum.open_action_item_count, 0) AS open_action_item_count,
      COALESCE(asum.done_action_item_count, 0) AS done_action_item_count,
      COALESCE(asum.cancelled_action_item_count, 0) AS cancelled_action_item_count,
      COALESCE(asum.overdue_action_item_count, 0) AS overdue_action_item_count
    FROM management_review_sessions s
    ${sessionSummaryJoinSql}
    ${whereSql}
    ORDER BY s.review_date DESC, s.id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const { rows } = await db.query(sql, params);
  return rows.map(mapSessionRow);
}

export async function findManagementReviewSessionById(db, { tenantId, sessionId }) {
  const sql = `
    SELECT
      s.*,
      COALESCE(dsum.decision_count, 0) AS decision_count,
      COALESCE(asum.action_item_count, 0) AS action_item_count,
      COALESCE(asum.open_action_item_count, 0) AS open_action_item_count,
      COALESCE(asum.done_action_item_count, 0) AS done_action_item_count,
      COALESCE(asum.cancelled_action_item_count, 0) AS cancelled_action_item_count,
      COALESCE(asum.overdue_action_item_count, 0) AS overdue_action_item_count
    FROM management_review_sessions s
    ${sessionSummaryJoinSql}
    WHERE s.tenant_id = $1
      AND s.id = $2
    LIMIT 1
  `;

  const { rows } = await db.query(sql, [tenantId, sessionId]);
  return mapSessionRow(rows[0] ?? null);
}

export async function insertManagementReviewSession(db, payload) {
  const sql = `
    INSERT INTO management_review_sessions (
      tenant_id,
      session_code,
      title,
      review_date,
      status,
      chairperson_identity_id,
      summary,
      minutes,
      notes,
      created_by,
      updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.session_code,
    payload.title,
    payload.review_date,
    payload.status,
    payload.chairperson_identity_id,
    payload.summary,
    payload.minutes,
    payload.notes,
    payload.created_by,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapSessionRow(rows[0]);
}

export async function updateManagementReviewSession(db, payload) {
  const sql = `
    UPDATE management_review_sessions
    SET
      session_code = $3,
      title = $4,
      review_date = $5,
      chairperson_identity_id = $6,
      summary = $7,
      minutes = $8,
      notes = $9,
      updated_by = $10,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.id,
    payload.session_code,
    payload.title,
    payload.review_date,
    payload.chairperson_identity_id,
    payload.summary,
    payload.minutes,
    payload.notes,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapSessionRow(rows[0]);
}

export async function completeManagementReviewSession(db, payload) {
  const sql = `
    UPDATE management_review_sessions
    SET
      status = 'COMPLETED',
      completed_at = NOW(),
      updated_by = $3,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
    RETURNING *
  `;
  const { rows } = await db.query(sql, [payload.tenant_id, payload.id, payload.updated_by]);
  return mapSessionRow(rows[0]);
}

export async function cancelManagementReviewSession(db, payload) {
  const sql = `
    UPDATE management_review_sessions
    SET
      status = 'CANCELLED',
      cancelled_at = NOW(),
      cancel_reason = $4,
      updated_by = $3,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
    RETURNING *
  `;
  const { rows } = await db.query(sql, [
    payload.tenant_id,
    payload.id,
    payload.updated_by,
    payload.cancel_reason,
  ]);
  return mapSessionRow(rows[0]);
}

export async function listManagementReviewDecisionsBySessionId(db, { tenantId, sessionId }) {
  const sql = `
    SELECT *
    FROM management_review_decisions
    WHERE tenant_id = $1
      AND session_id = $2
    ORDER BY sort_order ASC, id ASC
  `;
  const { rows } = await db.query(sql, [tenantId, sessionId]);
  return rows.map(mapDecisionRow);
}

export async function findManagementReviewDecisionById(db, { tenantId, sessionId, decisionId }) {
  const sql = `
    SELECT *
    FROM management_review_decisions
    WHERE tenant_id = $1
      AND session_id = $2
      AND id = $3
    LIMIT 1
  `;
  const { rows } = await db.query(sql, [tenantId, sessionId, decisionId]);
  return mapDecisionRow(rows[0] ?? null);
}

export async function insertManagementReviewDecision(db, payload) {
  const sql = `
    INSERT INTO management_review_decisions (
      tenant_id,
      session_id,
      decision_no,
      title,
      decision_text,
      owner_identity_id,
      target_date,
      sort_order,
      created_by,
      updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.session_id,
    payload.decision_no,
    payload.title,
    payload.decision_text,
    payload.owner_identity_id,
    payload.target_date,
    payload.sort_order,
    payload.created_by,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapDecisionRow(rows[0]);
}

export async function updateManagementReviewDecision(db, payload) {
  const sql = `
    UPDATE management_review_decisions
    SET
      decision_no = $4,
      title = $5,
      decision_text = $6,
      owner_identity_id = $7,
      target_date = $8,
      sort_order = $9,
      updated_by = $10,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND session_id = $2
      AND id = $3
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.session_id,
    payload.id,
    payload.decision_no,
    payload.title,
    payload.decision_text,
    payload.owner_identity_id,
    payload.target_date,
    payload.sort_order,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapDecisionRow(rows[0]);
}

export async function deleteManagementReviewDecision(db, { tenantId, sessionId, decisionId }) {
  await db.query(
    `
      DELETE FROM management_review_decisions
      WHERE tenant_id = $1
        AND session_id = $2
        AND id = $3
    `,
    [tenantId, sessionId, decisionId],
  );
}

export async function listManagementReviewActionItemsBySessionId(db, { tenantId, sessionId }) {
  const sql = `
    SELECT
      a.*,
      CASE
        WHEN a.status NOT IN ('DONE', 'CANCELLED')
         AND a.due_date < CURRENT_DATE
        THEN TRUE
        ELSE FALSE
      END AS is_overdue
    FROM management_review_action_items a
    WHERE a.tenant_id = $1
      AND a.session_id = $2
    ORDER BY a.sort_order ASC, a.id ASC
  `;
  const { rows } = await db.query(sql, [tenantId, sessionId]);
  return rows.map(mapActionItemRow);
}

export async function findManagementReviewActionItemById(db, { tenantId, sessionId, actionItemId }) {
  const sql = `
    SELECT
      a.*,
      CASE
        WHEN a.status NOT IN ('DONE', 'CANCELLED')
         AND a.due_date < CURRENT_DATE
        THEN TRUE
        ELSE FALSE
      END AS is_overdue
    FROM management_review_action_items a
    WHERE a.tenant_id = $1
      AND a.session_id = $2
      AND a.id = $3
    LIMIT 1
  `;
  const { rows } = await db.query(sql, [tenantId, sessionId, actionItemId]);
  return mapActionItemRow(rows[0] ?? null);
}

export async function insertManagementReviewActionItem(db, payload) {
  const sql = `
    INSERT INTO management_review_action_items (
      tenant_id,
      session_id,
      decision_id,
      action_no,
      title,
      description,
      owner_identity_id,
      due_date,
      status,
      progress_notes,
      completion_notes,
      completed_at,
      sort_order,
      created_by,
      updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.session_id,
    payload.decision_id,
    payload.action_no,
    payload.title,
    payload.description,
    payload.owner_identity_id,
    payload.due_date,
    payload.status,
    payload.progress_notes,
    payload.completion_notes,
    payload.completed_at,
    payload.sort_order,
    payload.created_by,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapActionItemRow(rows[0]);
}

export async function updateManagementReviewActionItem(db, payload) {
  const sql = `
    UPDATE management_review_action_items
    SET
      decision_id = $4,
      action_no = $5,
      title = $6,
      description = $7,
      owner_identity_id = $8,
      due_date = $9,
      status = $10,
      progress_notes = $11,
      completion_notes = $12,
      completed_at = $13,
      sort_order = $14,
      updated_by = $15,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND session_id = $2
      AND id = $3
    RETURNING *
  `;
  const values = [
    payload.tenant_id,
    payload.session_id,
    payload.id,
    payload.decision_id,
    payload.action_no,
    payload.title,
    payload.description,
    payload.owner_identity_id,
    payload.due_date,
    payload.status,
    payload.progress_notes,
    payload.completion_notes,
    payload.completed_at,
    payload.sort_order,
    payload.updated_by,
  ];
  const { rows } = await db.query(sql, values);
  return mapActionItemRow(rows[0]);
}

export async function deleteManagementReviewActionItem(db, { tenantId, sessionId, actionItemId }) {
  await db.query(
    `
      DELETE FROM management_review_action_items
      WHERE tenant_id = $1
        AND session_id = $2
        AND id = $3
    `,
    [tenantId, sessionId, actionItemId],
  );
}

export async function countManagementReviewActionTracker(db, filters) {
  const { params, whereSql } = buildActionTrackerWhereClause(filters);
  const { rows } = await db.query(
    `
      SELECT COUNT(*)::int AS total
      FROM management_review_action_items a
      JOIN management_review_sessions s
        ON s.tenant_id = a.tenant_id
       AND s.id = a.session_id
      ${whereSql}
    `,
    params,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function listManagementReviewActionTracker(db, filters) {
  const { params, whereSql } = buildActionTrackerWhereClause(filters);
  const limitIndex = params.push(filters.limit ?? 25);
  const offsetIndex = params.push(filters.offset ?? 0);

  const sql = `
    SELECT
      a.*,
      s.session_code,
      s.title AS session_title,
      s.review_date AS session_review_date,
      s.status AS session_status,
      CASE
        WHEN a.status NOT IN ('DONE', 'CANCELLED')
         AND a.due_date < CURRENT_DATE
        THEN TRUE
        ELSE FALSE
      END AS is_overdue
    FROM management_review_action_items a
    JOIN management_review_sessions s
      ON s.tenant_id = a.tenant_id
     AND s.id = a.session_id
    ${whereSql}
    ORDER BY
      CASE
        WHEN a.status NOT IN ('DONE', 'CANCELLED') AND a.due_date < CURRENT_DATE THEN 0
        ELSE 1
      END ASC,
      a.due_date ASC,
      a.id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const { rows } = await db.query(sql, params);
  return rows.map(mapActionItemRow);
}

export async function findTenantIdentityById(db, { tenantId, identityId }) {
  const { rows } = await db.query(
    `
      SELECT id
      FROM identities
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
    `,
    [tenantId, identityId],
  );

  return rows[0] ?? null;
}

export async function listAuditEventColumns(db) {
  const { rows } = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'audit_events'
    `,
  );
  return rows.map((row) => row.column_name);
}

export async function insertAuditEventGeneric(db, { columns, values }) {
  if (!columns.length) return;
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  await db.query(
    `INSERT INTO audit_events (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
  );
}
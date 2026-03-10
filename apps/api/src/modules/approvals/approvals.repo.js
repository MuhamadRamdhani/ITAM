function toNum(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return v;
}

function mapApproval(row) {
  if (!row) return row;

  // inject enriched label/code ke payload juga (optional, biar FE lama tetap bisa)
  const payload = row.payload ?? {};
  const nextPayload = { ...payload };

  if (row.from_state_code && !nextPayload.from_state_code)
    nextPayload.from_state_code = row.from_state_code;
  if (
    row.from_state_display_name &&
    !nextPayload.from_state_display_name &&
    !nextPayload.from_state_label
  )
    nextPayload.from_state_display_name = row.from_state_display_name;

  if (row.to_state_code && !nextPayload.to_state_code)
    nextPayload.to_state_code = row.to_state_code;
  if (
    row.to_state_display_name &&
    !nextPayload.to_state_display_name &&
    !nextPayload.to_state_label
  )
    nextPayload.to_state_display_name = row.to_state_display_name;

  return {
    ...row,
    id: toNum(row.id),
    tenant_id: toNum(row.tenant_id),
    subject_id: toNum(row.subject_id),
    requested_by_identity_id:
      row.requested_by_identity_id == null
        ? null
        : toNum(row.requested_by_identity_id),
    decided_by_identity_id:
      row.decided_by_identity_id == null
        ? null
        : toNum(row.decided_by_identity_id),

    status: row.status ?? row.status_code,

    payload: nextPayload,
  };
}

function mapEvent(row) {
  if (!row) return row;
  return {
    ...row,
    id: toNum(row.id),
    tenant_id: toNum(row.tenant_id),
    approval_id: toNum(row.approval_id),
    actor_identity_id:
      row.actor_identity_id == null ? null : toNum(row.actor_identity_id),
  };
}

// SQL helper: ambil id dari json text, kalau bukan angka -> NULL (biar gak error cast)
function safeJsonIdToBigint(expr) {
  return `
    CASE
      WHEN (${expr}) ~ '^[0-9]+$' THEN (${expr})::bigint
      ELSE NULL
    END
  `;
}

export async function listApprovals(
  app,
  {
    tenantId,
    status,
    q,
    page,
    pageSize,

    subjectType,
    subjectId,
    actionCode,
  }
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  const where = [`a.tenant_id = $1`];
  const params = [tenantId];

  if (status) {
    params.push(status);
    where.push(`a.status_code = $${params.length}`);
  }

  if (subjectType) {
    params.push(subjectType);
    where.push(`a.subject_type = $${params.length}`);
  }

  if (subjectId != null && String(subjectId).trim() !== "") {
    params.push(Number(subjectId));
    where.push(`a.subject_id = $${params.length}`);
  }

  if (actionCode) {
    params.push(actionCode);
    where.push(`a.action_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where.push(
      `(a.action_code ILIKE ${p} OR a.subject_type ILIKE ${p} OR a.payload::text ILIKE ${p})`
    );
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const totalRes = await app.pg.query(
    `SELECT COUNT(*)::bigint AS total FROM approvals a ${whereSql}`,
    params
  );
  const total = Number(totalRes.rows?.[0]?.total ?? 0);

  const fromExpr = `COALESCE(a.payload->>'from_state_id', a.payload->'transition'->>'from_state_id')`;
  const toExpr = `COALESCE(a.payload->>'to_state_id', a.payload->'transition'->>'to_state_id')`;

  const res = await app.pg.query(
    `
    SELECT
      a.id, a.tenant_id, a.subject_type, a.subject_id, a.action_code,
      a.status_code, a.status_code AS status,
      a.requested_at, a.requested_by_identity_id,
      a.decided_at, a.decided_by_identity_id, a.decision_reason,
      a.payload,
      
      ls_from.code AS from_state_code,
      ls_from.display_name AS from_state_display_name,
      ls_to.code AS to_state_code,
      ls_to.display_name AS to_state_display_name

    FROM approvals a
    LEFT JOIN lifecycle_states ls_from
      ON ls_from.tenant_id = a.tenant_id
     AND ls_from.id = ${safeJsonIdToBigint(fromExpr)}
    LEFT JOIN lifecycle_states ls_to
      ON ls_to.tenant_id = a.tenant_id
     AND ls_to.id = ${safeJsonIdToBigint(toExpr)}

    ${whereSql}
    ORDER BY a.requested_at DESC
    LIMIT ${safePageSize} OFFSET ${offset}
    `,
    params
  );

  return { total, items: res.rows.map(mapApproval) };
}

export async function getApproval(app, { tenantId, approvalId }) {
  const aRes = await app.pg.query(
    `SELECT * FROM approvals WHERE tenant_id = $1 AND id = $2`,
    [tenantId, approvalId]
  );
  const approval = mapApproval(aRes.rows[0]);
  if (!approval) return null;

  const eRes = await app.pg.query(
    `
    SELECT id, tenant_id, approval_id, event_type, actor_identity_id, note, event_payload, created_at
    FROM approval_events
    WHERE tenant_id = $1 AND approval_id = $2
    ORDER BY created_at DESC
    `,
    [tenantId, approvalId]
  );

  return { approval, events: eRes.rows.map(mapEvent) };
}

export async function insertApprovalEvent(
  app,
  { tenantId, approvalId, eventType, actorId, note, eventPayload }
) {
  const res = await app.pg.query(
    `
    INSERT INTO approval_events
      (tenant_id, approval_id, event_type, actor_identity_id, note, event_payload)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    RETURNING id, tenant_id, approval_id, event_type, actor_identity_id, note, event_payload, created_at
    `,
    [tenantId, approvalId, eventType, actorId ?? null, note ?? null, eventPayload ?? {}]
  );

  return mapEvent(res.rows[0]);
}

export async function createApproval(
  app,
  { tenantId, subjectType, subjectId, actionCode, requestedBy, payload }
) {
  const res = await app.pg.query(
    `
    INSERT INTO approvals
      (tenant_id, subject_type, subject_id, action_code, status_code, requested_by_identity_id, payload)
    VALUES
      ($1, $2, $3, $4, 'PENDING', $5, $6)
    ON CONFLICT (tenant_id, subject_type, subject_id, action_code)
      WHERE status_code = 'PENDING'
    DO NOTHING
    RETURNING *
    `,
    [tenantId, subjectType, subjectId, actionCode, requestedBy ?? null, payload ?? {}]
  );

  return mapApproval(res.rows[0] ?? null);
}

export async function decideApproval(
  app,
  { tenantId, approvalId, decision, decidedBy, decisionReason }
) {
  const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";

  const res = await app.pg.query(
    `
    UPDATE approvals
    SET
      status_code = $3,
      decided_at = now(),
      decided_by_identity_id = $4,
      decision_reason = $5
    WHERE tenant_id = $1
      AND id = $2
      AND status_code = 'PENDING'
    RETURNING *
    `,
    [tenantId, approvalId, status, decidedBy ?? null, decisionReason ?? null]
  );

  return mapApproval(res.rows[0] ?? null);
}
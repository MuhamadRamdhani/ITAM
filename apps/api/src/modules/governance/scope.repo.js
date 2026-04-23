function normalizeInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return n;
}

export async function listScopeVersions(db, { tenantId, status, limit, offset }) {
  const where = [`tenant_id = $1`];
  const params = [tenantId];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;

  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
    FROM public.scope_versions
    WHERE ${where.join(" AND ")}
    ORDER BY version_no DESC, id DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.scope_versions
    WHERE ${where.join(" AND ")}
  `;

  const [rowsRes, countRes] = await Promise.all([
    db.query(sql, params),
    db.query(countSql, params.slice(0, status ? 2 : 1)),
  ]);

  return {
    items: rowsRes.rows ?? [],
    total: normalizeInt(countRes.rows?.[0]?.total, 0),
  };
}

export async function getScopeVersionById(db, { tenantId, id }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
    FROM public.scope_versions
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `;
  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

export async function getScopeVersionByIdForDelete(db, { tenantId, id }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
    FROM public.scope_versions
    WHERE tenant_id = $1
      AND id = $2
    FOR UPDATE
    LIMIT 1
  `;
  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

export async function listScopeEventsByVersionId(db, { tenantId, scopeVersionId }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      scope_version_id,
      event_type,
      actor_user_id,
      note,
      event_payload,
      created_at
    FROM public.scope_events
    WHERE tenant_id = $1
      AND scope_version_id = $2
    ORDER BY created_at DESC, id DESC
  `;
  const res = await db.query(sql, [tenantId, scopeVersionId]);
  return res.rows ?? [];
}

export async function lockScopeVersionDeleteRelatedTables(db) {
  await db.query(`
    LOCK TABLE public.scope_events
    IN SHARE ROW EXCLUSIVE MODE
  `);
}

export async function getNextScopeVersionNo(db, { tenantId }) {
  const sql = `
    SELECT COALESCE(MAX(version_no), 0)::int + 1 AS next_no
    FROM public.scope_versions
    WHERE tenant_id = $1
  `;
  const res = await db.query(sql, [tenantId]);
  return normalizeInt(res.rows?.[0]?.next_no, 1);
}

export async function insertScopeVersion(db, {
  tenantId,
  versionNo,
  scopeJson,
  note,
  actorUserId,
}) {
  const sql = `
    INSERT INTO public.scope_versions (
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES ($1, $2, 'DRAFT', $3::jsonb, $4, $5, $5)
    RETURNING
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
  `;
  const res = await db.query(sql, [
    tenantId,
    versionNo,
    JSON.stringify(scopeJson ?? {}),
    note ?? null,
    actorUserId ?? null,
  ]);
  return res.rows?.[0] ?? null;
}

export async function updateScopeVersionStatus(db, {
  tenantId,
  id,
  fromStatus,
  toStatus,
  actorUserId,
  note,
  setSubmittedAt = false,
  setApprovedAt = false,
  setActivatedAt = false,
  setSupersededAt = false,
}) {
  const sql = `
    UPDATE public.scope_versions
    SET
      status = $4,
      note = COALESCE($5, note),
      updated_by_user_id = $6,
      updated_at = NOW(),
      submitted_at = CASE WHEN $7 THEN NOW() ELSE submitted_at END,
      approved_at = CASE WHEN $8 THEN NOW() ELSE approved_at END,
      activated_at = CASE WHEN $9 THEN NOW() ELSE activated_at END,
      superseded_at = CASE WHEN $10 THEN NOW() ELSE superseded_at END
    WHERE tenant_id = $1
      AND id = $2
      AND status = $3
    RETURNING
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
  `;
  const res = await db.query(sql, [
    tenantId,
    id,
    fromStatus,
    toStatus,
    note ?? null,
    actorUserId ?? null,
    setSubmittedAt,
    setApprovedAt,
    setActivatedAt,
    setSupersededAt,
  ]);
  return res.rows?.[0] ?? null;
}

export async function getActiveScopeVersion(db, { tenantId }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
    FROM public.scope_versions
    WHERE tenant_id = $1
      AND status = 'ACTIVE'
    ORDER BY id DESC
    LIMIT 1
  `;
  const res = await db.query(sql, [tenantId]);
  return res.rows?.[0] ?? null;
}

export async function markScopeVersionSuperseded(db, {
  tenantId,
  id,
  actorUserId,
  note,
}) {
  const sql = `
    UPDATE public.scope_versions
    SET
      status = 'SUPERSEDED',
      note = COALESCE($3, note),
      updated_by_user_id = $4,
      updated_at = NOW(),
      superseded_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
      AND status = 'ACTIVE'
    RETURNING
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
  `;
  const res = await db.query(sql, [
    tenantId,
    id,
    note ?? null,
    actorUserId ?? null,
  ]);
  return res.rows?.[0] ?? null;
}

export async function forceScopeVersionActive(db, {
  tenantId,
  id,
  actorUserId,
  note,
}) {
  const sql = `
    UPDATE public.scope_versions
    SET
      status = 'ACTIVE',
      note = COALESCE($3, note),
      updated_by_user_id = $4,
      updated_at = NOW(),
      activated_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
      AND status = 'APPROVED'
    RETURNING
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
  `;
  const res = await db.query(sql, [
    tenantId,
    id,
    note ?? null,
    actorUserId ?? null,
  ]);
  return res.rows?.[0] ?? null;
}

export async function insertScopeEvent(db, {
  tenantId,
  scopeVersionId,
  eventType,
  actorUserId,
  note,
  eventPayload,
}) {
  const sql = `
    INSERT INTO public.scope_events (
      tenant_id,
      scope_version_id,
      event_type,
      actor_user_id,
      note,
      event_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING
      id,
      tenant_id,
      scope_version_id,
      event_type,
      actor_user_id,
      note,
      event_payload,
      created_at
  `;
  const res = await db.query(sql, [
    tenantId,
    scopeVersionId,
    eventType,
    actorUserId ?? null,
    note ?? null,
    JSON.stringify(eventPayload ?? {}),
  ]);
  return res.rows?.[0] ?? null;
}

export async function deleteScopeEventsByVersionId(db, { tenantId, scopeVersionId }) {
  const sql = `
    DELETE FROM public.scope_events
    WHERE tenant_id = $1
      AND scope_version_id = $2
  `;
  const res = await db.query(sql, [tenantId, scopeVersionId]);
  return Number(res.rowCount ?? 0);
}

export async function deleteScopeVersionById(db, { tenantId, id }) {
  const sql = `
    DELETE FROM public.scope_versions
    WHERE tenant_id = $1
      AND id = $2
      AND status = 'DRAFT'
    RETURNING
      id,
      tenant_id,
      version_no,
      status,
      scope_json,
      note,
      created_by_user_id,
      updated_by_user_id,
      submitted_at,
      approved_at,
      activated_at,
      superseded_at,
      created_at,
      updated_at
  `;
  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

function normalizeInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return n;
}

export async function listAuditEvents(db, {
  tenantId,
  actor,
  action,
  entityType,
  entityId,
  dateFrom,
  dateTo,
  q,
  limit,
  offset,
}) {
  const where = [`tenant_id = $1`];
  const params = [tenantId];

  if (actor) {
    params.push(`%${actor}%`);
    where.push(`actor ILIKE $${params.length}`);
  }

  if (action) {
    params.push(action);
    where.push(`UPPER(action) = $${params.length}`);
  }

  if (entityType) {
    params.push(entityType);
    where.push(`UPPER(entity_type) = $${params.length}`);
  }

  if (entityId != null) {
    params.push(entityId);
    where.push(`entity_id = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    where.push(`created_at >= ($${params.length}::date)`);
  }

  if (dateTo) {
    params.push(dateTo);
    where.push(`created_at < (($${params.length}::date) + INTERVAL '1 day')`);
  }

  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    where.push(`(
      actor ILIKE $${idx}
      OR action ILIKE $${idx}
      OR entity_type ILIKE $${idx}
      OR CAST(COALESCE(entity_id, 0) AS TEXT) ILIKE $${idx}
      OR CAST(COALESCE(payload, '{}'::jsonb) AS TEXT) ILIKE $${idx}
    )`);
  }

  params.push(limit);
  const limitIdx = params.length;

  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT
      id,
      tenant_id,
      actor,
      action,
      entity_type,
      entity_id,
      payload,
      created_at
    FROM public.audit_events
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
  `;

  const countParams = params.slice(0, params.length - 2);
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.audit_events
    WHERE ${where.join(" AND ")}
  `;

  const [rowsRes, countRes] = await Promise.all([
    db.query(sql, params),
    db.query(countSql, countParams),
  ]);

  return {
    items: rowsRes.rows ?? [],
    total: normalizeInt(countRes.rows?.[0]?.total, 0),
  };
}
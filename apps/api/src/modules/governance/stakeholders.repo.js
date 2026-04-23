function normalizeInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return n;
}

export async function listStakeholdersRegisters(db, {
  tenantId,
  statusCode,
  categoryCode,
  q,
  limit,
  offset,
}) {
  const where = [`tenant_id = $1`];
  const params = [tenantId];

  if (statusCode) {
    params.push(statusCode);
    where.push(`status_code = $${params.length}`);
  }

  if (categoryCode) {
    params.push(categoryCode);
    where.push(`category_code = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    where.push(`(name ILIKE $${idx} OR expectations ILIKE $${idx})`);
  }

  params.push(limit);
  const limitIdx = params.length;

  params.push(offset);
  const offsetIdx = params.length;

  const sql = `
    SELECT
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.stakeholders_register
    WHERE ${where.join(" AND ")}
    ORDER BY updated_at DESC, id DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
  `;

  const countParams = params.slice(0, params.length - 2);
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM public.stakeholders_register
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

export async function getStakeholdersRegisterById(db, { tenantId, id }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.stakeholders_register
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
  `;
  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

export async function getStakeholdersRegisterByIdForDelete(db, { tenantId, id }) {
  const sql = `
    SELECT
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    FROM public.stakeholders_register
    WHERE tenant_id = $1
      AND id = $2
    FOR UPDATE
    LIMIT 1
  `;
  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

export async function insertStakeholdersRegister(db, {
  tenantId,
  name,
  categoryCode,
  priorityCode,
  statusCode,
  expectations,
  ownerIdentityId,
  reviewDate,
  actorUserId,
}) {
  const sql = `
    INSERT INTO public.stakeholders_register (
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    RETURNING
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
  `;

  const res = await db.query(sql, [
    tenantId,
    name,
    categoryCode,
    priorityCode,
    statusCode,
    expectations,
    ownerIdentityId,
    reviewDate,
    actorUserId ?? null,
  ]);

  return res.rows?.[0] ?? null;
}

export async function updateStakeholdersRegister(db, {
  tenantId,
  id,
  name,
  categoryCode,
  priorityCode,
  statusCode,
  expectations,
  ownerIdentityId,
  reviewDate,
  actorUserId,
}) {
  const sql = `
    UPDATE public.stakeholders_register
    SET
      name = $3,
      category_code = $4,
      priority_code = $5,
      status_code = $6,
      expectations = $7,
      owner_identity_id = $8,
      review_date = $9,
      updated_by_user_id = $10,
      updated_at = NOW()
    WHERE tenant_id = $1
      AND id = $2
    RETURNING
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
  `;

  const res = await db.query(sql, [
    tenantId,
    id,
    name,
    categoryCode,
    priorityCode,
    statusCode,
    expectations,
    ownerIdentityId,
    reviewDate,
    actorUserId ?? null,
  ]);

  return res.rows?.[0] ?? null;
}

export async function countStakeholdersRegisterDeleteDependencies() {
  return { total: 0 };
}

export async function deleteStakeholdersRegisterById(db, { tenantId, id }) {
  const sql = `
    DELETE FROM public.stakeholders_register
    WHERE tenant_id = $1
      AND id = $2
    RETURNING
      id,
      tenant_id,
      name,
      category_code,
      priority_code,
      status_code,
      expectations,
      owner_identity_id,
      review_date,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
  `;

  const res = await db.query(sql, [tenantId, id]);
  return res.rows?.[0] ?? null;
}

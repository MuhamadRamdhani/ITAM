function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : x;
}

export async function insertEvidenceFile(app, row) {
  const { rows } = await app.pg.query(
    `
    insert into public.evidence_files
      (tenant_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by_identity_id)
    values
      ($1,$2,$3,$4,$5,$6,$7)
    returning id, tenant_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by_identity_id, created_at
    `,
    [
      row.tenant_id,
      row.storage_path,
      row.original_name,
      row.mime_type,
      row.size_bytes,
      row.sha256,
      row.uploaded_by_identity_id,
    ]
  );

  const r = rows[0];
  return {
    ...r,
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    size_bytes: toNum(r.size_bytes),
    uploaded_by_identity_id:
      r.uploaded_by_identity_id == null ? null : toNum(r.uploaded_by_identity_id),
  };
}

export async function getEvidenceFileById(app, tenantId, id) {
  const { rows } = await app.pg.query(
    `
    select id, tenant_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by_identity_id, created_at
    from public.evidence_files
    where tenant_id = $1 and id = $2
    `,
    [tenantId, id]
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    ...r,
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    size_bytes: toNum(r.size_bytes),
    uploaded_by_identity_id:
      r.uploaded_by_identity_id == null ? null : toNum(r.uploaded_by_identity_id),
  };
}

export async function listEvidenceFiles(app, tenantId, q, page, pageSize) {
  const offset = (page - 1) * pageSize;

  const where = [];
  const args = [tenantId];
  let i = 2;

  if (q) {
    where.push(`(original_name ilike $${i} or mime_type ilike $${i} or sha256 ilike $${i})`);
    args.push(`%${q}%`);
    i++;
  }

  const whereSql = where.length ? `and ${where.join(" and ")}` : "";

  const totalRes = await app.pg.query(
    `
    select count(*)::bigint as c
    from public.evidence_files
    where tenant_id = $1 ${whereSql}
    `,
    args
  );
  const total = Number(totalRes.rows[0]?.c ?? 0);

  const { rows } = await app.pg.query(
    `
    select id, tenant_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by_identity_id, created_at
    from public.evidence_files
    where tenant_id = $1 ${whereSql}
    order by created_at desc
    limit $${i} offset $${i + 1}
    `,
    [...args, pageSize, offset]
  );

  const items = rows.map((r) => ({
    ...r,
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    size_bytes: toNum(r.size_bytes),
    uploaded_by_identity_id:
      r.uploaded_by_identity_id == null ? null : toNum(r.uploaded_by_identity_id),
  }));

  return { items, total };
}

export async function insertEvidenceLink(app, row) {
  const { rows } = await app.pg.query(
    `
    insert into public.evidence_links
      (tenant_id, target_type, target_id, evidence_file_id, note, created_by_identity_id)
    values
      ($1,$2,$3,$4,$5,$6)
    returning id, tenant_id, target_type, target_id, evidence_file_id, note, created_by_identity_id, created_at
    `,
    [
      row.tenant_id,
      row.target_type,
      row.target_id,
      row.evidence_file_id,
      row.note,
      row.created_by_identity_id,
    ]
  );

  const r = rows[0];
  return {
    ...r,
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    target_id: toNum(r.target_id),
    evidence_file_id: toNum(r.evidence_file_id),
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
  };
}

export async function listEvidenceLinksByTarget(app, tenantId, targetType, targetId, page, pageSize) {
  const offset = (page - 1) * pageSize;

  const totalRes = await app.pg.query(
    `
    select count(*)::bigint as c
    from public.evidence_links
    where tenant_id = $1 and target_type = $2 and target_id = $3
    `,
    [tenantId, targetType, targetId]
  );
  const total = Number(totalRes.rows[0]?.c ?? 0);

  const { rows } = await app.pg.query(
    `
    select
      l.id, l.tenant_id, l.target_type, l.target_id, l.evidence_file_id, l.note, l.created_by_identity_id, l.created_at,
      f.original_name, f.mime_type, f.size_bytes, f.sha256
    from public.evidence_links l
    join public.evidence_files f
      on f.tenant_id = l.tenant_id
     and f.id = l.evidence_file_id
    where l.tenant_id = $1 and l.target_type = $2 and l.target_id = $3
    order by l.created_at desc
    limit $4 offset $5
    `,
    [tenantId, targetType, targetId, pageSize, offset]
  );

  const items = rows.map((r) => ({
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    target_type: r.target_type,
    target_id: toNum(r.target_id),
    evidence_file_id: toNum(r.evidence_file_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
    file: {
      id: toNum(r.evidence_file_id),
      original_name: r.original_name,
      mime_type: r.mime_type,
      size_bytes: toNum(r.size_bytes),
      sha256: r.sha256 ?? null,
    },
  }));

  return { items, total };
}

export async function deleteEvidenceLinkById(
  app,
  tenantId,
  linkId,
  targetType = null,
  targetId = null
) {
  const args = [tenantId, linkId];
  let sql = `
    delete from public.evidence_links
    where tenant_id = $1
      and id = $2
  `;

  let idx = 3;

  if (targetType != null) {
    sql += ` and target_type = $${idx}`;
    args.push(targetType);
    idx += 1;
  }

  if (targetId != null) {
    sql += ` and target_id = $${idx}`;
    args.push(targetId);
    idx += 1;
  }

  sql += `
    returning id, tenant_id, target_type, target_id, evidence_file_id, note, created_by_identity_id, created_at
  `;

  const { rows } = await app.pg.query(sql, args);
  if (!rows[0]) return null;

  const r = rows[0];
  return {
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    target_type: r.target_type,
    target_id: toNum(r.target_id),
    evidence_file_id: toNum(r.evidence_file_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
  };
}
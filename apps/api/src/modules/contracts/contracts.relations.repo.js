function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : x;
}

export async function listContractDocuments(app, tenantId, contractId, page, pageSize) {
  const offset = (page - 1) * pageSize;

  const totalRes = await app.pg.query(
    `
    SELECT COUNT(*)::bigint AS c
    FROM public.contract_documents cd
    WHERE cd.tenant_id = $1
      AND cd.contract_id = $2
    `,
    [tenantId, contractId]
  );

  const total = Number(totalRes.rows?.[0]?.c ?? 0);

  const { rows } = await app.pg.query(
    `
    SELECT
      cd.id,
      cd.tenant_id,
      cd.contract_id,
      cd.document_id,
      cd.note,
      cd.created_by_identity_id,
      cd.created_at,
      d.doc_type_code,
      d.title,
      d.status_code,
      d.current_version,
      d.updated_at
    FROM public.contract_documents cd
    JOIN public.documents d
      ON d.tenant_id = cd.tenant_id
     AND d.id = cd.document_id
    WHERE cd.tenant_id = $1
      AND cd.contract_id = $2
    ORDER BY cd.created_at DESC, cd.id DESC
    LIMIT $3 OFFSET $4
    `,
    [tenantId, contractId, pageSize, offset]
  );

  const items = rows.map((r) => ({
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    document_id: toNum(r.document_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
    document: {
      id: toNum(r.document_id),
      doc_type_code: r.doc_type_code,
      title: r.title,
      status_code: r.status_code,
      current_version: toNum(r.current_version),
      updated_at: r.updated_at,
    },
  }));

  return { items, total };
}

export async function insertContractDocument(app, row) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.contract_documents
      (tenant_id, contract_id, document_id, note, created_by_identity_id)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING
      id,
      tenant_id,
      contract_id,
      document_id,
      note,
      created_by_identity_id,
      created_at
    `,
    [
      row.tenant_id,
      row.contract_id,
      row.document_id,
      row.note ?? null,
      row.created_by_identity_id ?? null,
    ]
  );

  const r = rows[0];
  return {
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    document_id: toNum(r.document_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
  };
}

export async function deleteContractDocument(app, tenantId, contractId, documentId) {
  const { rows } = await app.pg.query(
    `
    DELETE FROM public.contract_documents
    WHERE tenant_id = $1
      AND contract_id = $2
      AND document_id = $3
    RETURNING
      id,
      tenant_id,
      contract_id,
      document_id,
      note,
      created_by_identity_id,
      created_at
    `,
    [tenantId, contractId, documentId]
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    document_id: toNum(r.document_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
  };
}

export async function listContractAssets(app, tenantId, contractId, page, pageSize) {
  const offset = (page - 1) * pageSize;

  const totalRes = await app.pg.query(
    `
    SELECT COUNT(*)::bigint AS c
    FROM public.contract_assets ca
    WHERE ca.tenant_id = $1
      AND ca.contract_id = $2
    `,
    [tenantId, contractId]
  );

  const total = Number(totalRes.rows?.[0]?.c ?? 0);

  const { rows } = await app.pg.query(
    `
    SELECT
      ca.id,
      ca.tenant_id,
      ca.contract_id,
      ca.asset_id,
      ca.note,
      ca.created_by_identity_id,
      ca.created_at,

      a.asset_tag,
      a.name,
      a.status,

      jsonb_build_object('code', at.code, 'label', at.display_name) AS asset_type,
      jsonb_build_object('code', ls.code, 'label', ls.display_name) AS state
    FROM public.contract_assets ca
    JOIN public.assets a
      ON a.tenant_id = ca.tenant_id
     AND a.id = ca.asset_id
    JOIN public.asset_types at
      ON at.id = a.asset_type_id
    LEFT JOIN public.lifecycle_states ls
      ON ls.id = a.current_state_id
    WHERE ca.tenant_id = $1
      AND ca.contract_id = $2
    ORDER BY ca.created_at DESC, ca.id DESC
    LIMIT $3 OFFSET $4
    `,
    [tenantId, contractId, pageSize, offset]
  );

  const items = rows.map((r) => ({
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    asset_id: toNum(r.asset_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
    asset: {
      id: toNum(r.asset_id),
      asset_tag: r.asset_tag,
      name: r.name,
      status: r.status ?? null,
      asset_type: r.asset_type ?? null,
      state: r.state ?? null,
    },
  }));

  return { items, total };
}

export async function insertContractAsset(app, row) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.contract_assets
      (tenant_id, contract_id, asset_id, note, created_by_identity_id)
    VALUES
      ($1, $2, $3, $4, $5)
    RETURNING
      id,
      tenant_id,
      contract_id,
      asset_id,
      note,
      created_by_identity_id,
      created_at
    `,
    [
      row.tenant_id,
      row.contract_id,
      row.asset_id,
      row.note ?? null,
      row.created_by_identity_id ?? null,
    ]
  );

  const r = rows[0];
  return {
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    asset_id: toNum(r.asset_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
  };
}

export async function deleteContractAsset(app, tenantId, contractId, assetId) {
  const { rows } = await app.pg.query(
    `
    DELETE FROM public.contract_assets
    WHERE tenant_id = $1
      AND contract_id = $2
      AND asset_id = $3
    RETURNING
      id,
      tenant_id,
      contract_id,
      asset_id,
      note,
      created_by_identity_id,
      created_at
    `,
    [tenantId, contractId, assetId]
  );

  if (!rows[0]) return null;

  const r = rows[0];
  return {
    id: toNum(r.id),
    tenant_id: toNum(r.tenant_id),
    contract_id: toNum(r.contract_id),
    asset_id: toNum(r.asset_id),
    note: r.note ?? null,
    created_by_identity_id:
      r.created_by_identity_id == null ? null : toNum(r.created_by_identity_id),
    created_at: r.created_at,
  };
}
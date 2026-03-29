function contractHealthSql(alias = "c") {
  return `
    CASE
      WHEN ${alias}.end_date IS NULL THEN 'NO_END_DATE'
      WHEN ${alias}.end_date < CURRENT_DATE THEN 'EXPIRED'
      WHEN ${alias}.end_date <= (CURRENT_DATE + (COALESCE(${alias}.renewal_notice_days, 30) * INTERVAL '1 day')) THEN 'EXPIRING'
      ELSE 'ACTIVE'
    END
  `;
}

function buildListWhere(filters) {
  const clauses = [`c.tenant_id = $1`];
  const values = [filters.tenantId];
  let idx = 2;

  if (filters.search) {
    clauses.push(`
      (
        c.contract_code ILIKE $${idx}
        OR c.contract_name ILIKE $${idx}
        OR v.vendor_code ILIKE $${idx}
        OR v.vendor_name ILIKE $${idx}
      )
    `);
    values.push(`%${filters.search}%`);
    idx += 1;
  }

  if (filters.status) {
    clauses.push(`c.status = $${idx}`);
    values.push(filters.status);
    idx += 1;
  }

  if (filters.contractType) {
    clauses.push(`c.contract_type = $${idx}`);
    values.push(filters.contractType);
    idx += 1;
  }

  if (filters.vendorId) {
    clauses.push(`c.vendor_id = $${idx}`);
    values.push(filters.vendorId);
    idx += 1;
  }

  if (filters.health) {
    clauses.push(`(${contractHealthSql("c")}) = $${idx}`);
    values.push(filters.health);
    idx += 1;
  }

  return { whereSql: clauses.join(" AND "), values, nextIndex: idx };
}

export async function listContracts(app, filters) {
  const { whereSql, values, nextIndex } = buildListWhere(filters);
  const limitIdx = nextIndex;
  const offsetIdx = nextIndex + 1;

  const sql = `
    SELECT
      c.id,
      c.tenant_id,
      c.vendor_id,
      c.contract_code,
      c.contract_name,
      c.contract_type,
      c.status,
      c.start_date,
      c.end_date,
      c.renewal_notice_days,
      c.owner_identity_id,
      c.notes,
      c.created_at,
      c.updated_at,
      v.vendor_code,
      v.vendor_name,
      ${contractHealthSql("c")} AS contract_health,
      CASE
        WHEN c.end_date IS NULL THEN NULL
        ELSE (c.end_date - CURRENT_DATE)
      END AS days_to_expiry
    FROM public.contracts c
    INNER JOIN public.vendors v
      ON v.id = c.vendor_id
     AND v.tenant_id = c.tenant_id
    WHERE ${whereSql}
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
  `;

  const { rows } = await app.pg.query(sql, [
    ...values,
    filters.limit,
    filters.offset,
  ]);

  return rows;
}

export async function countContracts(app, filters) {
  const { whereSql, values } = buildListWhere(filters);

  const sql = `
    SELECT COUNT(*)::BIGINT AS total
    FROM public.contracts c
    INNER JOIN public.vendors v
      ON v.id = c.vendor_id
     AND v.tenant_id = c.tenant_id
    WHERE ${whereSql}
  `;

  const { rows } = await app.pg.query(sql, values);
  return Number(rows[0]?.total || 0);
}

export async function getContractById(app, tenantId, contractId) {
  const sql = `
    SELECT
      c.id,
      c.tenant_id,
      c.vendor_id,
      c.contract_code,
      c.contract_name,
      c.contract_type,
      c.status,
      c.start_date,
      c.end_date,
      c.renewal_notice_days,
      c.owner_identity_id,
      c.notes,
      c.created_at,
      c.updated_at,
      v.vendor_code,
      v.vendor_name,
      ${contractHealthSql("c")} AS contract_health,
      CASE
        WHEN c.end_date IS NULL THEN NULL
        ELSE (c.end_date - CURRENT_DATE)
      END AS days_to_expiry
    FROM public.contracts c
    INNER JOIN public.vendors v
      ON v.id = c.vendor_id
     AND v.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1
      AND c.id = $2
    LIMIT 1
  `;

  const { rows } = await app.pg.query(sql, [tenantId, contractId]);
  return rows[0] || null;
}

export async function getVendorByIdForTenant(app, tenantId, vendorId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id, vendor_code, vendor_name, status
    FROM public.vendors
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, vendorId]
  );
  return rows[0] || null;
}

export async function getIdentityByIdForTenant(app, tenantId, identityId) {
  const { rows } = await app.pg.query(
    `
    SELECT id, tenant_id
    FROM public.identities
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, identityId]
  );
  return rows[0] || null;
}

export async function findContractByCode(app, tenantId, contractCode, excludeId = null) {
  const params = [tenantId, contractCode];
  let sql = `
    SELECT id, tenant_id, contract_code
    FROM public.contracts
    WHERE tenant_id = $1
      AND contract_code = $2
  `;

  if (excludeId != null) {
    params.push(excludeId);
    sql += ` AND id <> $3`;
  }

  sql += ` LIMIT 1`;

  const { rows } = await app.pg.query(sql, params);
  return rows[0] || null;
}

export async function insertContract(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.contracts (
      tenant_id,
      vendor_id,
      contract_code,
      contract_name,
      contract_type,
      status,
      start_date,
      end_date,
      renewal_notice_days,
      owner_identity_id,
      notes
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING id
    `,
    [
      payload.tenant_id,
      payload.vendor_id,
      payload.contract_code,
      payload.contract_name,
      payload.contract_type,
      payload.status,
      payload.start_date,
      payload.end_date,
      payload.renewal_notice_days,
      payload.owner_identity_id,
      payload.notes,
    ]
  );

  return rows[0] || null;
}

export async function updateContract(app, tenantId, contractId, patch) {
  const sets = [];
  const values = [tenantId, contractId];
  let idx = 3;

  if (Object.prototype.hasOwnProperty.call(patch, "vendor_id")) {
    sets.push(`vendor_id = $${idx++}`);
    values.push(patch.vendor_id);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "contract_code")) {
    sets.push(`contract_code = $${idx++}`);
    values.push(patch.contract_code);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "contract_name")) {
    sets.push(`contract_name = $${idx++}`);
    values.push(patch.contract_name);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "contract_type")) {
    sets.push(`contract_type = $${idx++}`);
    values.push(patch.contract_type);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    sets.push(`status = $${idx++}`);
    values.push(patch.status);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "start_date")) {
    sets.push(`start_date = $${idx++}`);
    values.push(patch.start_date);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "end_date")) {
    sets.push(`end_date = $${idx++}`);
    values.push(patch.end_date);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "renewal_notice_days")) {
    sets.push(`renewal_notice_days = $${idx++}`);
    values.push(patch.renewal_notice_days);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "owner_identity_id")) {
    sets.push(`owner_identity_id = $${idx++}`);
    values.push(patch.owner_identity_id);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    sets.push(`notes = $${idx++}`);
    values.push(patch.notes);
  }

  if (sets.length === 0) {
    return null;
  }

  sets.push(`updated_at = NOW()`);

  const sql = `
    UPDATE public.contracts
    SET ${sets.join(", ")}
    WHERE tenant_id = $1
      AND id = $2
    RETURNING id
  `;

  const { rows } = await app.pg.query(sql, values);
  return rows[0] || null;
}
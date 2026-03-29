function buildVendorWhere(tenantId, filters = {}) {
  const params = [tenantId];
  const where = [`v.tenant_id = $1`];
  let idx = 2;

  if (filters.status) {
    params.push(String(filters.status).trim().toUpperCase());
    where.push(`v.status = $${idx}`);
    idx += 1;
  }

  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(`(
      v.vendor_code ILIKE $${idx}
      OR v.vendor_name ILIKE $${idx}
      OR v.vendor_type ILIKE $${idx}
      OR COALESCE(v.primary_contact_name, '') ILIKE $${idx}
      OR COALESCE(v.primary_contact_email, '') ILIKE $${idx}
      OR COALESCE(v.primary_contact_phone, '') ILIKE $${idx}
    )`);
    idx += 1;
  }

  return {
    params,
    whereSql: where.join(" AND "),
  };
}

export async function countVendors(app, tenantId, filters = {}) {
  const built = buildVendorWhere(tenantId, filters);

  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.vendors v
    WHERE ${built.whereSql}
    `,
    built.params
  );

  return Number(rows?.[0]?.c ?? 0);
}

export async function listVendors(app, tenantId, filters = {}) {
  const page = Math.max(Number(filters.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize || 20), 1), 100);
  const offset = (page - 1) * pageSize;

  const built = buildVendorWhere(tenantId, filters);

  const params = [...built.params, pageSize, offset];
  const limitIdx = built.params.length + 1;
  const offsetIdx = built.params.length + 2;

  const { rows } = await app.pg.query(
    `
    SELECT
      v.id,
      v.tenant_id,
      v.vendor_code,
      v.vendor_name,
      v.vendor_type,
      v.status,
      v.primary_contact_name,
      v.primary_contact_email,
      v.primary_contact_phone,
      v.notes,
      v.created_at,
      v.updated_at
    FROM public.vendors v
    WHERE ${built.whereSql}
    ORDER BY v.updated_at DESC, v.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  return rows;
}

export async function findVendorById(app, tenantId, vendorId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      v.id,
      v.tenant_id,
      v.vendor_code,
      v.vendor_name,
      v.vendor_type,
      v.status,
      v.primary_contact_name,
      v.primary_contact_email,
      v.primary_contact_phone,
      v.notes,
      v.created_at,
      v.updated_at
    FROM public.vendors v
    WHERE v.tenant_id = $1
      AND v.id = $2
    LIMIT 1
    `,
    [tenantId, vendorId]
  );

  return rows[0] || null;
}

export async function findVendorByCode(
  app,
  tenantId,
  vendorCode,
  excludeId = null
) {
  if (excludeId != null) {
    const { rows } = await app.pg.query(
      `
      SELECT
        v.id,
        v.tenant_id,
        v.vendor_code,
        v.vendor_name,
        v.vendor_type,
        v.status
      FROM public.vendors v
      WHERE v.tenant_id = $1
        AND v.vendor_code = $2
        AND v.id <> $3
      LIMIT 1
      `,
      [tenantId, vendorCode, excludeId]
    );

    return rows[0] || null;
  }

  const { rows } = await app.pg.query(
    `
    SELECT
      v.id,
      v.tenant_id,
      v.vendor_code,
      v.vendor_name,
      v.vendor_type,
      v.status
    FROM public.vendors v
    WHERE v.tenant_id = $1
      AND v.vendor_code = $2
    LIMIT 1
    `,
    [tenantId, vendorCode]
  );

  return rows[0] || null;
}

export async function insertVendor(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.vendors
      (
        tenant_id,
        vendor_code,
        vendor_name,
        vendor_type,
        status,
        primary_contact_name,
        primary_contact_email,
        primary_contact_phone,
        notes
      )
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING
      id,
      tenant_id,
      vendor_code,
      vendor_name,
      vendor_type,
      status,
      primary_contact_name,
      primary_contact_email,
      primary_contact_phone,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.vendor_code,
      payload.vendor_name,
      payload.vendor_type,
      payload.status,
      payload.primary_contact_name,
      payload.primary_contact_email,
      payload.primary_contact_phone,
      payload.notes,
    ]
  );

  return rows[0];
}

export async function updateVendor(app, tenantId, vendorId, patch) {
  const sets = [];
  const params = [];
  let idx = 1;

  if (Object.prototype.hasOwnProperty.call(patch, "vendor_code")) {
    sets.push(`vendor_code = $${idx}`);
    params.push(patch.vendor_code);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "vendor_name")) {
    sets.push(`vendor_name = $${idx}`);
    params.push(patch.vendor_name);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "vendor_type")) {
    sets.push(`vendor_type = $${idx}`);
    params.push(patch.vendor_type);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    sets.push(`status = $${idx}`);
    params.push(patch.status);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "primary_contact_name")) {
    sets.push(`primary_contact_name = $${idx}`);
    params.push(patch.primary_contact_name);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "primary_contact_email")) {
    sets.push(`primary_contact_email = $${idx}`);
    params.push(patch.primary_contact_email);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "primary_contact_phone")) {
    sets.push(`primary_contact_phone = $${idx}`);
    params.push(patch.primary_contact_phone);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    sets.push(`notes = $${idx}`);
    params.push(patch.notes);
    idx += 1;
  }

  sets.push(`updated_at = now()`);

  params.push(tenantId);
  params.push(vendorId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.vendors
    SET ${sets.join(", ")}
    WHERE tenant_id = $${idx}
      AND id = $${idx + 1}
    RETURNING
      id,
      tenant_id,
      vendor_code,
      vendor_name,
      vendor_type,
      status,
      primary_contact_name,
      primary_contact_email,
      primary_contact_phone,
      notes,
      created_at,
      updated_at
    `,
    params
  );

  return rows[0] || null;
}
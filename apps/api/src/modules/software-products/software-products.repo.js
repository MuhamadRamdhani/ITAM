function buildSoftwareProductsWhere(tenantId, filters = {}) {
  const params = [tenantId];
  const where = [`sp.tenant_id = $1`];
  let idx = 2;

  if (filters.status) {
    params.push(String(filters.status).trim().toUpperCase());
    where.push(`sp.status = $${idx}`);
    idx += 1;
  }

  if (filters.category) {
    params.push(String(filters.category).trim().toUpperCase());
    where.push(`sp.category = $${idx}`);
    idx += 1;
  }

  if (filters.deployment_model) {
    params.push(String(filters.deployment_model).trim().toUpperCase());
    where.push(`sp.deployment_model = $${idx}`);
    idx += 1;
  }

  if (filters.publisher_vendor_id != null) {
    params.push(Number(filters.publisher_vendor_id));
    where.push(`sp.publisher_vendor_id = $${idx}`);
    idx += 1;
  }

  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(`(
      sp.product_code ILIKE $${idx}
      OR sp.product_name ILIKE $${idx}
    )`);
    idx += 1;
  }

  return {
    params,
    whereSql: where.join(" AND "),
  };
}

export async function countSoftwareProducts(app, tenantId, filters = {}) {
  const built = buildSoftwareProductsWhere(tenantId, filters);

  const { rows } = await app.pg.query(
    `
    SELECT count(*)::int AS c
    FROM public.software_products sp
    WHERE ${built.whereSql}
    `,
    built.params
  );

  return Number(rows?.[0]?.c ?? 0);
}

export async function listSoftwareProducts(app, tenantId, filters = {}) {
  const page = Math.max(Number(filters.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize || 20), 1), 100);
  const offset = (page - 1) * pageSize;

  const built = buildSoftwareProductsWhere(tenantId, filters);

  const params = [...built.params, pageSize, offset];
  const limitIdx = built.params.length + 1;
  const offsetIdx = built.params.length + 2;

  const { rows } = await app.pg.query(
    `
    SELECT
      sp.id,
      sp.tenant_id,
      sp.product_code,
      sp.product_name,
      sp.publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name,
      sp.category,
      sp.deployment_model,
      sp.licensing_metric,
      sp.status,
      sp.version_policy,
      sp.notes,
      sp.created_at,
      sp.updated_at
    FROM public.software_products sp
    LEFT JOIN public.vendors v
      ON v.tenant_id = sp.tenant_id
     AND v.id = sp.publisher_vendor_id
    WHERE ${built.whereSql}
    ORDER BY sp.updated_at DESC, sp.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  return rows;
}

export async function findSoftwareProductById(app, tenantId, softwareProductId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      sp.id,
      sp.tenant_id,
      sp.product_code,
      sp.product_name,
      sp.publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name,
      sp.category,
      sp.deployment_model,
      sp.licensing_metric,
      sp.status,
      sp.version_policy,
      sp.notes,
      sp.created_at,
      sp.updated_at
    FROM public.software_products sp
    LEFT JOIN public.vendors v
      ON v.tenant_id = sp.tenant_id
     AND v.id = sp.publisher_vendor_id
    WHERE sp.tenant_id = $1
      AND sp.id = $2
    LIMIT 1
    `,
    [tenantId, softwareProductId]
  );

  return rows[0] || null;
}

export async function findSoftwareProductByCode(
  app,
  tenantId,
  productCode,
  excludeId = null
) {
  if (excludeId != null) {
    const { rows } = await app.pg.query(
      `
      SELECT
        sp.id,
        sp.tenant_id,
        sp.product_code,
        sp.product_name,
        sp.status
      FROM public.software_products sp
      WHERE sp.tenant_id = $1
        AND sp.product_code = $2
        AND sp.id <> $3
      LIMIT 1
      `,
      [tenantId, productCode, excludeId]
    );

    return rows[0] || null;
  }

  const { rows } = await app.pg.query(
    `
    SELECT
      sp.id,
      sp.tenant_id,
      sp.product_code,
      sp.product_name,
      sp.status
    FROM public.software_products sp
    WHERE sp.tenant_id = $1
      AND sp.product_code = $2
    LIMIT 1
    `,
    [tenantId, productCode]
  );

  return rows[0] || null;
}

export async function insertSoftwareProduct(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.software_products
      (
        tenant_id,
        product_code,
        product_name,
        publisher_vendor_id,
        category,
        deployment_model,
        licensing_metric,
        status,
        version_policy,
        notes
      )
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING
      id,
      tenant_id,
      product_code,
      product_name,
      publisher_vendor_id,
      category,
      deployment_model,
      licensing_metric,
      status,
      version_policy,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.product_code,
      payload.product_name,
      payload.publisher_vendor_id,
      payload.category,
      payload.deployment_model,
      payload.licensing_metric,
      payload.status,
      payload.version_policy,
      payload.notes,
    ]
  );

  return rows[0];
}

export async function updateSoftwareProduct(app, tenantId, softwareProductId, patch) {
  const sets = [];
  const params = [];
  let idx = 1;

  if (Object.prototype.hasOwnProperty.call(patch, "product_code")) {
    sets.push(`product_code = $${idx}`);
    params.push(patch.product_code);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "product_name")) {
    sets.push(`product_name = $${idx}`);
    params.push(patch.product_name);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "publisher_vendor_id")) {
    sets.push(`publisher_vendor_id = $${idx}`);
    params.push(patch.publisher_vendor_id);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "category")) {
    sets.push(`category = $${idx}`);
    params.push(patch.category);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "deployment_model")) {
    sets.push(`deployment_model = $${idx}`);
    params.push(patch.deployment_model);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "licensing_metric")) {
    sets.push(`licensing_metric = $${idx}`);
    params.push(patch.licensing_metric);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    sets.push(`status = $${idx}`);
    params.push(patch.status);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "version_policy")) {
    sets.push(`version_policy = $${idx}`);
    params.push(patch.version_policy);
    idx += 1;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    sets.push(`notes = $${idx}`);
    params.push(patch.notes);
    idx += 1;
  }

  sets.push(`updated_at = now()`);

  params.push(tenantId);
  params.push(softwareProductId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.software_products
    SET ${sets.join(", ")}
    WHERE tenant_id = $${idx}
      AND id = $${idx + 1}
    RETURNING
      id,
      tenant_id,
      product_code,
      product_name,
      publisher_vendor_id,
      category,
      deployment_model,
      licensing_metric,
      status,
      version_policy,
      notes,
      created_at,
      updated_at
    `,
    params
  );

  return rows[0] || null;
}
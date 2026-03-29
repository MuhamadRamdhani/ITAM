export async function getContractById(app, tenantId, contractId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      contract_code,
      contract_name,
      contract_type,
      status,
      start_date,
      end_date,
      renewal_notice_days,
      owner_identity_id,
      notes,
      created_at,
      updated_at
    FROM public.contracts
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, contractId]
  );

  return rows[0] || null;
}

export async function getSoftwareProductById(app, tenantId, softwareProductId) {
  const { rows } = await app.pg.query(
    `
    SELECT
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
    FROM public.software_products
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, softwareProductId]
  );

  return rows[0] || null;
}

export async function findSoftwareEntitlementByUniqueCode(
  app,
  tenantId,
  contractId,
  entitlementCode
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      contract_id,
      software_product_id,
      entitlement_code,
      status
    FROM public.software_entitlements
    WHERE tenant_id = $1
      AND contract_id = $2
      AND entitlement_code = $3
    LIMIT 1
    `,
    [tenantId, contractId, entitlementCode]
  );

  return rows[0] || null;
}

export async function getSoftwareEntitlementByContractAndId(
  app,
  tenantId,
  contractId,
  entitlementId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      contract_id,
      software_product_id,
      entitlement_code,
      entitlement_name,
      licensing_metric,
      quantity_purchased,
      start_date,
      end_date,
      status,
      notes,
      created_at,
      updated_at
    FROM public.software_entitlements
    WHERE tenant_id = $1
      AND contract_id = $2
      AND id = $3
    LIMIT 1
    `,
    [tenantId, contractId, entitlementId]
  );

  return rows[0] || null;
}

export async function getSoftwareEntitlementDetailById(app, tenantId, entitlementId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      se.id,
      se.tenant_id,
      se.contract_id,
      se.software_product_id,
      se.entitlement_code,
      se.entitlement_name,
      se.licensing_metric,
      se.quantity_purchased,
      se.start_date,
      se.end_date,
      se.status,
      se.notes,
      se.created_at,
      se.updated_at,

      c.contract_code,
      c.contract_name,
      c.contract_type,
      c.status AS contract_status,

      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,
      sp.category AS software_product_category,
      sp.deployment_model AS software_product_deployment_model,
      sp.licensing_metric AS software_product_default_licensing_metric,
      sp.status AS software_product_status,
      sp.version_policy AS software_product_version_policy,

      v.id AS publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name
    FROM public.software_entitlements se
    INNER JOIN public.contracts c
      ON c.id = se.contract_id
     AND c.tenant_id = se.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = se.software_product_id
     AND sp.tenant_id = se.tenant_id
    LEFT JOIN public.vendors v
      ON v.id = sp.publisher_vendor_id
     AND v.tenant_id = sp.tenant_id
    WHERE se.tenant_id = $1
      AND se.id = $2
    LIMIT 1
    `,
    [tenantId, entitlementId]
  );

  return rows[0] || null;
}

export async function listSoftwareEntitlementsByContract(app, tenantId, contractId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      se.id,
      se.tenant_id,
      se.contract_id,
      se.software_product_id,
      se.entitlement_code,
      se.entitlement_name,
      se.licensing_metric,
      se.quantity_purchased,
      se.start_date,
      se.end_date,
      se.status,
      se.notes,
      se.created_at,
      se.updated_at,

      c.contract_code,
      c.contract_name,
      c.contract_type,
      c.status AS contract_status,

      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,
      sp.category AS software_product_category,
      sp.deployment_model AS software_product_deployment_model,
      sp.licensing_metric AS software_product_default_licensing_metric,
      sp.status AS software_product_status,
      sp.version_policy AS software_product_version_policy,

      v.id AS publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name
    FROM public.software_entitlements se
    INNER JOIN public.contracts c
      ON c.id = se.contract_id
     AND c.tenant_id = se.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = se.software_product_id
     AND sp.tenant_id = se.tenant_id
    LEFT JOIN public.vendors v
      ON v.id = sp.publisher_vendor_id
     AND v.tenant_id = sp.tenant_id
    WHERE se.tenant_id = $1
      AND se.contract_id = $2
    ORDER BY
      se.updated_at DESC,
      se.id DESC
    `,
    [tenantId, contractId]
  );

  return rows;
}

export async function createSoftwareEntitlement(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.software_entitlements (
      tenant_id,
      contract_id,
      software_product_id,
      entitlement_code,
      entitlement_name,
      licensing_metric,
      quantity_purchased,
      start_date,
      end_date,
      status,
      notes
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING
      id,
      tenant_id,
      contract_id,
      software_product_id,
      entitlement_code,
      entitlement_name,
      licensing_metric,
      quantity_purchased,
      start_date,
      end_date,
      status,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.contract_id,
      payload.software_product_id,
      payload.entitlement_code,
      payload.entitlement_name,
      payload.licensing_metric,
      payload.quantity_purchased,
      payload.start_date,
      payload.end_date,
      payload.status,
      payload.notes,
    ]
  );

  return rows[0];
}

const UPDATABLE_COLUMNS = {
  software_product_id: "software_product_id",
  entitlement_code: "entitlement_code",
  entitlement_name: "entitlement_name",
  licensing_metric: "licensing_metric",
  quantity_purchased: "quantity_purchased",
  start_date: "start_date",
  end_date: "end_date",
  status: "status",
  notes: "notes",
};

export async function updateSoftwareEntitlement(
  app,
  tenantId,
  entitlementId,
  patch
) {
  const keys = Object.keys(patch).filter((key) => UPDATABLE_COLUMNS[key]);

  if (keys.length === 0) {
    return getSoftwareEntitlementDetailById(app, tenantId, entitlementId);
  }

  const values = [];
  const sets = [];

  for (const key of keys) {
    values.push(patch[key]);
    sets.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
  }

  values.push(tenantId);
  values.push(entitlementId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.software_entitlements
    SET
      ${sets.join(", ")},
      updated_at = NOW()
    WHERE tenant_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING
      id,
      tenant_id,
      contract_id,
      software_product_id,
      entitlement_code,
      entitlement_name,
      licensing_metric,
      quantity_purchased,
      start_date,
      end_date,
      status,
      notes,
      created_at,
      updated_at
    `,
    values
  );

  return rows[0] || null;
}
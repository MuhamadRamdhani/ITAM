export async function getAssetById(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      asset_tag,
      status,
      created_at,
      updated_at
    FROM public.assets
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
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

export async function findSoftwareInstallationByMapping(
  app,
  tenantId,
  assetId,
  softwareProductId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      asset_id,
      software_product_id,
      installation_status
    FROM public.software_installations
    WHERE tenant_id = $1
      AND asset_id = $2
      AND software_product_id = $3
    LIMIT 1
    `,
    [tenantId, assetId, softwareProductId]
  );

  return rows[0] || null;
}

export async function getSoftwareInstallationByAssetAndId(
  app,
  tenantId,
  assetId,
  installationId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      asset_id,
      software_product_id,
      installation_status,
      installed_version,
      installation_date,
      uninstalled_date,
      discovered_by,
      discovery_source,
      notes,
      created_at,
      updated_at
    FROM public.software_installations
    WHERE tenant_id = $1
      AND asset_id = $2
      AND id = $3
    LIMIT 1
    `,
    [tenantId, assetId, installationId]
  );

  return rows[0] || null;
}

export async function getSoftwareInstallationDetailById(app, tenantId, installationId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      si.id,
      si.tenant_id,
      si.asset_id,
      si.software_product_id,
      si.installation_status,
      si.installed_version,
      si.installation_date,
      si.uninstalled_date,
      si.discovered_by,
      si.discovery_source,
      si.notes,
      si.created_at,
      si.updated_at,

      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,
      sp.category AS software_product_category,
      sp.deployment_model AS software_product_deployment_model,
      sp.licensing_metric AS software_product_licensing_metric,
      sp.status AS software_product_status,
      sp.version_policy AS software_product_version_policy,

      v.id AS publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name
    FROM public.software_installations si
    INNER JOIN public.software_products sp
      ON sp.id = si.software_product_id
     AND sp.tenant_id = si.tenant_id
    LEFT JOIN public.vendors v
      ON v.id = sp.publisher_vendor_id
     AND v.tenant_id = sp.tenant_id
    WHERE si.tenant_id = $1
      AND si.id = $2
    LIMIT 1
    `,
    [tenantId, installationId]
  );

  return rows[0] || null;
}

export async function listSoftwareInstallationsByAsset(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      si.id,
      si.tenant_id,
      si.asset_id,
      si.software_product_id,
      si.installation_status,
      si.installed_version,
      si.installation_date,
      si.uninstalled_date,
      si.discovered_by,
      si.discovery_source,
      si.notes,
      si.created_at,
      si.updated_at,

      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,
      sp.category AS software_product_category,
      sp.deployment_model AS software_product_deployment_model,
      sp.licensing_metric AS software_product_licensing_metric,
      sp.status AS software_product_status,
      sp.version_policy AS software_product_version_policy,

      v.id AS publisher_vendor_id,
      v.vendor_code AS publisher_vendor_code,
      v.vendor_name AS publisher_vendor_name
    FROM public.software_installations si
    INNER JOIN public.software_products sp
      ON sp.id = si.software_product_id
     AND sp.tenant_id = si.tenant_id
    LEFT JOIN public.vendors v
      ON v.id = sp.publisher_vendor_id
     AND v.tenant_id = sp.tenant_id
    WHERE si.tenant_id = $1
      AND si.asset_id = $2
    ORDER BY
      si.updated_at DESC,
      si.id DESC
    `,
    [tenantId, assetId]
  );

  return rows;
}

export async function countActiveInstallationsBySoftwareProductIds(
  app,
  tenantId,
  softwareProductIds
) {
  const normalizedIds = [...new Set(
    (Array.isArray(softwareProductIds) ? softwareProductIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const { rows } = await app.pg.query(
    `
    SELECT
      software_product_id,
      COUNT(*)::bigint AS total
    FROM public.software_installations
    WHERE tenant_id = $1
      AND software_product_id = ANY($2::bigint[])
      AND installation_status IN ('INSTALLED', 'DETECTED')
    GROUP BY software_product_id
    `,
    [tenantId, normalizedIds]
  );

  return new Map(
    rows.map((row) => [
      Number(row.software_product_id),
      Number(row.total ?? 0),
    ])
  );
}

export async function createSoftwareInstallation(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.software_installations (
      tenant_id,
      asset_id,
      software_product_id,
      installation_status,
      installed_version,
      installation_date,
      uninstalled_date,
      discovered_by,
      discovery_source,
      notes
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    RETURNING
      id,
      tenant_id,
      asset_id,
      software_product_id,
      installation_status,
      installed_version,
      installation_date,
      uninstalled_date,
      discovered_by,
      discovery_source,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.asset_id,
      payload.software_product_id,
      payload.installation_status,
      payload.installed_version,
      payload.installation_date,
      payload.uninstalled_date,
      payload.discovered_by,
      payload.discovery_source,
      payload.notes,
    ]
  );

  return rows[0];
}

const UPDATABLE_COLUMNS = {
  installation_status: "installation_status",
  installed_version: "installed_version",
  installation_date: "installation_date",
  uninstalled_date: "uninstalled_date",
  discovered_by: "discovered_by",
  discovery_source: "discovery_source",
  notes: "notes",
};

export async function updateSoftwareInstallation(
  app,
  tenantId,
  installationId,
  patch
) {
  const keys = Object.keys(patch).filter((key) => UPDATABLE_COLUMNS[key]);

  if (keys.length === 0) {
    const current = await getSoftwareInstallationDetailById(app, tenantId, installationId);
    return current;
  }

  const values = [];
  const sets = [];

  for (const key of keys) {
    values.push(patch[key]);
    sets.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
  }

  values.push(tenantId);
  values.push(installationId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.software_installations
    SET
      ${sets.join(", ")},
      updated_at = NOW()
    WHERE tenant_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING
      id,
      tenant_id,
      asset_id,
      software_product_id,
      installation_status,
      installed_version,
      installation_date,
      uninstalled_date,
      discovered_by,
      discovery_source,
      notes,
      created_at,
      updated_at
    `,
    values
  );

  return rows[0] || null;
}
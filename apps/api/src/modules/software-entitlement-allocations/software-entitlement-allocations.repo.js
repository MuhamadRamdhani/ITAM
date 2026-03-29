export async function getSoftwareEntitlementById(app, tenantId, entitlementId) {
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

      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name
    FROM public.software_entitlements se
    INNER JOIN public.contracts c
      ON c.id = se.contract_id
     AND c.tenant_id = se.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = se.software_product_id
     AND sp.tenant_id = se.tenant_id
    WHERE se.tenant_id = $1
      AND se.id = $2
    LIMIT 1
    `,
    [tenantId, entitlementId]
  );

  return rows[0] || null;
}

export async function getAssetById(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      asset_tag,
      name,
      status
    FROM public.assets
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
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
      si.id,
      si.tenant_id,
      si.asset_id,
      si.software_product_id,
      si.installation_status,
      si.installed_version,
      si.installation_date,
      si.uninstalled_date,
      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name
    FROM public.software_installations si
    INNER JOIN public.software_products sp
      ON sp.id = si.software_product_id
     AND sp.tenant_id = si.tenant_id
    WHERE si.tenant_id = $1
      AND si.asset_id = $2
      AND si.id = $3
    LIMIT 1
    `,
    [tenantId, assetId, installationId]
  );

  return rows[0] || null;
}

export async function getSoftwareAssignmentByAssetAndId(
  app,
  tenantId,
  assetId,
  assignmentId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      sa.id,
      sa.tenant_id,
      sa.asset_id,
      sa.software_installation_id,
      sa.identity_id,
      sa.assignment_role,
      sa.assignment_status,
      sa.assigned_at,
      sa.unassigned_at,
      sa.notes,

      si.software_product_id,
      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,

      COALESCE(
        NULLIF(to_jsonb(i)->>'identity_code', ''),
        NULLIF(to_jsonb(i)->>'employee_code', ''),
        NULLIF(to_jsonb(i)->>'code', '')
      ) AS identity_code,

      COALESCE(
        NULLIF(to_jsonb(i)->>'full_name', ''),
        NULLIF(to_jsonb(i)->>'display_name', ''),
        NULLIF(to_jsonb(i)->>'identity_name', ''),
        NULLIF(to_jsonb(i)->>'employee_name', ''),
        NULLIF(to_jsonb(i)->>'name', ''),
        NULLIF(to_jsonb(i)->>'email', ''),
        ('#' || i.id::text)
      ) AS identity_display_name
    FROM public.software_assignments sa
    INNER JOIN public.software_installations si
      ON si.id = sa.software_installation_id
     AND si.tenant_id = sa.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = si.software_product_id
     AND sp.tenant_id = si.tenant_id
    INNER JOIN public.identities i
      ON i.id = sa.identity_id
     AND i.tenant_id = sa.tenant_id
    WHERE sa.tenant_id = $1
      AND sa.asset_id = $2
      AND sa.id = $3
    LIMIT 1
    `,
    [tenantId, assetId, assignmentId]
  );

  return rows[0] || null;
}

export async function getActiveAllocatedQuantityByEntitlement(
  app,
  tenantId,
  entitlementId,
  excludeAllocationId = null
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      COALESCE(SUM(allocated_quantity), 0)::bigint AS total
    FROM public.software_entitlement_allocations
    WHERE tenant_id = $1
      AND software_entitlement_id = $2
      AND status = 'ACTIVE'
      AND ($3::bigint IS NULL OR id <> $3)
    `,
    [tenantId, entitlementId, excludeAllocationId]
  );

  return Number(rows[0]?.total ?? 0);
}

export async function getActiveAllocatedQuantitiesByEntitlementIds(
  app,
  tenantId,
  entitlementIds
) {
  const normalizedIds = [...new Set(
    (Array.isArray(entitlementIds) ? entitlementIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const { rows } = await app.pg.query(
    `
    SELECT
      software_entitlement_id,
      COALESCE(SUM(allocated_quantity), 0)::bigint AS total
    FROM public.software_entitlement_allocations
    WHERE tenant_id = $1
      AND status = 'ACTIVE'
      AND software_entitlement_id = ANY($2::bigint[])
    GROUP BY software_entitlement_id
    `,
    [tenantId, normalizedIds]
  );

  return new Map(
    rows.map((row) => [
      Number(row.software_entitlement_id),
      Number(row.total ?? 0),
    ])
  );
}

export async function findActiveDuplicateAllocation(
  app,
  tenantId,
  entitlementId,
  allocationBasis,
  assetId,
  installationId,
  assignmentId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      software_entitlement_id,
      asset_id,
      software_installation_id,
      software_assignment_id,
      allocation_basis,
      status
    FROM public.software_entitlement_allocations
    WHERE tenant_id = $1
      AND software_entitlement_id = $2
      AND status = 'ACTIVE'
      AND allocation_basis = $3
      AND (
        ($3 = 'ASSIGNMENT' AND software_assignment_id = $6)
        OR
        ($3 = 'INSTALLATION' AND asset_id = $4 AND software_installation_id = $5)
        OR
        ($3 = 'ASSET' AND asset_id = $4 AND software_installation_id IS NULL AND software_assignment_id IS NULL)
        OR
        ($3 = 'MANUAL' AND asset_id = $4 AND software_installation_id IS NULL AND software_assignment_id IS NULL)
      )
    LIMIT 1
    `,
    [tenantId, entitlementId, allocationBasis, assetId, installationId, assignmentId]
  );

  return rows[0] || null;
}

export async function getEntitlementAllocationByEntitlementAndId(
  app,
  tenantId,
  entitlementId,
  allocationId
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      software_entitlement_id,
      asset_id,
      software_installation_id,
      software_assignment_id,
      allocation_basis,
      allocated_quantity,
      status,
      allocated_at,
      released_at,
      notes,
      created_at,
      updated_at
    FROM public.software_entitlement_allocations
    WHERE tenant_id = $1
      AND software_entitlement_id = $2
      AND id = $3
    LIMIT 1
    `,
    [tenantId, entitlementId, allocationId]
  );

  return rows[0] || null;
}

export async function getEntitlementAllocationDetailById(app, tenantId, allocationId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      sea.id,
      sea.tenant_id,
      sea.software_entitlement_id,
      sea.asset_id,
      sea.software_installation_id,
      sea.software_assignment_id,
      sea.allocation_basis,
      sea.allocated_quantity,
      sea.status,
      sea.allocated_at,
      sea.released_at,
      sea.notes,
      sea.created_at,
      sea.updated_at,

      se.contract_id,
      se.entitlement_code,
      se.entitlement_name,
      se.licensing_metric,
      se.quantity_purchased,
      se.status AS entitlement_status,

      c.contract_code,
      c.contract_name,

      sp.id AS software_product_id,
      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,

      a.asset_tag,
      a.name AS asset_name,

      si.installation_status AS software_installation_status,
      si.installed_version AS software_installation_version,

      sa.assignment_role,
      sa.assignment_status,

      COALESCE(
        NULLIF(to_jsonb(i)->>'identity_code', ''),
        NULLIF(to_jsonb(i)->>'employee_code', ''),
        NULLIF(to_jsonb(i)->>'code', '')
      ) AS identity_code,

      COALESCE(
        NULLIF(to_jsonb(i)->>'full_name', ''),
        NULLIF(to_jsonb(i)->>'display_name', ''),
        NULLIF(to_jsonb(i)->>'identity_name', ''),
        NULLIF(to_jsonb(i)->>'employee_name', ''),
        NULLIF(to_jsonb(i)->>'name', ''),
        NULLIF(to_jsonb(i)->>'email', ''),
        ('#' || i.id::text)
      ) AS identity_display_name
    FROM public.software_entitlement_allocations sea
    INNER JOIN public.software_entitlements se
      ON se.id = sea.software_entitlement_id
     AND se.tenant_id = sea.tenant_id
    INNER JOIN public.contracts c
      ON c.id = se.contract_id
     AND c.tenant_id = se.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = se.software_product_id
     AND sp.tenant_id = se.tenant_id
    INNER JOIN public.assets a
      ON a.id = sea.asset_id
     AND a.tenant_id = sea.tenant_id
    LEFT JOIN public.software_installations si
      ON si.id = sea.software_installation_id
     AND si.tenant_id = sea.tenant_id
    LEFT JOIN public.software_assignments sa
      ON sa.id = sea.software_assignment_id
     AND sa.tenant_id = sea.tenant_id
    LEFT JOIN public.identities i
      ON i.id = sa.identity_id
     AND i.tenant_id = sa.tenant_id
    WHERE sea.tenant_id = $1
      AND sea.id = $2
    LIMIT 1
    `,
    [tenantId, allocationId]
  );

  return rows[0] || null;
}

export async function listEntitlementAllocations(app, tenantId, entitlementId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      sea.id,
      sea.tenant_id,
      sea.software_entitlement_id,
      sea.asset_id,
      sea.software_installation_id,
      sea.software_assignment_id,
      sea.allocation_basis,
      sea.allocated_quantity,
      sea.status,
      sea.allocated_at,
      sea.released_at,
      sea.notes,
      sea.created_at,
      sea.updated_at,

      se.contract_id,
      se.entitlement_code,
      se.entitlement_name,
      se.licensing_metric,
      se.quantity_purchased,
      se.status AS entitlement_status,

      c.contract_code,
      c.contract_name,

      sp.id AS software_product_id,
      sp.product_code AS software_product_code,
      sp.product_name AS software_product_name,

      a.asset_tag,
      a.name AS asset_name,

      si.installation_status AS software_installation_status,
      si.installed_version AS software_installation_version,

      sa.assignment_role,
      sa.assignment_status,

      COALESCE(
        NULLIF(to_jsonb(i)->>'identity_code', ''),
        NULLIF(to_jsonb(i)->>'employee_code', ''),
        NULLIF(to_jsonb(i)->>'code', '')
      ) AS identity_code,

      COALESCE(
        NULLIF(to_jsonb(i)->>'full_name', ''),
        NULLIF(to_jsonb(i)->>'display_name', ''),
        NULLIF(to_jsonb(i)->>'identity_name', ''),
        NULLIF(to_jsonb(i)->>'employee_name', ''),
        NULLIF(to_jsonb(i)->>'name', ''),
        NULLIF(to_jsonb(i)->>'email', ''),
        ('#' || i.id::text)
      ) AS identity_display_name
    FROM public.software_entitlement_allocations sea
    INNER JOIN public.software_entitlements se
      ON se.id = sea.software_entitlement_id
     AND se.tenant_id = sea.tenant_id
    INNER JOIN public.contracts c
      ON c.id = se.contract_id
     AND c.tenant_id = se.tenant_id
    INNER JOIN public.software_products sp
      ON sp.id = se.software_product_id
     AND sp.tenant_id = se.tenant_id
    INNER JOIN public.assets a
      ON a.id = sea.asset_id
     AND a.tenant_id = sea.tenant_id
    LEFT JOIN public.software_installations si
      ON si.id = sea.software_installation_id
     AND si.tenant_id = sea.tenant_id
    LEFT JOIN public.software_assignments sa
      ON sa.id = sea.software_assignment_id
     AND sa.tenant_id = sea.tenant_id
    LEFT JOIN public.identities i
      ON i.id = sa.identity_id
     AND i.tenant_id = sa.tenant_id
    WHERE sea.tenant_id = $1
      AND sea.software_entitlement_id = $2
    ORDER BY sea.updated_at DESC, sea.id DESC
    `,
    [tenantId, entitlementId]
  );

  return rows;
}

export async function createEntitlementAllocation(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.software_entitlement_allocations (
      tenant_id,
      software_entitlement_id,
      asset_id,
      software_installation_id,
      software_assignment_id,
      allocation_basis,
      allocated_quantity,
      status,
      allocated_at,
      released_at,
      notes
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING
      id,
      tenant_id,
      software_entitlement_id,
      asset_id,
      software_installation_id,
      software_assignment_id,
      allocation_basis,
      allocated_quantity,
      status,
      allocated_at,
      released_at,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.software_entitlement_id,
      payload.asset_id,
      payload.software_installation_id,
      payload.software_assignment_id,
      payload.allocation_basis,
      payload.allocated_quantity,
      payload.status,
      payload.allocated_at,
      payload.released_at,
      payload.notes,
    ]
  );

  return rows[0];
}

const UPDATABLE_COLUMNS = {
  status: "status",
  released_at: "released_at",
  notes: "notes",
};

export async function updateEntitlementAllocation(app, tenantId, allocationId, patch) {
  const keys = Object.keys(patch).filter((key) => UPDATABLE_COLUMNS[key]);

  if (keys.length === 0) {
    return getEntitlementAllocationDetailById(app, tenantId, allocationId);
  }

  const values = [];
  const sets = [];

  for (const key of keys) {
    values.push(patch[key]);
    sets.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
  }

  values.push(tenantId);
  values.push(allocationId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.software_entitlement_allocations
    SET
      ${sets.join(", ")},
      updated_at = NOW()
    WHERE tenant_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING
      id,
      tenant_id,
      software_entitlement_id,
      asset_id,
      software_installation_id,
      software_assignment_id,
      allocation_basis,
      allocated_quantity,
      status,
      allocated_at,
      released_at,
      notes,
      created_at,
      updated_at
    `,
    values
  );

  return rows[0] || null;
}
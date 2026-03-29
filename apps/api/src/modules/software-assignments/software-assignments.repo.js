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
      si.created_at,
      si.updated_at,

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

export async function getIdentityById(app, tenantId, identityId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      i.id,
      i.tenant_id,

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
      ) AS identity_display_name,

      NULLIF(to_jsonb(i)->>'email', '') AS identity_email,
      COALESCE(
        NULLIF(to_jsonb(i)->>'status_code', ''),
        NULLIF(to_jsonb(i)->>'status', '')
      ) AS identity_status
    FROM public.identities i
    WHERE i.tenant_id = $1
      AND i.id = $2
    LIMIT 1
    `,
    [tenantId, identityId]
  );

  return rows[0] || null;
}

export async function findSoftwareAssignmentByUniqueMapping(
  app,
  tenantId,
  softwareInstallationId,
  identityId,
  assignmentRole
) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id,
      tenant_id,
      asset_id,
      software_installation_id,
      identity_id,
      assignment_role,
      assignment_status
    FROM public.software_assignments
    WHERE tenant_id = $1
      AND software_installation_id = $2
      AND identity_id = $3
      AND assignment_role = $4
    LIMIT 1
    `,
    [tenantId, softwareInstallationId, identityId, assignmentRole]
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
      id,
      tenant_id,
      asset_id,
      software_installation_id,
      identity_id,
      assignment_role,
      assignment_status,
      assigned_at,
      unassigned_at,
      notes,
      created_at,
      updated_at
    FROM public.software_assignments
    WHERE tenant_id = $1
      AND asset_id = $2
      AND id = $3
    LIMIT 1
    `,
    [tenantId, assetId, assignmentId]
  );

  return rows[0] || null;
}

export async function getSoftwareAssignmentDetailById(app, tenantId, assignmentId) {
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
      sa.created_at,
      sa.updated_at,

      si.software_product_id,
      si.installation_status AS software_installation_status,
      si.installed_version AS software_installation_version,

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
      ) AS identity_display_name,

      NULLIF(to_jsonb(i)->>'email', '') AS identity_email
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
      AND sa.id = $2
    LIMIT 1
    `,
    [tenantId, assignmentId]
  );

  return rows[0] || null;
}

export async function listSoftwareAssignmentsByAsset(app, tenantId, assetId) {
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
      sa.created_at,
      sa.updated_at,

      si.software_product_id,
      si.installation_status AS software_installation_status,
      si.installed_version AS software_installation_version,

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
      ) AS identity_display_name,

      NULLIF(to_jsonb(i)->>'email', '') AS identity_email
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
    ORDER BY
      sa.updated_at DESC,
      sa.id DESC
    `,
    [tenantId, assetId]
  );

  return rows;
}

export async function countActiveAssignmentsBySoftwareProductIds(
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
      si.software_product_id,
      COUNT(*)::bigint AS total
    FROM public.software_assignments sa
    INNER JOIN public.software_installations si
      ON si.id = sa.software_installation_id
     AND si.tenant_id = sa.tenant_id
    WHERE sa.tenant_id = $1
      AND sa.assignment_status = 'ACTIVE'
      AND si.software_product_id = ANY($2::bigint[])
    GROUP BY si.software_product_id
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

export async function createSoftwareAssignment(app, payload) {
  const { rows } = await app.pg.query(
    `
    INSERT INTO public.software_assignments (
      tenant_id,
      asset_id,
      software_installation_id,
      identity_id,
      assignment_role,
      assignment_status,
      assigned_at,
      unassigned_at,
      notes
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    RETURNING
      id,
      tenant_id,
      asset_id,
      software_installation_id,
      identity_id,
      assignment_role,
      assignment_status,
      assigned_at,
      unassigned_at,
      notes,
      created_at,
      updated_at
    `,
    [
      payload.tenant_id,
      payload.asset_id,
      payload.software_installation_id,
      payload.identity_id,
      payload.assignment_role,
      payload.assignment_status,
      payload.assigned_at,
      payload.unassigned_at,
      payload.notes,
    ]
  );

  return rows[0];
}

const UPDATABLE_COLUMNS = {
  assignment_role: "assignment_role",
  assignment_status: "assignment_status",
  assigned_at: "assigned_at",
  unassigned_at: "unassigned_at",
  notes: "notes",
};

export async function updateSoftwareAssignment(app, tenantId, assignmentId, patch) {
  const keys = Object.keys(patch).filter((key) => UPDATABLE_COLUMNS[key]);

  if (keys.length === 0) {
    return getSoftwareAssignmentDetailById(app, tenantId, assignmentId);
  }

  const values = [];
  const sets = [];

  for (const key of keys) {
    values.push(patch[key]);
    sets.push(`${UPDATABLE_COLUMNS[key]} = $${values.length}`);
  }

  values.push(tenantId);
  values.push(assignmentId);

  const { rows } = await app.pg.query(
    `
    UPDATE public.software_assignments
    SET
      ${sets.join(", ")},
      updated_at = NOW()
    WHERE tenant_id = $${values.length - 1}
      AND id = $${values.length}
    RETURNING
      id,
      tenant_id,
      asset_id,
      software_installation_id,
      identity_id,
      assignment_role,
      assignment_status,
      assigned_at,
      unassigned_at,
      notes,
      created_at,
      updated_at
    `,
    values
  );

  return rows[0] || null;
}
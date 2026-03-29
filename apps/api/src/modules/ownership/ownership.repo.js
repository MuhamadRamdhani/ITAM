export async function getAssetById(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      id, tenant_id, asset_tag, asset_type_id, current_state_id,
      status, location_id, owner_department_id, current_custodian_identity_id,
      created_at, updated_at
    FROM public.assets
    WHERE tenant_id = $1 AND id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
  );
  return rows[0] || null;
}

export async function getOwnershipHistory(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      h.id,
      h.asset_id,
      h.owner_department_id,
      h.custodian_identity_id,
      h.location_id,
      h.effective_from,
      h.effective_to,
      h.change_reason,
      h.changed_by,

      d.name AS owner_department_name,

      COALESCE(i.name, i.email) AS custodian_display_name,

      l.name AS location_name

    FROM public.asset_ownership_history h
    LEFT JOIN public.departments d
      ON d.tenant_id = h.tenant_id AND d.id = h.owner_department_id
    LEFT JOIN public.identities i
      ON i.tenant_id = h.tenant_id AND i.id = h.custodian_identity_id
    LEFT JOIN public.locations l
      ON l.tenant_id = h.tenant_id AND l.id = h.location_id
    WHERE h.tenant_id = $1 AND h.asset_id = $2
    ORDER BY h.effective_from DESC, h.id DESC
    `,
    [tenantId, assetId]
  );
  return rows;
}

export async function getCurrentOwnershipHistory(app, tenantId, assetId) {
  const { rows } = await app.pg.query(
    `
    SELECT
      h.id,
      h.asset_id,
      h.owner_department_id,
      h.custodian_identity_id,
      h.location_id,
      h.effective_from,
      h.effective_to,
      h.change_reason,
      h.changed_by
    FROM public.asset_ownership_history h
    WHERE h.tenant_id = $1 AND h.asset_id = $2 AND h.effective_to IS NULL
    LIMIT 1
    `,
    [tenantId, assetId]
  );
  return rows[0] || null;
}

export async function departmentExists(app, tenantId, departmentId) {
  const { rowCount } = await app.pg.query(
    `SELECT 1 FROM public.departments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, departmentId]
  );
  return rowCount > 0;
}

export async function identityExists(app, tenantId, identityId) {
  const { rowCount } = await app.pg.query(
    `SELECT 1 FROM public.identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, identityId]
  );
  return rowCount > 0;
}

export async function locationExists(app, tenantId, locationId) {
  const { rowCount } = await app.pg.query(
    `SELECT 1 FROM public.locations WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, locationId]
  );
  return rowCount > 0;
}

export async function changeOwnership(
  app,
  {
    tenantId,
    assetId,
    ownerDepartmentId,
    custodianIdentityId,
    locationId,
    changeReason,
    changedBy,
  }
) {
  const client = await app.pg.connect();
  try {
    await client.query("BEGIN");

    // Close current ownership record
    await client.query(
      `
      UPDATE public.asset_ownership_history
      SET effective_to = NOW()
      WHERE tenant_id = $1 AND asset_id = $2 AND effective_to IS NULL
      `,
      [tenantId, assetId]
    );

    // Insert new ownership record
    const insResult = await client.query(
      `
      INSERT INTO public.asset_ownership_history
        (tenant_id, asset_id, owner_department_id, custodian_identity_id, location_id,
         effective_from, effective_to, change_reason, changed_by)
      VALUES ($1, $2, $3, $4, $5, NOW(), NULL, $6, $7)
      RETURNING id, effective_from
      `,
      [
        tenantId,
        assetId,
        ownerDepartmentId,
        custodianIdentityId,
        locationId,
        changeReason,
        changedBy,
      ]
    );

    // Update asset current ownership
    await client.query(
      `
      UPDATE public.assets
      SET owner_department_id = $3,
          current_custodian_identity_id = $4,
          location_id = $5,
          updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, assetId, ownerDepartmentId, custodianIdentityId, locationId]
    );

    await client.query("COMMIT");

    return {
      id: insResult.rows[0].id,
      effective_from: insResult.rows[0].effective_from,
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

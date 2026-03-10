export default async function ownershipRoutes(app) {
  if (!app.pg) throw new Error("Postgres plugin not registered (app.pg missing)");

  const tenantIdOf = (req) => Number(req.tenantId || 1);

  async function exists(table, tenantId, id) {
    const r = await app.pg.query(
      `SELECT id FROM ${table} WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id]
    );
    return r.rowCount > 0;
  }

  // GET /api/v1/assets/:id/ownership-history
  app.get("/:id/ownership-history", async (req, reply) => {
    const tenantId = tenantIdOf(req);
    const assetId = Number(req.params.id);

    if (!Number.isFinite(assetId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Invalid asset id" },
      });
    }

    const assetOk = await exists("assets", tenantId, assetId);
    if (!assetOk) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Asset not found" },
      });
    }

    const rows = await app.pg.query(
      `SELECT
         h.id,
         h.owner_department_id,
         h.custodian_identity_id,
         h.location_id,
         h.effective_from,
         h.effective_to,
         h.change_reason,

         d.name AS owner_department_name,

         COALESCE(
           row_to_json(i)->>'display_name',
           row_to_json(i)->>'full_name',
           row_to_json(i)->>'name',
           row_to_json(i)->>'username',
           row_to_json(i)->>'email'
         ) AS custodian_display_name,

         l.name AS location_name

       FROM asset_ownership_history h
       LEFT JOIN departments d
         ON d.tenant_id = h.tenant_id AND d.id = h.owner_department_id
       LEFT JOIN identities i
         ON i.tenant_id = h.tenant_id AND i.id = h.custodian_identity_id
       LEFT JOIN locations l
         ON l.tenant_id = h.tenant_id AND l.id = h.location_id
       WHERE h.tenant_id=$1 AND h.asset_id=$2
       ORDER BY h.effective_from DESC, h.id DESC`,
      [tenantId, assetId]
    );

    return reply.send({ ok: true, data: { items: rows.rows } });
  });

  // POST /api/v1/assets/:id/ownership-changes
  app.post("/:id/ownership-changes", async (req, reply) => {
    const tenantId = tenantIdOf(req);
    const assetId = Number(req.params.id);

    if (!Number.isFinite(assetId)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Invalid asset id" },
      });
    }

    const assetOk = await exists("assets", tenantId, assetId);
    if (!assetOk) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Asset not found" },
      });
    }

    const body = req.body || {};
    const ownerDepartmentId =
      body.owner_department_id == null ? null : Number(body.owner_department_id);
    const custodianIdentityId =
      body.custodian_identity_id == null ? null : Number(body.custodian_identity_id);
    const locationId = body.location_id == null ? null : Number(body.location_id);
    const reason = body.change_reason ? String(body.change_reason).trim() : null;

    // no-FK enforcement
    if (ownerDepartmentId != null) {
      const ok = await exists("departments", tenantId, ownerDepartmentId);
      if (!ok)
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_REF", message: "Invalid owner_department_id" },
        });
    }
    if (custodianIdentityId != null) {
      const ok = await exists("identities", tenantId, custodianIdentityId);
      if (!ok)
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_REF", message: "Invalid custodian_identity_id" },
        });
    }
    if (locationId != null) {
      const ok = await exists("locations", tenantId, locationId);
      if (!ok)
        return reply.code(400).send({
          ok: false,
          error: { code: "INVALID_REF", message: "Invalid location_id" },
        });
    }

    // transaction
    const client = await app.pg.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE asset_ownership_history
         SET effective_to = NOW()
         WHERE tenant_id=$1 AND asset_id=$2 AND effective_to IS NULL`,
        [tenantId, assetId]
      );

      const ins = await client.query(
        `INSERT INTO asset_ownership_history
          (tenant_id, asset_id, owner_department_id, custodian_identity_id, location_id, effective_from, effective_to, change_reason)
         VALUES ($1,$2,$3,$4,$5,NOW(),NULL,$6)
         RETURNING id`,
        [tenantId, assetId, ownerDepartmentId, custodianIdentityId, locationId, reason]
      );

      await client.query(
        `UPDATE assets
         SET owner_department_id=$3,
             current_custodian_identity_id=$4,
             location_id=$5
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId, assetId, ownerDepartmentId, custodianIdentityId, locationId]
      );

      await client.query("COMMIT");
      return reply.send({ ok: true, data: { id: ins.rows[0].id } });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  });
}
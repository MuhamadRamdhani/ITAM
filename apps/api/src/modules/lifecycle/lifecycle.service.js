function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export async function applyApprovedLifecycleTransition(app, { tenantId, approval }) {
  const payload = approval.payload || {};
  const t = payload.transition || {};

  const assetId = toNum(payload.asset_id ?? approval.subject_id);

  const fromStateId = toNum(
    payload.from_state_id ??
      t.from_state_id ??
      payload.from_id ??
      t.from_id
  );

  const toStateId = toNum(
    payload.to_state_id ??
      t.to_state_id ??
      payload.to_id ??
      t.to_id
  );

  const reason =
    payload.reason ??
    payload.notes ??
    approval.decision_reason ??
    null;

  if (!tenantId) {
    return {
      applied: false,
      reason: 'missing_tenant_id',
      asset_id: assetId ?? null,
      from_state_id: fromStateId ?? null,
      to_state_id: toStateId ?? null,
    };
  }

  if (!assetId || !fromStateId || !toStateId) {
    return {
      applied: false,
      reason: 'missing_payload_ids',
      asset_id: assetId ?? null,
      from_state_id: fromStateId ?? null,
      to_state_id: toStateId ?? null,
    };
  }

  // Optional hardening:
  // pastikan asset masih ada dan current_state_id masih sama dengan fromStateId
  const aRes = await app.pg.query(
    `
    SELECT id, tenant_id, current_state_id
    FROM assets
    WHERE tenant_id = $1
      AND id = $2
    LIMIT 1
    `,
    [tenantId, assetId]
  );

  const asset = aRes.rows[0];
  if (!asset) {
    return {
      applied: false,
      reason: 'asset_not_found',
      asset_id: assetId,
      from_state_id: fromStateId,
      to_state_id: toStateId,
    };
  }

  if (Number(asset.current_state_id) !== Number(fromStateId)) {
    return {
      applied: false,
      reason: 'state_mismatch',
      asset_id: assetId,
      from_state_id: fromStateId,
      to_state_id: toStateId,
      current_state_id: asset.current_state_id,
    };
  }

  // 1) insert history (append-only)
  await app.pg.query(
    `
    INSERT INTO asset_state_history
      (tenant_id, asset_id, from_state_id, to_state_id, reason, created_at)
    VALUES
      ($1, $2, $3, $4, $5, now())
    `,
    [tenantId, assetId, fromStateId, toStateId, reason]
  );

  // 2) update asset snapshot
  await app.pg.query(
    `
    UPDATE assets
    SET current_state_id = $3,
        updated_at = now()
    WHERE tenant_id = $1
      AND id = $2
    `,
    [tenantId, assetId, toStateId]
  );

  return {
    applied: true,
    asset_id: assetId,
    from_state_id: fromStateId,
    to_state_id: toStateId,
  };
}
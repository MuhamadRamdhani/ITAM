function normalizeInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return n;
}

export async function getDashboardSummary(db, { tenantId }) {
  const [
    assetsCountRes,
    approvalsPendingRes,
    documentsInReviewRes,
    evidenceFilesRes,
    activeScopeVersionsRes,
    openContextEntriesRes,
    openStakeholderEntriesRes,
    assetsByStateRes,
    assetsByTypeRes,
  ] = await Promise.all([
    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.assets
      WHERE tenant_id = $1
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.approvals
      WHERE tenant_id = $1
        AND UPPER(status_code) = 'PENDING'
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.documents
      WHERE tenant_id = $1
        AND UPPER(status_code) = 'IN_REVIEW'
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.evidence_files
      WHERE tenant_id = $1
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.scope_versions
      WHERE tenant_id = $1
        AND UPPER(status) = 'ACTIVE'
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.context_register
      WHERE tenant_id = $1
        AND UPPER(status_code) = 'OPEN'
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT COUNT(*)::int AS total
      FROM public.stakeholders_register
      WHERE tenant_id = $1
        AND UPPER(status_code) = 'OPEN'
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT
        COALESCE(ls.code, 'UNKNOWN') AS state_code,
        COALESCE(ls.display_name, ls.code, 'Unknown') AS state_label,
        COUNT(*)::int AS total
      FROM public.assets a
      LEFT JOIN public.lifecycle_states ls
        ON ls.id = a.current_state_id
       AND ls.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      GROUP BY
        COALESCE(ls.code, 'UNKNOWN'),
        COALESCE(ls.display_name, ls.code, 'Unknown')
      ORDER BY total DESC, state_code ASC
      `,
      [tenantId]
    ),

    db.query(
      `
      SELECT
        COALESCE(at.code, 'UNKNOWN') AS asset_type_code,
        COALESCE(at.display_name, at.code, 'Unknown') AS asset_type_label,
        COUNT(*)::int AS total
      FROM public.assets a
      LEFT JOIN public.asset_types at
        ON at.id = a.asset_type_id
       AND at.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1
      GROUP BY
        COALESCE(at.code, 'UNKNOWN'),
        COALESCE(at.display_name, at.code, 'Unknown')
      ORDER BY total DESC, asset_type_code ASC
      `,
      [tenantId]
    ),
  ]);

  return {
    totals: {
      assets: normalizeInt(assetsCountRes.rows?.[0]?.total, 0),
      pending_approvals: normalizeInt(approvalsPendingRes.rows?.[0]?.total, 0),
      documents_in_review: normalizeInt(documentsInReviewRes.rows?.[0]?.total, 0),
      evidence_files: normalizeInt(evidenceFilesRes.rows?.[0]?.total, 0),
      active_scope_versions: normalizeInt(activeScopeVersionsRes.rows?.[0]?.total, 0),
      open_context_entries: normalizeInt(openContextEntriesRes.rows?.[0]?.total, 0),
      open_stakeholder_entries: normalizeInt(openStakeholderEntriesRes.rows?.[0]?.total, 0),
    },

    assets_by_state: (assetsByStateRes.rows ?? []).map((row) => ({
      state_code: row.state_code,
      state_label: row.state_label,
      total: normalizeInt(row.total, 0),
    })),

    assets_by_type: (assetsByTypeRes.rows ?? []).map((row) => ({
      asset_type_code: row.asset_type_code,
      asset_type_label: row.asset_type_label,
      total: normalizeInt(row.total, 0),
    })),
  };
}
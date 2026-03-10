import { Type } from '@sinclair/typebox';
import { createApprovalForLifecycleTransition } from '../approvals/approvals.service.js';

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function parseGateRules(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function evalGate(asset, gateRules) {
  const reasons = [];

  if (gateRules?.require_owner) {
    if (!asset.owner_department_id) reasons.push('Owner (Department) wajib diisi');
  }
  if (gateRules?.require_custodian) {
    if (!asset.current_custodian_identity_id) reasons.push('Custodian (Identity) wajib diisi');
  }
  if (gateRules?.require_location) {
    if (!asset.location_id) reasons.push('Location wajib diisi');
  }

  return { blocked: reasons.length > 0, blocked_reasons: reasons };
}

function buildLifecycleApprovalPayload({ assetId, fromState, toState, reason }) {
  const fromStateId = toNum(fromState?.id ?? fromState?.state_id ?? fromState?.from_state_id) ?? null;
  const toStateId = toNum(toState?.id ?? toState?.state_id ?? toState?.to_state_id) ?? null;

  const fromCode = fromState?.code ?? null;
  const fromLabel = fromState?.label ?? fromState?.display_name ?? null;

  const toCode = toState?.code ?? null;
  const toLabel = toState?.label ?? toState?.display_name ?? null;

  return {
    // required by applyApprovedLifecycleTransition
    asset_id: assetId,
    from_state_id: fromStateId,
    to_state_id: toStateId,

    // used by Asset Approvals tab (expects from_state_* keys)
    from_state_code: fromCode,
    from_state_label: fromLabel,
    to_state_code: toCode,
    to_state_label: toLabel,

    // legacy keys used by /approvals page & /approvals/[id] page
    from_code: fromCode,
    from_label: fromLabel,
    to_code: toCode,
    to_label: toLabel,

    // optional note
    reason: reason ?? null,

    // keep nested transition too (repo join + future-proof)
    transition: {
      from_state_id: fromStateId,
      to_state_id: toStateId,
    },
  };
}

export default async function lifecycleRoutes(app) {
  // =========================
  // GET /:id/transition-options
  // =========================
  app.get('/:id/transition-options', {
    schema: {
      params: Type.Object({ id: Type.String() }),
    },
  }, async (req, reply) => {
    const tenantId = req.requestContext?.tenantId ?? 1;
    const assetId = Number(req.params.id);

    if (!Number.isFinite(assetId)) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid asset id' } });
    }

    // asset snapshot
    const aRes = await app.pg.query(
      `
      SELECT
        id, tenant_id, asset_tag, name,
        current_state_id,
        owner_department_id,
        current_custodian_identity_id,
        location_id
      FROM assets
      WHERE tenant_id=$1 AND id=$2
      `,
      [tenantId, assetId]
    );
    const asset = aRes.rows[0];
    if (!asset) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } });
    }

    const csRes = await app.pg.query(
      `SELECT id, code, display_name AS label FROM lifecycle_states WHERE tenant_id=$1 AND id=$2`,
      [tenantId, asset.current_state_id]
    );
    const current = csRes.rows[0] || { id: String(asset.current_state_id), code: null, label: null };

    // transitions from current_state_id
    const tRes = await app.pg.query(
      `
      SELECT
        lt.to_state_id,
        ts.code  AS to_code,
        ts.display_name AS to_label,
        lt.require_approval,
        lt.require_evidence,
        lt.gate_rules
      FROM lifecycle_transitions lt
      JOIN lifecycle_states ts
        ON ts.tenant_id = lt.tenant_id AND ts.id = lt.to_state_id
      WHERE lt.tenant_id = $1 AND lt.from_state_id = $2
      ORDER BY ts.sort_order ASC, ts.display_name ASC
      `,
      [tenantId, asset.current_state_id]
    );

    const options = tRes.rows.map((r) => {
      const gateRules = parseGateRules(r.gate_rules);
      const gate = evalGate(asset, gateRules);

      return {
        to_state_id: String(r.to_state_id),
        to_code: r.to_code,
        to_label: r.to_label,
        require_approval: Boolean(r.require_approval),
        require_evidence: Boolean(r.require_evidence),
        gate_rules: gateRules,
        blocked: gate.blocked,
        blocked_reasons: gate.blocked_reasons,
      };
    });

    return reply.send({
      ok: true,
      data: {
        current: {
          id: String(current.id),
          code: current.code,
          label: current.label,
        },
        options,
      },
    });
  });

  // =========================
  // POST /:id/transition
  // =========================
  app.post('/:id/transition', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        to_state_code: Type.Optional(Type.String()),
        to_state_id: Type.Optional(Type.Union([Type.String(), Type.Number()])),
        reason: Type.Optional(Type.String()),
      }),
    },
  }, async (req, reply) => {
    const tenantId = req.requestContext?.tenantId ?? 1;
    const assetId = Number(req.params.id);

    if (!Number.isFinite(assetId)) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid asset id' } });
    }

    // get asset snapshot (current_state_id + gates fields)
    const aRes = await app.pg.query(
      `
      SELECT
        id, tenant_id, asset_tag, name,
        current_state_id,
        owner_department_id,
        current_custodian_identity_id,
        location_id
      FROM assets
      WHERE tenant_id=$1 AND id=$2
      `,
      [tenantId, assetId]
    );
    const asset = aRes.rows[0];
    if (!asset) {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } });
    }

    // determine target by code or id
    let toState = null;

    if (req.body.to_state_id != null) {
      const toStateId = toNum(req.body.to_state_id);
      if (toStateId) {
        const sRes = await app.pg.query(
          `SELECT id, code, display_name AS label FROM lifecycle_states WHERE tenant_id=$1 AND id=$2`,
          [tenantId, toStateId]
        );
        toState = sRes.rows[0] || null;
      }
    }

    if (!toState && req.body.to_state_code) {
      const sRes = await app.pg.query(
        `SELECT id, code, display_name AS label FROM lifecycle_states WHERE tenant_id=$1 AND code=$2`,
        [tenantId, req.body.to_state_code]
      );
      toState = sRes.rows[0] || null;
    }

    if (!toState) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid to_state' } });
    }

    const csRes = await app.pg.query(
      `SELECT id, code, display_name AS label FROM lifecycle_states WHERE tenant_id=$1 AND id=$2`,
      [tenantId, asset.current_state_id]
    );
    const current = csRes.rows[0];
    if (!current) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid current_state' } });
    }

    // validate transition exists from current -> to
    const tRes = await app.pg.query(
      `
      SELECT
        lt.to_state_id,
        ts.code  AS to_code,
        ts.display_name AS to_label,
        lt.require_approval,
        lt.require_evidence,
        lt.gate_rules
      FROM lifecycle_transitions lt
      JOIN lifecycle_states ts
        ON ts.tenant_id = lt.tenant_id AND ts.id = lt.to_state_id
      WHERE lt.tenant_id = $1 AND lt.from_state_id = $2 AND lt.to_state_id = $3
      LIMIT 1
      `,
      [tenantId, asset.current_state_id, toState.id]
    );
    const transition = tRes.rows[0];
    if (!transition) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: 'Transition not allowed' },
      });
    }

    // gate check
    const gateRules = parseGateRules(transition.gate_rules);
    const gate = evalGate(asset, gateRules);
    if (gate.blocked) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: `Gate blocked: ${gate.blocked_reasons.join(', ')}` },
      });
    }

    const reason = req.body.reason ?? null;

    if (Boolean(transition.require_approval)) {
      const payload = buildLifecycleApprovalPayload({
        assetId: asset.id,
        fromState: {
          id: asset.current_state_id,
          code: current.code,
          label: current.label,
        },
        toState: {
          id: transition.to_state_id,
          code: transition.to_code,
          label: transition.to_label,
        },
        reason,
      });

      const { created, approval } = await createApprovalForLifecycleTransition(app, {
        tenantId,
        assetId: asset.id,
        requestedBy: req.requestContext?.identityId ?? null,
        payload,
      });

      return reply.send({
        ok: true,
        data: {
          mode: 'APPROVAL_REQUIRED',
          created,
          approval_id: approval?.id ?? null,
        },
      });
    }

    await app.pg.query(
      `
      INSERT INTO asset_state_history
        (tenant_id, asset_id, from_state_id, to_state_id, reason, created_at)
      VALUES
        ($1, $2, $3, $4, $5, now())
      `,
      [tenantId, asset.id, asset.current_state_id, toState.id, reason]
    );

    await app.pg.query(
      `
      UPDATE assets
      SET current_state_id = $3, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, asset.id, toState.id]
    );

    return reply.send({
      ok: true,
      data: {
        mode: 'APPLIED',
        asset_id: asset.id,
        from: { id: String(current.id), code: current.code, label: current.label },
        to: { id: String(toState.id), code: toState.code, label: toState.label },
      },
    });
  });

  // =========================
  // GET /:id/state-history
  // =========================
  app.get('/:id/state-history', {
    schema: {
      params: Type.Object({ id: Type.String() }),
    },
  }, async (req, reply) => {
    const tenantId = req.requestContext?.tenantId ?? 1;
    const assetId = Number(req.params.id);

    if (!Number.isFinite(assetId)) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid asset id' } });
    }

    const res = await app.pg.query(
      `
      SELECT
        h.id,
        h.from_state_id,
        fs.code  AS from_code,
        fs.display_name AS from_label,
        h.to_state_id,
        ts.code  AS to_code,
        ts.display_name AS to_label,
        h.reason,
        h.created_at
      FROM asset_state_history h
      LEFT JOIN lifecycle_states fs
        ON fs.tenant_id = h.tenant_id AND fs.id = h.from_state_id
      LEFT JOIN lifecycle_states ts
        ON ts.tenant_id = h.tenant_id AND ts.id = h.to_state_id
      WHERE h.tenant_id = $1 AND h.asset_id = $2
      ORDER BY h.created_at DESC
      `,
      [tenantId, assetId]
    );

    return reply.send({ ok: true, data: { items: res.rows } });
  });
}
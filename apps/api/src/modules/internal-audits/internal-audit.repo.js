function ensureDb(db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('DB adapter is not available. Expected fastify.db.query(...) or fastify.pg.query(...).');
  }
  return db;
}

export function buildInternalAuditRepo({ db }) {
  const conn = ensureDb(db);

  async function listPlans({
    tenantId,
    q,
    status,
    auditType,
    limit,
    offset,
  }) {
    const values = [tenantId];
    let idx = values.length + 1;

    let where = `WHERE p.tenant_id = $1`;

    if (q) {
      where += ` AND (p.audit_code ILIKE $${idx} OR p.audit_title ILIKE $${idx})`;
      values.push(`%${q}%`);
      idx += 1;
    }

    if (status && status !== 'ALL') {
      where += ` AND p.status = $${idx}`;
      values.push(status);
      idx += 1;
    }

    if (auditType && auditType !== 'ALL') {
      where += ` AND p.audit_type = $${idx}`;
      values.push(auditType);
      idx += 1;
    }

    values.push(limit);
    const limitIndex = idx;
    idx += 1;

    values.push(offset);
    const offsetIndex = idx;

    const sql = `
      SELECT
        p.id,
        p.tenant_id,
        p.audit_code,
        p.audit_title,
        p.audit_type,
        p.status,
        p.scope_summary,
        p.objective,
        p.planned_start_date,
        p.planned_end_date,
        p.actual_start_date,
        p.actual_end_date,
        p.lead_auditor_identity_id,
        p.auditee_summary,
        p.notes,
        p.created_by,
        p.updated_by,
        p.created_at,
        p.updated_at,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_findings f
          WHERE f.tenant_id = p.tenant_id
            AND f.audit_plan_id = p.id
        ) AS findings_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_checklist_items ci
          WHERE ci.tenant_id = p.tenant_id
            AND ci.audit_plan_id = p.id
        ) AS checklist_items_count
      FROM internal_audit_plans p
      ${where}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `;

    const result = await conn.query(sql, values);
    return result.rows;
  }

  async function countPlans({
    tenantId,
    q,
    status,
    auditType,
  }) {
    const values = [tenantId];
    let idx = values.length + 1;

    let where = `WHERE p.tenant_id = $1`;

    if (q) {
      where += ` AND (p.audit_code ILIKE $${idx} OR p.audit_title ILIKE $${idx})`;
      values.push(`%${q}%`);
      idx += 1;
    }

    if (status && status !== 'ALL') {
      where += ` AND p.status = $${idx}`;
      values.push(status);
      idx += 1;
    }

    if (auditType && auditType !== 'ALL') {
      where += ` AND p.audit_type = $${idx}`;
      values.push(auditType);
      idx += 1;
    }

    const sql = `
      SELECT COUNT(*)::int AS total_items
      FROM internal_audit_plans p
      ${where}
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.total_items ?? 0;
  }

  async function findPlanById({ tenantId, id }) {
    const sql = `
      SELECT
        p.id,
        p.tenant_id,
        p.audit_code,
        p.audit_title,
        p.audit_type,
        p.status,
        p.scope_summary,
        p.objective,
        p.planned_start_date,
        p.planned_end_date,
        p.actual_start_date,
        p.actual_end_date,
        p.lead_auditor_identity_id,
        p.auditee_summary,
        p.notes,
        p.created_by,
        p.updated_by,
        p.created_at,
        p.updated_at,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_plan_members m
          WHERE m.tenant_id = p.tenant_id
            AND m.audit_plan_id = p.id
        ) AS members_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_checklist_sections s
          WHERE s.tenant_id = p.tenant_id
            AND s.audit_plan_id = p.id
        ) AS sections_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_checklist_items ci
          WHERE ci.tenant_id = p.tenant_id
            AND ci.audit_plan_id = p.id
        ) AS checklist_items_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_checklist_items ci
          WHERE ci.tenant_id = p.tenant_id
            AND ci.audit_plan_id = p.id
            AND ci.is_mandatory = TRUE
        ) AS mandatory_items_count,
        (
          SELECT COUNT(DISTINCT r.checklist_item_id)::int
          FROM internal_audit_checklist_results r
          WHERE r.tenant_id = p.tenant_id
            AND r.audit_plan_id = p.id
        ) AS assessed_items_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_findings f
          WHERE f.tenant_id = p.tenant_id
            AND f.audit_plan_id = p.id
        ) AS findings_count,
        (
          SELECT COUNT(*)::int
          FROM internal_audit_findings f
          WHERE f.tenant_id = p.tenant_id
            AND f.audit_plan_id = p.id
            AND f.status <> 'CLOSED'
        ) AS open_findings_count
      FROM internal_audit_plans p
      WHERE p.tenant_id = $1
        AND p.id = $2
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, id]);
    return result.rows[0] ?? null;
  }

  async function insertPlan({
    tenantId,
    auditCode,
    auditTitle,
    auditType,
    scopeSummary,
    objective,
    plannedStartDate,
    plannedEndDate,
    leadAuditorIdentityId,
    auditeeSummary,
    notes,
    userId,
  }) {
    const sql = `
      INSERT INTO internal_audit_plans (
        tenant_id,
        audit_code,
        audit_title,
        audit_type,
        status,
        scope_summary,
        objective,
        planned_start_date,
        planned_end_date,
        lead_auditor_identity_id,
        auditee_summary,
        notes,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10, $11, $12, $12
      )
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditCode,
      auditTitle,
      auditType,
      scopeSummary,
      objective,
      plannedStartDate,
      plannedEndDate,
      leadAuditorIdentityId,
      auditeeSummary,
      notes,
      userId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updatePlan({
    tenantId,
    id,
    patch,
    userId,
  }) {
    const fieldMap = {
      audit_code: 'audit_code',
      audit_title: 'audit_title',
      audit_type: 'audit_type',
      scope_summary: 'scope_summary',
      objective: 'objective',
      planned_start_date: 'planned_start_date',
      planned_end_date: 'planned_end_date',
      lead_auditor_identity_id: 'lead_auditor_identity_id',
      auditee_summary: 'auditee_summary',
      notes: 'notes',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
    }

    sets.push(`updated_by = $${idx}`);
    values.push(userId);
    idx += 1;

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(id);
    const idIndex = idx;

    const sql = `
      UPDATE internal_audit_plans
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND id = $${idIndex}
      RETURNING id
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.id ?? null;
  }

  async function updatePlanLeadAuditor({
    tenantId,
    auditPlanId,
    leadAuditorIdentityId,
    userId,
  }) {
    const sql = `
      UPDATE internal_audit_plans
      SET
        lead_auditor_identity_id = $1,
        updated_by = $2
      WHERE tenant_id = $3
        AND id = $4
      RETURNING id
    `;

    const result = await conn.query(sql, [
      leadAuditorIdentityId,
      userId,
      tenantId,
      auditPlanId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updatePlanStatus({
    tenantId,
    auditPlanId,
    status,
    actualStartDate = undefined,
    actualEndDate = undefined,
    notes = undefined,
    userId,
  }) {
    const sets = ['status = $1', 'updated_by = $2'];
    const values = [status, userId];
    let idx = 3;

    if (actualStartDate !== undefined) {
      sets.push(`actual_start_date = $${idx}`);
      values.push(actualStartDate);
      idx += 1;
    }

    if (actualEndDate !== undefined) {
      sets.push(`actual_end_date = $${idx}`);
      values.push(actualEndDate);
      idx += 1;
    }

    if (notes !== undefined) {
      sets.push(`notes = $${idx}`);
      values.push(notes);
      idx += 1;
    }

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(auditPlanId);
    const planIndex = idx;

    const sql = `
      UPDATE internal_audit_plans
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND id = $${planIndex}
      RETURNING id, status, actual_start_date, actual_end_date, notes
    `;

    const result = await conn.query(sql, values);
    return result.rows[0] ?? null;
  }

  async function findIdentityById({ tenantId, id }) {
    const sql = `
      SELECT *
      FROM identities
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, id]);
    return result.rows[0] ?? null;
  }

  async function listMembers({ tenantId, auditPlanId }) {
    const sql = `
      SELECT
        m.id,
        m.tenant_id,
        m.audit_plan_id,
        m.identity_id,
        m.member_role,
        m.notes,
        m.created_at
      FROM internal_audit_plan_members m
      WHERE m.tenant_id = $1
        AND m.audit_plan_id = $2
      ORDER BY
        CASE m.member_role
          WHEN 'LEAD_AUDITOR' THEN 1
          WHEN 'AUDITOR' THEN 2
          WHEN 'AUDITEE' THEN 3
          ELSE 4
        END,
        m.id ASC
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows;
  }

  async function findMemberById({ tenantId, auditPlanId, memberId }) {
    const sql = `
      SELECT
        m.id,
        m.tenant_id,
        m.audit_plan_id,
        m.identity_id,
        m.member_role,
        m.notes,
        m.created_at
      FROM internal_audit_plan_members m
      WHERE m.tenant_id = $1
        AND m.audit_plan_id = $2
        AND m.id = $3
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId, memberId]);
    return result.rows[0] ?? null;
  }

  async function findLeadAuditorMember({ tenantId, auditPlanId }) {
    const sql = `
      SELECT
        m.id,
        m.identity_id,
        m.member_role
      FROM internal_audit_plan_members m
      WHERE m.tenant_id = $1
        AND m.audit_plan_id = $2
        AND m.member_role = 'LEAD_AUDITOR'
      ORDER BY m.id ASC
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows[0] ?? null;
  }

  async function insertMember({
    tenantId,
    auditPlanId,
    identityId,
    memberRole,
    notes,
  }) {
    const sql = `
      INSERT INTO internal_audit_plan_members (
        tenant_id,
        audit_plan_id,
        identity_id,
        member_role,
        notes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditPlanId,
      identityId,
      memberRole,
      notes,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function deleteMember({
    tenantId,
    auditPlanId,
    memberId,
  }) {
    const sql = `
      DELETE FROM internal_audit_plan_members
      WHERE tenant_id = $1
        AND audit_plan_id = $2
        AND id = $3
      RETURNING id, identity_id, member_role
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId, memberId]);
    return result.rows[0] ?? null;
  }

  async function listChecklistSections({ tenantId, auditPlanId }) {
    const sql = `
      SELECT
        s.id,
        s.tenant_id,
        s.audit_plan_id,
        s.title,
        s.description,
        s.clause_code,
        s.sort_order,
        s.created_at,
        s.updated_at
      FROM internal_audit_checklist_sections s
      WHERE s.tenant_id = $1
        AND s.audit_plan_id = $2
      ORDER BY s.sort_order ASC, s.id ASC
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows;
  }

  async function findChecklistSectionById({
    tenantId,
    auditPlanId,
    sectionId,
  }) {
    const sql = `
      SELECT
        s.id,
        s.tenant_id,
        s.audit_plan_id,
        s.title,
        s.description,
        s.clause_code,
        s.sort_order,
        s.created_at,
        s.updated_at
      FROM internal_audit_checklist_sections s
      WHERE s.tenant_id = $1
        AND s.audit_plan_id = $2
        AND s.id = $3
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId, sectionId]);
    return result.rows[0] ?? null;
  }

  async function insertChecklistSection({
    tenantId,
    auditPlanId,
    title,
    description,
    clauseCode,
    sortOrder,
  }) {
    const sql = `
      INSERT INTO internal_audit_checklist_sections (
        tenant_id,
        audit_plan_id,
        title,
        description,
        clause_code,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditPlanId,
      title,
      description,
      clauseCode,
      sortOrder,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updateChecklistSection({
    tenantId,
    auditPlanId,
    sectionId,
    patch,
  }) {
    const fieldMap = {
      title: 'title',
      description: 'description',
      clause_code: 'clause_code',
      sort_order: 'sort_order',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
    }

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(auditPlanId);
    const planIndex = idx;
    idx += 1;

    values.push(sectionId);
    const sectionIndex = idx;

    const sql = `
      UPDATE internal_audit_checklist_sections
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND audit_plan_id = $${planIndex}
        AND id = $${sectionIndex}
      RETURNING id
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.id ?? null;
  }

  async function listChecklistItems({ tenantId, auditPlanId }) {
    const sql = `
      SELECT
        i.id,
        i.tenant_id,
        i.audit_plan_id,
        i.section_id,
        s.title AS section_title,
        i.item_code,
        i.requirement_text,
        i.expected_evidence,
        i.clause_code,
        i.sort_order,
        i.is_mandatory,
        i.created_at,
        i.updated_at,
        lr.result_id AS latest_result_id,
        lr.result_status AS latest_result_status,
        lr.observation_notes AS latest_observation_notes,
        lr.assessed_by_identity_id AS latest_assessed_by_identity_id,
        lr.assessed_at AS latest_assessed_at
      FROM internal_audit_checklist_items i
      LEFT JOIN internal_audit_checklist_sections s
        ON s.tenant_id = i.tenant_id
       AND s.audit_plan_id = i.audit_plan_id
       AND s.id = i.section_id
      LEFT JOIN LATERAL (
        SELECT
          r.id AS result_id,
          r.result_status,
          r.observation_notes,
          r.assessed_by_identity_id,
          r.assessed_at
        FROM internal_audit_checklist_results r
        WHERE r.tenant_id = i.tenant_id
          AND r.audit_plan_id = i.audit_plan_id
          AND r.checklist_item_id = i.id
        ORDER BY r.assessed_at DESC, r.id DESC
        LIMIT 1
      ) lr ON TRUE
      WHERE i.tenant_id = $1
        AND i.audit_plan_id = $2
      ORDER BY
        COALESCE(s.sort_order, 999999) ASC,
        COALESCE(s.id, 999999) ASC,
        i.sort_order ASC,
        i.id ASC
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows;
  }

  async function findChecklistItemById({
    tenantId,
    auditPlanId,
    itemId,
  }) {
    const sql = `
      SELECT
        i.id,
        i.tenant_id,
        i.audit_plan_id,
        i.section_id,
        i.item_code,
        i.requirement_text,
        i.expected_evidence,
        i.clause_code,
        i.sort_order,
        i.is_mandatory,
        i.created_at,
        i.updated_at
      FROM internal_audit_checklist_items i
      WHERE i.tenant_id = $1
        AND i.audit_plan_id = $2
        AND i.id = $3
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId, itemId]);
    return result.rows[0] ?? null;
  }

  async function countChecklistItems({ tenantId, auditPlanId }) {
    const sql = `
      SELECT COUNT(*)::int AS total_items
      FROM internal_audit_checklist_items
      WHERE tenant_id = $1
        AND audit_plan_id = $2
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows[0]?.total_items ?? 0;
  }

  async function countMandatoryChecklistItems({ tenantId, auditPlanId }) {
    const sql = `
      SELECT COUNT(*)::int AS total_items
      FROM internal_audit_checklist_items
      WHERE tenant_id = $1
        AND audit_plan_id = $2
        AND is_mandatory = TRUE
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows[0]?.total_items ?? 0;
  }

  async function countMandatoryChecklistItemsWithLatestResult({ tenantId, auditPlanId }) {
    const sql = `
      SELECT COUNT(*)::int AS total_items
      FROM internal_audit_checklist_items i
      WHERE i.tenant_id = $1
        AND i.audit_plan_id = $2
        AND i.is_mandatory = TRUE
        AND EXISTS (
          SELECT 1
          FROM internal_audit_checklist_results r
          WHERE r.tenant_id = i.tenant_id
            AND r.audit_plan_id = i.audit_plan_id
            AND r.checklist_item_id = i.id
        )
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows[0]?.total_items ?? 0;
  }

  async function insertChecklistItem({
    tenantId,
    auditPlanId,
    sectionId,
    itemCode,
    requirementText,
    expectedEvidence,
    clauseCode,
    sortOrder,
    isMandatory,
  }) {
    const sql = `
      INSERT INTO internal_audit_checklist_items (
        tenant_id,
        audit_plan_id,
        section_id,
        item_code,
        requirement_text,
        expected_evidence,
        clause_code,
        sort_order,
        is_mandatory
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditPlanId,
      sectionId,
      itemCode,
      requirementText,
      expectedEvidence,
      clauseCode,
      sortOrder,
      isMandatory,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updateChecklistItem({
    tenantId,
    auditPlanId,
    itemId,
    patch,
  }) {
    const fieldMap = {
      section_id: 'section_id',
      item_code: 'item_code',
      requirement_text: 'requirement_text',
      expected_evidence: 'expected_evidence',
      clause_code: 'clause_code',
      sort_order: 'sort_order',
      is_mandatory: 'is_mandatory',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
    }

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(auditPlanId);
    const planIndex = idx;
    idx += 1;

    values.push(itemId);
    const itemIndex = idx;

    const sql = `
      UPDATE internal_audit_checklist_items
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND audit_plan_id = $${planIndex}
        AND id = $${itemIndex}
      RETURNING id
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.id ?? null;
  }

  async function insertChecklistResult({
    tenantId,
    auditPlanId,
    checklistItemId,
    resultStatus,
    observationNotes,
    assessedByIdentityId,
  }) {
    const sql = `
      INSERT INTO internal_audit_checklist_results (
        tenant_id,
        audit_plan_id,
        checklist_item_id,
        result_status,
        observation_notes,
        assessed_by_identity_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditPlanId,
      checklistItemId,
      resultStatus,
      observationNotes,
      assessedByIdentityId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function listFindings({ tenantId, auditPlanId }) {
    const sql = `
      SELECT
        f.id,
        f.tenant_id,
        f.audit_plan_id,
        f.checklist_item_id,
        f.finding_code,
        f.title,
        f.description,
        f.severity,
        f.status,
        f.owner_identity_id,
        f.due_date,
        f.closed_at,
        f.closure_notes,
        f.created_by,
        f.updated_by,
        f.created_at,
        f.updated_at
      FROM internal_audit_findings f
      WHERE f.tenant_id = $1
        AND f.audit_plan_id = $2
      ORDER BY
        CASE f.status
          WHEN 'OPEN' THEN 1
          WHEN 'UNDER_REVIEW' THEN 2
          ELSE 3
        END,
        CASE f.severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          ELSE 4
        END,
        f.created_at DESC,
        f.id DESC
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId]);
    return result.rows;
  }

  async function findFindingById({ tenantId, auditPlanId, findingId }) {
    const sql = `
      SELECT
        f.id,
        f.tenant_id,
        f.audit_plan_id,
        f.checklist_item_id,
        f.finding_code,
        f.title,
        f.description,
        f.severity,
        f.status,
        f.owner_identity_id,
        f.due_date,
        f.closed_at,
        f.closure_notes,
        f.created_by,
        f.updated_by,
        f.created_at,
        f.updated_at
      FROM internal_audit_findings f
      WHERE f.tenant_id = $1
        AND f.audit_plan_id = $2
        AND f.id = $3
      LIMIT 1
    `;

    const result = await conn.query(sql, [tenantId, auditPlanId, findingId]);
    return result.rows[0] ?? null;
  }

  async function insertFinding({
    tenantId,
    auditPlanId,
    checklistItemId,
    findingCode,
    title,
    description,
    severity,
    ownerIdentityId,
    dueDate,
    userId,
  }) {
    const sql = `
      INSERT INTO internal_audit_findings (
        tenant_id,
        audit_plan_id,
        checklist_item_id,
        finding_code,
        title,
        description,
        severity,
        status,
        owner_identity_id,
        due_date,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'OPEN', $8, $9, $10, $10
      )
      RETURNING id
    `;

    const result = await conn.query(sql, [
      tenantId,
      auditPlanId,
      checklistItemId,
      findingCode,
      title,
      description,
      severity,
      ownerIdentityId,
      dueDate,
      userId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  async function updateFinding({
    tenantId,
    auditPlanId,
    findingId,
    patch,
    userId,
  }) {
    const fieldMap = {
      checklist_item_id: 'checklist_item_id',
      finding_code: 'finding_code',
      title: 'title',
      description: 'description',
      severity: 'severity',
      status: 'status',
      owner_identity_id: 'owner_identity_id',
      due_date: 'due_date',
    };

    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, column] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = $${idx}`);
        values.push(patch[key]);
        idx += 1;
      }
    }

    sets.push(`updated_by = $${idx}`);
    values.push(userId);
    idx += 1;

    values.push(tenantId);
    const tenantIndex = idx;
    idx += 1;

    values.push(auditPlanId);
    const planIndex = idx;
    idx += 1;

    values.push(findingId);
    const findingIndex = idx;

    const sql = `
      UPDATE internal_audit_findings
      SET ${sets.join(', ')}
      WHERE tenant_id = $${tenantIndex}
        AND audit_plan_id = $${planIndex}
        AND id = $${findingIndex}
      RETURNING id
    `;

    const result = await conn.query(sql, values);
    return result.rows[0]?.id ?? null;
  }

  async function closeFinding({
    tenantId,
    auditPlanId,
    findingId,
    closureNotes,
    userId,
  }) {
    const sql = `
      UPDATE internal_audit_findings
      SET
        status = 'CLOSED',
        closed_at = NOW(),
        closure_notes = $1,
        updated_by = $2
      WHERE tenant_id = $3
        AND audit_plan_id = $4
        AND id = $5
      RETURNING id
    `;

    const result = await conn.query(sql, [
      closureNotes,
      userId,
      tenantId,
      auditPlanId,
      findingId,
    ]);

    return result.rows[0]?.id ?? null;
  }

  return {
    listPlans,
    countPlans,
    findPlanById,
    insertPlan,
    updatePlan,
    updatePlanLeadAuditor,
    updatePlanStatus,
    findIdentityById,
    listMembers,
    findMemberById,
    findLeadAuditorMember,
    insertMember,
    deleteMember,
    listChecklistSections,
    findChecklistSectionById,
    insertChecklistSection,
    updateChecklistSection,
    listChecklistItems,
    findChecklistItemById,
    countChecklistItems,
    countMandatoryChecklistItems,
    countMandatoryChecklistItemsWithLatestResult,
    insertChecklistItem,
    updateChecklistItem,
    insertChecklistResult,
    listFindings,
    findFindingById,
    insertFinding,
    updateFinding,
    closeFinding,
  };
}
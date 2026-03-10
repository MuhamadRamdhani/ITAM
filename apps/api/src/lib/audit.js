export async function insertAuditEvent(app, { tenantId, actor, action, entityType, entityId, payload }) {
  await app.pg.query(
    `
    INSERT INTO public.audit_events
      (tenant_id, actor, action, entity_type, entity_id, payload)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    `,
    [
      tenantId,
      actor ?? "SYSTEM",
      action ?? "UNKNOWN",
      entityType ?? null,
      entityId ?? null,
      payload ?? null,
    ]
  );
}
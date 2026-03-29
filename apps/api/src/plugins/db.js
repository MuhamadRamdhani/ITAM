import fp from "fastify-plugin";
import postgres from "@fastify/postgres";

async function ensureAuditEventsIndexes(app) {
  const enabled = String(process.env.DB_ENSURE_INDEXES ?? "true").toLowerCase();
  if (enabled === "0" || enabled === "false" || enabled === "no") return;

  const existsRes = await app.pg.query(`select to_regclass('public.audit_events') as name`);
  const name = existsRes.rows?.[0]?.name ?? null;
  if (!name) return;

  await app.pg.query(`
    CREATE INDEX IF NOT EXISTS audit_events_tenant_created_at_idx
      ON public.audit_events (tenant_id, created_at DESC, id DESC)
  `);

  await app.pg.query(`
    CREATE INDEX IF NOT EXISTS audit_events_tenant_action_idx
      ON public.audit_events (tenant_id, action)
  `);

  await app.pg.query(`
    CREATE INDEX IF NOT EXISTS audit_events_tenant_entity_idx
      ON public.audit_events (tenant_id, entity_type, entity_id)
  `);

  await app.pg.query(`
    CREATE INDEX IF NOT EXISTS audit_events_tenant_actor_idx
      ON public.audit_events (tenant_id, actor)
  `);
}

export default fp(async function dbPlugin(app) {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw Object.assign(new Error("DATABASE_URL is missing"), { statusCode: 500 });

  await app.register(postgres, { connectionString: cs });

  try {
    await ensureAuditEventsIndexes(app);
  } catch (e) {
    if (app?.log?.warn) app.log.warn({ err: e }, "Failed to ensure audit_events indexes");
  }
});

export async function resolveIdByCode(app, tenantId, table, code) {
  const { rows } = await app.pg.query(
    `SELECT id FROM public.${table} WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [tenantId, code]
  );

  if (!rows[0]) {
    const e = new Error(`Invalid code: ${table}.code='${code}' not found for tenant`);
    e.statusCode = 400;
    throw e;
  }
  return rows[0].id;
}

export async function requireExistsById(app, tenantId, table, id) {
  if (id == null) return; // nullable allowed

  const { rowCount } = await app.pg.query(
    `SELECT 1 FROM public.${table} WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );

  if (rowCount === 0) {
    const e = new Error(`Invalid reference: ${table}.id=${id} not found for tenant`);
    e.statusCode = 400;
    throw e;
  }
}
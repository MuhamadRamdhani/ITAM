export default async function masterdataRoutes(app) {
  // @fastify/postgres -> decorator: app.pg
  if (!app.pg) throw new Error("Postgres plugin not registered (app.pg missing)");

  const tenantIdOf = (req) => Number(req.tenantId || 1);

  const parsePaging = (req) => {
    const page = Math.max(1, Number(req.query?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query?.page_size || 50)));
    const offset = (page - 1) * pageSize;
    return { page, pageSize, offset };
  };

  // GET /api/v1/departments
  app.get("/departments", async (req, reply) => {
    const tenantId = tenantIdOf(req);
    const q = String(req.query?.q || "").trim();
    const { page, pageSize, offset } = parsePaging(req);

    const where = [`tenant_id = $1`];
    const params = [tenantId];

    if (q) {
      params.push(`%${q}%`);
      // aman walau kolom beda-beda (name/label/department_name)
      where.push(
        `(COALESCE(row_to_json(d)->>'name','') ILIKE $${params.length}
          OR COALESCE(row_to_json(d)->>'label','') ILIKE $${params.length}
          OR COALESCE(row_to_json(d)->>'department_name','') ILIKE $${params.length})`
      );
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const totalRes = await app.pg.query(
      `SELECT COUNT(*)::int AS total FROM departments d ${whereSql}`,
      params
    );
    const total = totalRes.rows?.[0]?.total ?? 0;

    const listRes = await app.pg.query(
      `SELECT d.id,
              COALESCE(row_to_json(d)->>'name',
                       row_to_json(d)->>'label',
                       row_to_json(d)->>'department_name',
                       ('#' || d.id::text)) AS name
       FROM departments d
       ${whereSql}
       ORDER BY d.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    return reply.send({ ok: true, data: { items: listRes.rows, page, page_size: pageSize, total } });
  });

  // GET /api/v1/identities
  app.get("/identities", async (req, reply) => {
    const tenantId = tenantIdOf(req);
    const q = String(req.query?.q || "").trim();
    const { page, pageSize, offset } = parsePaging(req);

    const where = [`tenant_id = $1`];
    const params = [tenantId];

    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(COALESCE(row_to_json(i)->>'display_name','') ILIKE $${params.length}
          OR COALESCE(row_to_json(i)->>'name','') ILIKE $${params.length}
          OR COALESCE(row_to_json(i)->>'email','') ILIKE $${params.length})`
      );
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const totalRes = await app.pg.query(
      `SELECT COUNT(*)::int AS total FROM identities i ${whereSql}`,
      params
    );
    const total = totalRes.rows?.[0]?.total ?? 0;

    const listRes = await app.pg.query(
      `SELECT i.id,
              COALESCE(row_to_json(i)->>'display_name', row_to_json(i)->>'name', ('#' || i.id::text)) AS display_name,
              COALESCE(row_to_json(i)->>'email','') AS email
       FROM identities i
       ${whereSql}
       ORDER BY i.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    return reply.send({ ok: true, data: { items: listRes.rows, page, page_size: pageSize, total } });
  });

  // GET /api/v1/locations
  app.get("/locations", async (req, reply) => {
    const tenantId = tenantIdOf(req);
    const q = String(req.query?.q || "").trim();
    const { page, pageSize, offset } = parsePaging(req);

    const where = [`tenant_id = $1`];
    const params = [tenantId];

    if (q) {
      params.push(`%${q}%`);
      where.push(
        `(COALESCE(row_to_json(l)->>'name','') ILIKE $${params.length}
          OR COALESCE(row_to_json(l)->>'label','') ILIKE $${params.length}
          OR COALESCE(row_to_json(l)->>'location_name','') ILIKE $${params.length})`
      );
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const totalRes = await app.pg.query(
      `SELECT COUNT(*)::int AS total FROM locations l ${whereSql}`,
      params
    );
    const total = totalRes.rows?.[0]?.total ?? 0;

    const listRes = await app.pg.query(
      `SELECT l.id,
              COALESCE(row_to_json(l)->>'name',
                       row_to_json(l)->>'label',
                       row_to_json(l)->>'location_name',
                       ('#' || l.id::text)) AS name
       FROM locations l
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    return reply.send({ ok: true, data: { items: listRes.rows, page, page_size: pageSize, total } });
  });
}
import fp from "fastify-plugin";
import postgres from "@fastify/postgres";

export default fp(async function dbPlugin(app) {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw Object.assign(new Error("DATABASE_URL is missing"), { statusCode: 500 });

  await app.register(postgres, { connectionString: cs });
});
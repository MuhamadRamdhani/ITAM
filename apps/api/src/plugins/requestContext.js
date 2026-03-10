import fp from "fastify-plugin";

const ACCESS_COOKIE = process.env.AUTH_ACCESS_COOKIE || "itam_at";

function pickBearer(authorization) {
  const v = String(authorization || "");
  if (!v.toLowerCase().startsWith("bearer ")) return null;
  return v.slice(7).trim() || null;
}

function isPublicPath(req) {
  const url = String(req.raw?.url || req.url || "");

  if (url === "/health") return true;
  if (url.startsWith("/api/v1/auth/")) return true;

  return false;
}

export default fp(async function requestContext(app) {
  const mode = String(process.env.AUTH_MODE || "dev").toLowerCase(); // dev | strict

  app.addHook("onRequest", async (req) => {
    // public routes: jangan dipaksa auth
    if (isPublicPath(req)) {
      req.requestContext = req.requestContext || {};
      req.actor = { type: "SYSTEM", id: null };
      return;
    }

    req.requestContext = req.requestContext || {};
    req.actor = { type: "SYSTEM", id: null };

    const tokenFromCookie = req.cookies?.[ACCESS_COOKIE] || null;
    const tokenFromHeader = pickBearer(req.headers?.authorization);
    const token = tokenFromCookie || tokenFromHeader;

    if (!token) {
      if (mode === "dev") {
        req.tenantId = 1;
        req.requestContext.tenantId = 1;
        req.requestContext.userId = null;
        req.requestContext.roles = [];
        req.requestContext.identityId = null;
        req.actor = { type: "SYSTEM", id: null };
      }
      return;
    }

    try {
      const payload = app.jwt.verify(token);

      const tenantId = Number(payload?.tenant_id);
      const userId = payload?.user_id != null ? Number(payload.user_id) : null;
      const roles = Array.isArray(payload?.roles) ? payload.roles.map(String) : [];
      const identityId = payload?.identity_id != null ? Number(payload.identity_id) : null;

      if (!Number.isFinite(tenantId) || tenantId <= 0) {
        const e = new Error("Invalid token payload (tenant_id)");
        e.statusCode = 401;
        e.code = "AUTH_UNAUTHORIZED";
        throw e;
      }

      req.tenantId = tenantId;
      req.requestContext.tenantId = tenantId;
      req.requestContext.userId = Number.isFinite(userId) ? userId : null;
      req.requestContext.roles = roles;
      req.requestContext.identityId = Number.isFinite(identityId) ? identityId : null;

      req.actor = userId ? { type: "USER", id: userId } : { type: "SYSTEM", id: null };
    } catch (err) {
      if (mode === "dev") {
        req.tenantId = 1;
        req.requestContext.tenantId = 1;
        req.requestContext.userId = null;
        req.requestContext.roles = [];
        req.requestContext.identityId = null;
        req.actor = { type: "SYSTEM", id: null };
        return;
      }

      const e = new Error("Unauthorized");
      e.statusCode = 401;
      e.code = "AUTH_UNAUTHORIZED";
      throw e;
    }
  });

  app.addHook("preHandler", async (req) => {
    // public routes tetap boleh tanpa token
    if (isPublicPath(req)) return;

    if (mode !== "strict") return;

    if (!req.tenantId) {
      const e = new Error("Authentication required");
      e.statusCode = 401;
      e.code = "AUTH_REQUIRED";
      throw e;
    }
  });
});
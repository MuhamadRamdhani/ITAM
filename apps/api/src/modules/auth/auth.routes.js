import { Type } from "@sinclair/typebox";
import {
  loginService,
  refreshService,
  logoutService,
} from "./auth.service.js";

const ACCESS_COOKIE = process.env.AUTH_ACCESS_COOKIE || "itam_at";
const REFRESH_COOKIE = process.env.AUTH_REFRESH_COOKIE || "itam_rt";

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
  };
}

function mustAccessPayload(app, req) {
  const token = req.cookies?.[ACCESS_COOKIE] || null;
  if (!token) {
    const e = new Error("Authentication required");
    e.statusCode = 401;
    e.code = "AUTH_REQUIRED";
    throw e;
  }
  try {
    return app.jwt.verify(token);
  } catch {
    const e = new Error("Unauthorized");
    e.statusCode = 401;
    e.code = "AUTH_UNAUTHORIZED";
    throw e;
  }
}

export default async function authRoutes(app) {
  // POST /api/v1/auth/login
  app.post(
    "/login",
    {
      schema: {
        body: Type.Object({
          tenant_code: Type.String(),
          email: Type.String(),
          password: Type.String(),
        }),
      },
    },
    async (req, reply) => {
      const userAgent = String(req.headers["user-agent"] || "");
      const ip = String(req.ip || "");

      const out = await loginService(app, {
        tenantCode: req.body.tenant_code,
        email: req.body.email,
        password: req.body.password,
        userAgent,
        ip,
      });

      reply.setCookie(ACCESS_COOKIE, out.accessToken, {
        ...cookieBase(),
        path: "/",
      });

      // refresh cookie: lebih sempit path-nya
      reply.setCookie(REFRESH_COOKIE, out.refreshTokenRaw, {
        ...cookieBase(),
        path: "/api/v1/auth",
        maxAge: Number(process.env.AUTH_REFRESH_DAYS || 30) * 24 * 60 * 60, // seconds
      });

      return reply.send({
        ok: true,
        data: {
          tenant: out.tenant,
          user: out.user,
          roles: out.roles,
        },
        meta: { request_id: req.id },
      });
    }
  );

  // GET /api/v1/auth/me
  app.get("/me", async (req, reply) => {
    const p = mustAccessPayload(app, req);
    return reply.send({
      ok: true,
      data: {
        tenant_id: Number(p.tenant_id),
        user_id: Number(p.user_id),
        roles: Array.isArray(p.roles) ? p.roles : [],
        identity_id: p.identity_id ?? null,
      },
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/auth/refresh
  app.post("/refresh", async (req, reply) => {
    const userAgent = String(req.headers["user-agent"] || "");
    const ip = String(req.ip || "");

    const rt = req.cookies?.[REFRESH_COOKIE] || null;
    const out = await refreshService(app, {
      refreshTokenRaw: rt,
      userAgent,
      ip,
    });

    reply.setCookie(ACCESS_COOKIE, out.accessToken, {
      ...cookieBase(),
      path: "/",
    });

    reply.setCookie(REFRESH_COOKIE, out.refreshTokenRaw, {
      ...cookieBase(),
      path: "/api/v1/auth",
      maxAge: Number(process.env.AUTH_REFRESH_DAYS || 30) * 24 * 60 * 60,
    });

    return reply.send({
      ok: true,
      data: { tenant_id: out.tenantId, user_id: out.userId, roles: out.roles },
      meta: { request_id: req.id },
    });
  });

  // POST /api/v1/auth/logout
  app.post("/logout", async (req, reply) => {
    const userAgent = String(req.headers["user-agent"] || "");
    const ip = String(req.ip || "");

    const rt = req.cookies?.[REFRESH_COOKIE] || null;
    await logoutService(app, { refreshTokenRaw: rt, ip, userAgent });

    reply.clearCookie(ACCESS_COOKIE, { path: "/" });
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });

    return reply.send({ ok: true, data: { ok: true }, meta: { request_id: req.id } });
  });
}
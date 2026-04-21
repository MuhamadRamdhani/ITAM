import { Type } from "@sinclair/typebox";
import {
  loginService,
  meService,
  refreshService,
  logoutService,
} from "./auth.service.js";
import {
  sanitizeString,
  validateEmail,
  validatePassword,
} from "../../lib/inputValidation.js";

const ACCESS_COOKIE = process.env.AUTH_ACCESS_COOKIE || "itam_at";
const REFRESH_COOKIE = process.env.AUTH_REFRESH_COOKIE || "itam_rt";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

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

async function verifyRecaptchaToken({ token, ip }) {
  if (!RECAPTCHA_SECRET_KEY) {
    return;
  }

  const recaptchaToken = sanitizeString(token, 4096);
  if (!recaptchaToken) {
    const e = new Error("Captcha verification is required");
    e.statusCode = 400;
    e.code = "AUTH_CAPTCHA_REQUIRED";
    throw e;
  }

  const params = new URLSearchParams();
  params.set("secret", RECAPTCHA_SECRET_KEY);
  params.set("response", recaptchaToken);
  if (ip) {
    params.set("remoteip", ip);
  }

  let data;
  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!response.ok) {
      const e = new Error("Captcha verification service unavailable");
      e.statusCode = 502;
      e.code = "AUTH_CAPTCHA_SERVICE_ERROR";
      throw e;
    }

    data = await response.json();
  } catch (cause) {
    if (cause && cause.code === "AUTH_CAPTCHA_SERVICE_ERROR") {
      throw cause;
    }

    const e = new Error("Captcha verification service unavailable");
    e.statusCode = 502;
    e.code = "AUTH_CAPTCHA_SERVICE_ERROR";
    e.cause = cause;
    throw e;
  }

  if (!data?.success) {
    const e = new Error("Captcha verification failed");
    e.statusCode = 403;
    e.code = "AUTH_CAPTCHA_INVALID";
    e.details = { errorCodes: data?.["error-codes"] || [] };
    throw e;
  }
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
          recaptcha_token: Type.Optional(Type.String()),
        }),
      },
    },
    async (req, reply) => {
      const userAgent = String(req.headers["user-agent"] || "");
      const ip = String(req.ip || "");

      const tenantCode = sanitizeString(req.body.tenant_code, 100);
      const email = sanitizeString(req.body.email, 255);
      const password = req.body.password;

      if (!tenantCode) {
        const e = new Error("Tenant code is required");
        e.statusCode = 400;
        e.code = "BAD_REQUEST";
        throw e;
      }

      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        const e = new Error(emailValidation.error);
        e.statusCode = 400;
        e.code = "BAD_REQUEST";
        throw e;
      }

      if (!password || typeof password !== "string") {
        const e = new Error("Password is required");
        e.statusCode = 400;
        e.code = "BAD_REQUEST";
        throw e;
      }

      await verifyRecaptchaToken({
        token: req.body.recaptcha_token,
        ip,
      });

      const out = await loginService(app, {
        tenantCode,
        email: emailValidation.value,
        password,
        userAgent,
        ip,
      });

      reply.setCookie(ACCESS_COOKIE, out.accessToken, {
        ...cookieBase(),
        path: "/",
      });

      reply.setCookie(REFRESH_COOKIE, out.refreshTokenRaw, {
        ...cookieBase(),
        path: "/",
        maxAge: Number(process.env.AUTH_REFRESH_DAYS || 30) * 24 * 60 * 60,
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

    const out = await meService(app, {
      tenantId: Number(p.tenant_id),
      userId: Number(p.user_id),
      identityId: p.identity_id ?? null,
    });

    return reply.send({
      ok: true,
      data: out,
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
      path: "/",
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
    reply.clearCookie(REFRESH_COOKIE, { path: "/" });

    return reply.send({
      ok: true,
      data: { ok: true },
      meta: { request_id: req.id },
    });
  });
}

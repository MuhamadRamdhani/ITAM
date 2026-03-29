/**
 * Security Headers Middleware
 * Implements OWASP recommended security headers
 */

export async function securityHeadersPlugin(app) {
  app.addHook("onSend", async (request, reply) => {
    // Prevent clickjacking (X-Frame-Options deprecated, use CSP frame-ancestors)
    reply.header("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    reply.header("X-Content-Type-Options", "nosniff");

    // XSS Protection (legacy, modern browsers use CSP)
    reply.header("X-XSS-Protection", "1; mode=block");

    // Strict Transport Security (HTTPS only)
    // max-age: 31536000 seconds = 1 year
    reply.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );

    // Content Security Policy
    // Restrict to same origin, no inline scripts
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    reply.header("Content-Security-Policy", cspDirectives.join("; "));

    // Referrer Policy
    // Send referrer only to same origin
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Disable access to browser features
    // Geolocation, Camera, Microphone, Payment Request API
    reply.header(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=(), payment=()"
    );

    // Additional: Don't cache sensitive responses
    if (
      request.url.includes("/auth/") ||
      request.url.includes("/users") ||
      request.url.includes("/admin")
    ) {
      reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
      reply.header("Pragma", "no-cache");
      reply.header("Expires", "0");
    }
  });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const hasAccess = req.cookies.get("itam_at")?.value;

  if (!hasAccess) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/assets/:path*",
    "/approvals/:path*",
    "/documents/:path*",
    "/evidence/:path*",
    "/governance/:path*",
    "/admin/:path*",
    "/superadmin/:path*",
    "/audit-events/:path*",
  ],
};
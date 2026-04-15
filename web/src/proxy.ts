import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Extract session role from cookie */
function getRoleFromSession(request: NextRequest): string | null {
  const sessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token") ||
    request.cookies.get("next-auth.session-token");

  if (!sessionCookie) return null;
  const [, payloadBase64] = sessionCookie.value.split(".");
  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
    return (payload.role as string) || null;
  } catch {
    return null;
  }
}

const APP_DOMAIN = "app.eterapy.com";
const ADMIN_DOMAIN = "admin.eterapy.com";
const PROTOCOL = "https://";
// In production (VPS): redirect to subdomains
// In local dev: stay on current domain (Docker Desktop TLS limitation)
const USE_SUBDOMAINS = process.env.NODE_ENV === "production";

export default function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? "";
  const cleanHost = host.split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;
  const role = getRoleFromSession(request);

  // ─── Subdomain handlers (production VPS) ───────────────────────────
  if (USE_SUBDOMAINS) {
    if (cleanHost === APP_DOMAIN) {
      if (!role) return NextResponse.redirect(new URL("/login", request.url));
      return NextResponse.next();
    }
    if (cleanHost === ADMIN_DOMAIN) {
      if (!role) return NextResponse.redirect(new URL("/login", request.url));
      if (role !== "ADMIN" && role !== "SUPERADMIN") return NextResponse.redirect(new URL("/", request.url));
      return NextResponse.next();
    }
  }

  // ─── All environments: access control ──────────────────────────────
  // Guests can't access /cabinet or /admin
  if ((pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) && !role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Non-admin can't access /admin
  if (pathname.startsWith("/admin") && role !== "ADMIN" && role !== "SUPERADMIN") {
    return NextResponse.redirect(new URL("/cabinet", request.url));
  }

  // Logged-in users shouldn't see /login or /register
  if ((pathname === "/login" || pathname === "/register") && role) {
    const dest = role === "PRACTITIONER" ? "/cabinet/practitioner"
      : (role === "ADMIN" || role === "SUPERADMIN") ? "/admin" : "/cabinet";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // In production: redirect /cabinet → app subdomain, /admin → admin subdomain
  if (USE_SUBDOMAINS) {
    if (pathname.startsWith("/cabinet")) {
      return NextResponse.redirect(new URL(`${PROTOCOL}${APP_DOMAIN}${pathname}`, request.url));
    }
    if (pathname.startsWith("/admin")) {
      const adminPath = pathname === "/admin" ? "/" : pathname;
      return NextResponse.redirect(new URL(`${PROTOCOL}${ADMIN_DOMAIN}${adminPath}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

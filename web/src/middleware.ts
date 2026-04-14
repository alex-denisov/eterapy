import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Determine which subdomain is handling this request */
function getSubdomain(host: string | null): "app" | "admin" | "main" {
  if (!host) return "main";
  const clean = host.split(":")[0].toLowerCase();
  if (clean === "app.eterapy.com") return "app";
  if (clean === "admin.eterapy.com") return "admin";
  return "main";
}

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

const MAIN_DOMAIN = "eterapy.com";
const APP_DOMAIN = "app.eterapy.com";
const ADMIN_DOMAIN = "admin.eterapy.com";
const PROTOCOL = "https://";

// Use subdomains only when explicitly enabled via env var.
// Set NEXT_PUBLIC_USE_SUBDOMAINS=true on VPS; leave unset for local dev.
const USE_SUBDOMAINS = process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true";

function url(path: string, domain: string) {
  return `${PROTOCOL}${domain}${path}`;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host");
  const subdomain = getSubdomain(host);
  const pathname = request.nextUrl.pathname;
  const role = getRoleFromSession(request);

  // ─── app.eterapy.com (production only) ─────────────────────────
  if (subdomain === "app") {
    if (!role) return NextResponse.redirect(url("/login", MAIN_DOMAIN));
    return NextResponse.next();
  }

  // ─── admin.eterapy.com (production only) ───────────────────────
  if (subdomain === "admin") {
    if (!role) return NextResponse.redirect(url("/login", MAIN_DOMAIN));
    if (role !== "ADMIN" && role !== "SUPERADMIN") return NextResponse.redirect(url("/", MAIN_DOMAIN));
    return NextResponse.next();
  }

  // ─── eterapy.com (main domain — all local dev, guest pages) ────
  if (subdomain === "main") {
    // In production: redirect logged-in users to app subdomain
    // In local dev: allow access to /cabinet and /admin on main domain
    if (pathname === "/" && role && USE_SUBDOMAINS) {
      const dest = role === "PRACTITIONER" ? "/cabinet/practitioner"
        : (role === "ADMIN" || role === "SUPERADMIN") ? "/admin" : "/cabinet";
      return NextResponse.redirect(url(dest, APP_DOMAIN));
    }

    // Always redirect logged-in users from /login and /register to /cabinet
    if ((pathname === "/login" || pathname === "/register") && role) {
      return NextResponse.redirect(url("/cabinet", MAIN_DOMAIN));
    }

    // In production: redirect /cabinet → app subdomain, /admin → admin subdomain
    // In local dev: allow /cabinet and /admin on main domain
    if (USE_SUBDOMAINS) {
      if (pathname.startsWith("/cabinet")) {
        if (!role) return NextResponse.redirect(url("/login", MAIN_DOMAIN));
        return NextResponse.redirect(url(pathname, APP_DOMAIN));
      }
      if (pathname.startsWith("/admin")) {
        if (!role) return NextResponse.redirect(url("/login", MAIN_DOMAIN));
        if (role !== "ADMIN" && role !== "SUPERADMIN") return NextResponse.redirect(url("/", MAIN_DOMAIN));
        const adminPath = pathname === "/admin" ? "/" : pathname;
        return NextResponse.redirect(url(adminPath, ADMIN_DOMAIN));
      }
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

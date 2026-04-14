import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Determine which subdomain is handling this request */
function getSubdomain(host: string | null): "app" | "admin" | "main" {
  if (!host) return "main";
  // Strip port (e.g. localhost:3000)
  const clean = host.split(":")[0].toLowerCase();
  if (clean === "app.eterapy.com") return "app";
  if (clean === "admin.eterapy.com") return "admin";
  return "main";
}

/** Extract session role using NextAuth JWT (handles JWE encrypted tokens) */
async function getRoleFromSession(request: NextRequest): Promise<string | null> {
  try {
    const secureCookie = process.env.NODE_ENV === "production";
    const cookieName = secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET!,
      cookieName,
      salt: cookieName,
    });
    return (token?.role as string) || null;
  } catch {
    return null;
  }
}

const MAIN_DOMAIN = "eterapy.com";
const APP_DOMAIN = "app.eterapy.com";
const ADMIN_DOMAIN = "admin.eterapy.com";
const PROTOCOL = "https://";

function url(path: string, domain: string) {
  return `${PROTOCOL}${domain}${path}`;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host");
  const subdomain = getSubdomain(host);
  const pathname = request.nextUrl.pathname;
  const role = await getRoleFromSession(request);

  // ─── app.eterapy.com ─────────────────────────────────────────────
  if (subdomain === "app") {
    // Not logged in → redirect to login on main domain
    if (!role) {
      return NextResponse.redirect(url("/login", MAIN_DOMAIN));
    }
    // Logged in — allow access (cabinet pages)
    return NextResponse.next();
  }

  // ─── admin.eterapy.com ───────────────────────────────────────────
  if (subdomain === "admin") {
    // Not logged in → redirect to login
    if (!role) {
      return NextResponse.redirect(url("/login", MAIN_DOMAIN));
    }
    // Not admin/superadmin → redirect to main domain
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.redirect(url("/", MAIN_DOMAIN));
    }
    // Admin/superadmin — allow access
    return NextResponse.next();
  }

  // ─── eterapy.com (main domain) — enforce subdomain routing ───────
  if (subdomain === "main") {
    // Redirect logged-in users from guest landing page to app subdomain
    if (pathname === "/" && role) {
      const dest = role === "PRACTITIONER"
        ? "/cabinet/practitioner"
        : (role === "ADMIN" || role === "SUPERADMIN")
          ? "/admin"
          : "/cabinet";
      return NextResponse.redirect(url(dest, APP_DOMAIN));
    }

    // If logged-in user tries to access /login or /register — redirect to app
    if ((pathname === "/login" || pathname === "/register") && role) {
      const dest = role === "PRACTITIONER"
        ? "/cabinet/practitioner"
        : (role === "ADMIN" || role === "SUPERADMIN")
          ? "/admin"
          : "/cabinet";
      return NextResponse.redirect(url(dest, APP_DOMAIN));
    }

    // If user accesses /cabinet/* on main domain → redirect to app subdomain
    if (pathname.startsWith("/cabinet")) {
      if (!role) {
        return NextResponse.redirect(url("/login", MAIN_DOMAIN));
      }
      return NextResponse.redirect(url(pathname, APP_DOMAIN));
    }

    // If user accesses /admin/* on main domain → redirect to admin subdomain
    if (pathname.startsWith("/admin")) {
      if (!role) {
        return NextResponse.redirect(url("/login", MAIN_DOMAIN));
      }
      if (role !== "ADMIN" && role !== "SUPERADMIN") {
        return NextResponse.redirect(url("/", MAIN_DOMAIN));
      }
      const adminPath = pathname === "/admin" ? "/" : pathname;
      return NextResponse.redirect(url(adminPath, ADMIN_DOMAIN));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

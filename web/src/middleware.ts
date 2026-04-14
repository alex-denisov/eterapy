import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Determine which subdomain is handling this request */
function getSubdomain(host: string | null): "app" | "admin" | "main" {
  if (!host) return "main";
  // Strip port (e.g. localhost:3000)
  const clean = host.split(":")[0].toLowerCase();
  if (clean === "app.eterapy.com") return "app";
  if (clean === "admin.eterapy.com") return "admin";
  return "main";
}

/** Extract session role from cookie (same logic as before) */
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

function url(path: string, domain: string) {
  return `${PROTOCOL}${domain}${path}`;
}

export async function middleware(request: NextRequest) {
  const subdomain = getSubdomain(request.headers.get("host") ?? request.headers.get("x-forwarded-host"));
  const pathname = request.nextUrl.pathname;
  const role = getRoleFromSession(request);

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

  // ─── eterapy.com (main domain) ───────────────────────────────────
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

    // If logged-in admin tries to access /admin — redirect to admin subdomain
    if (pathname.startsWith("/admin") && (role === "ADMIN" || role === "SUPERADMIN")) {
      const adminPath = pathname === "/admin" ? "/" : pathname.replace("/admin", "");
      return NextResponse.redirect(`${PROTOCOL}${ADMIN_DOMAIN}${adminPath}`);
    }

    // If logged-in user tries to access /cabinet — redirect to app subdomain
    if (pathname.startsWith("/cabinet") && role) {
      return NextResponse.redirect(`${PROTOCOL}${APP_DOMAIN}${pathname}`);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

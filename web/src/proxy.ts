import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Extract session role+id from JWT cookie (edge-safe, no DB). */
function getSessionFromCookie(request: NextRequest): { role: string | null; id: string | null } {
  const cookie =
    request.cookies.get("__Secure-authjs.session-token") ||
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("next-auth.session-token");
  if (!cookie) return { role: null, id: null };
  const [, payloadBase64] = cookie.value.split(".");
  if (!payloadBase64) return { role: null, id: null };
  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
    return {
      role: (payload.role as string) || null,
      id: (payload.id as string) || null,
    };
  } catch {
    return { role: null, id: null };
  }
}

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? "eterapy.com";
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "app.eterapy.com";
const ADMIN_DOMAIN = process.env.NEXT_PUBLIC_ADMIN_DOMAIN ?? "admin.eterapy.com";
const USE_SUBDOMAINS = process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true";
const PROTO = "https://";

function isAdminRole(role: string | null): boolean {
  return role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR";
}

function homePathForRole(role: string | null): string {
  if (role === "PRACTITIONER") return "/cabinet/practitioner";
  if (isAdminRole(role)) return "/admin";
  return "/cabinet";
}

function domainForPath(pathname: string): string {
  if (pathname.startsWith("/admin")) return ADMIN_DOMAIN;
  if (pathname.startsWith("/cabinet")) return APP_DOMAIN;
  return MAIN_DOMAIN;
}

function redirect(url: string, request: NextRequest) {
  return NextResponse.redirect(new URL(url, request.url));
}

function redirectAbs(domain: string, pathname: string) {
  return NextResponse.redirect(`${PROTO}${domain}${pathname}`);
}

// Paths that are OK on any subdomain (auth flow, nextauth callbacks at app-route level)
const ALWAYS_ALLOW = ["/auth/", "/callback/"];

export default function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? "").split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;
  const { role } = getSessionFromCookie(request);

  if (ALWAYS_ALLOW.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ─── No-subdomain mode (local dev): only enforce path-level auth ───
  if (!USE_SUBDOMAINS) {
    if ((pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) && !role) {
      return redirect(`/login?next=${encodeURIComponent(pathname)}`, request);
    }
    if (pathname.startsWith("/admin") && !isAdminRole(role)) {
      return redirect("/cabinet", request);
    }
    if ((pathname === "/login" || pathname === "/register") && role) {
      return redirect(homePathForRole(role), request);
    }
    return NextResponse.next();
  }

  // ─── Production with subdomains ───────────────────────────────────
  const onMain = host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`;
  const onApp = host === APP_DOMAIN;
  const onAdmin = host === ADMIN_DOMAIN;

  // Unknown host → serve as main
  if (!onMain && !onApp && !onAdmin) {
    return NextResponse.next();
  }

  // ─── app.eterapy.com ───
  if (onApp) {
    if (!role) {
      return redirectAbs(MAIN_DOMAIN, `/login?next=${encodeURIComponent("/cabinet")}`);
    }
    if (isAdminRole(role)) {
      return redirectAbs(ADMIN_DOMAIN, "/admin");
    }
    // CLIENT or PRACTITIONER
    if (pathname === "/") {
      return redirect(homePathForRole(role), request);
    }
    // Only /cabinet and /api routes allowed here (api excluded by matcher)
    if (!pathname.startsWith("/cabinet")) {
      return redirect(homePathForRole(role), request);
    }
    return NextResponse.next();
  }

  // ─── admin.eterapy.com ───
  if (onAdmin) {
    if (!role) {
      return redirectAbs(MAIN_DOMAIN, `/login?next=${encodeURIComponent("/admin")}`);
    }
    if (!isAdminRole(role)) {
      return redirectAbs(APP_DOMAIN, "/cabinet");
    }
    if (pathname === "/") {
      return redirect("/admin", request);
    }
    if (!pathname.startsWith("/admin")) {
      return redirect("/admin", request);
    }
    return NextResponse.next();
  }

  // ─── eterapy.com (main) ───
  // Normalise www → apex already handled by nginx; just in case
  if (host === `www.${MAIN_DOMAIN}`) {
    return redirectAbs(MAIN_DOMAIN, pathname);
  }

  // Logged-in user hitting main domain
  if (role) {
    // /cabinet here → push to app subdomain
    if (pathname.startsWith("/cabinet")) {
      return redirectAbs(APP_DOMAIN, pathname);
    }
    // /admin here → push to admin subdomain
    if (pathname.startsWith("/admin")) {
      return redirectAbs(ADMIN_DOMAIN, pathname);
    }
    // Login/register while logged in → home
    if (pathname === "/login" || pathname === "/register") {
      return redirectAbs(domainForPath(homePathForRole(role)), homePathForRole(role));
    }
    // Landing page for logged-in user → their cabinet
    if (pathname === "/") {
      return redirectAbs(domainForPath(homePathForRole(role)), homePathForRole(role));
    }
    // Other public pages (practitioners catalog, modalities, help, legal, how-to-choose, about) stay accessible
    return NextResponse.next();
  }

  // Guest on main domain — block protected paths, show everything else
  if (pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) {
    return redirect(`/login?next=${encodeURIComponent(pathname)}`, request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromCookie } from "@/lib/session-from-cookie";
import { applyRequestContextHeaders, requestContextFromHeaders } from "@/lib/request-context";
import { shouldNoIndex } from "@/lib/seo";

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

function withRequestContext<T extends NextResponse>(
  response: T,
  context: { requestId: string; correlationId: string }
): T {
  applyRequestContextHeaders(response.headers, context);
  return response;
}

function redirect(url: string, request: NextRequest, context: { requestId: string; correlationId: string }) {
  return withRequestContext(NextResponse.redirect(new URL(url, request.url)), context);
}

function redirectAbs(domain: string, pathname: string, context: { requestId: string; correlationId: string }) {
  return withRequestContext(NextResponse.redirect(`${PROTO}${domain}${pathname}`), context);
}

function nextWithContext(requestHeaders: Headers, context: { requestId: string; correlationId: string }) {
  applyRequestContextHeaders(requestHeaders, context);
  return withRequestContext(NextResponse.next({ request: { headers: requestHeaders } }), context);
}

function rewriteWithContext(url: URL, requestHeaders: Headers, context: { requestId: string; correlationId: string }) {
  applyRequestContextHeaders(requestHeaders, context);
  return withRequestContext(NextResponse.rewrite(url, { request: { headers: requestHeaders } }), context);
}

export function internalRewriteUrl(request: NextRequest, pathname: string): URL {
  const url = new URL(pathname, request.url);
  // Behind nginx, Next can materialize request.url as https://localhost:3000
  // from X-Forwarded-Proto. Rewriting that absolute URL makes Next proxy TLS to
  // the local HTTP listener and returns 500/EPROTO. Keep internal rewrites local
  // but force the backend protocol to HTTP.
  if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "https:") {
    url.protocol = "http:";
  }
  return url;
}

function applyRobotsPolicy<T extends NextResponse>(response: T, host: string, pathname: string): T {
  if (shouldNoIndex(host, pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

// Paths that are OK on any subdomain (auth flow, nextauth callbacks at app-route level)
const ALWAYS_ALLOW = ["/auth/", "/callback/"];

export default async function proxy(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);
  const host = (request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? "").split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;
  const { role } = await getSessionFromCookie(request);

  if (ALWAYS_ALLOW.some(p => pathname.startsWith(p))) {
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── No-subdomain mode (local dev): only enforce path-level auth ───
  if (!USE_SUBDOMAINS) {
    if ((pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) && !role) {
      return applyRobotsPolicy(redirect(`/login?next=${encodeURIComponent(pathname)}`, request, context), host, pathname);
    }
    if (pathname.startsWith("/admin") && !isAdminRole(role)) {
      return applyRobotsPolicy(redirect("/cabinet", request, context), host, pathname);
    }
    if ((pathname === "/login" || pathname === "/register") && role) {
      return applyRobotsPolicy(redirect(homePathForRole(role), request, context), host, pathname);
    }
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── Production with subdomains ───────────────────────────────────
  const onMain = host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`;
  const onApp = host === APP_DOMAIN;
  const onAdmin = host === ADMIN_DOMAIN;

  // Unknown host → serve as main
  if (!onMain && !onApp && !onAdmin) {
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── app.eterapy.com ───
  if (onApp) {
    if (!role) {
      return applyRobotsPolicy(redirectAbs(MAIN_DOMAIN, `/login?next=${encodeURIComponent("/")}`, context), host, pathname);
    }
    if (isAdminRole(role)) {
      return applyRobotsPolicy(redirectAbs(ADMIN_DOMAIN, "/admin", context), host, pathname);
    }
    // CLIENT or PRACTITIONER
    // Strip /cabinet segment: incoming /cabinet/X → 308 redirect to /X; /cabinet alone → /
    if (pathname === "/cabinet") {
      return applyRobotsPolicy(withRequestContext(NextResponse.redirect(new URL("/", request.url), 308), context), host, pathname);
    }
    if (pathname.startsWith("/cabinet/")) {
      const stripped = pathname.slice("/cabinet".length); // keeps leading /
      const search = request.nextUrl.search;
      return applyRobotsPolicy(withRequestContext(NextResponse.redirect(new URL(stripped + search, request.url), 308), context), host, pathname);
    }
    // /help passthrough (served from src/app/help)
    if (pathname === "/help" || pathname.startsWith("/help/")) {
      return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
    }
    // All other paths → internally rewrite to /cabinet prefix so existing route tree still serves
    const target = pathname === "/" ? "/cabinet" : `/cabinet${pathname}`;
    const rewriteUrl = internalRewriteUrl(request, target);
    rewriteUrl.search = request.nextUrl.search;
    return applyRobotsPolicy(rewriteWithContext(rewriteUrl, requestHeaders, context), host, pathname);
  }

  // ─── admin.eterapy.com ───
  if (onAdmin) {
    if (!role) {
      return applyRobotsPolicy(redirectAbs(MAIN_DOMAIN, `/login?next=${encodeURIComponent("/admin")}`, context), host, pathname);
    }
    if (!isAdminRole(role)) {
      return applyRobotsPolicy(redirectAbs(APP_DOMAIN, "/cabinet", context), host, pathname);
    }
    if (pathname === "/") {
      return applyRobotsPolicy(redirect("/admin", request, context), host, pathname);
    }
    if (!pathname.startsWith("/admin") && pathname !== "/help" && !pathname.startsWith("/help/")) {
      return applyRobotsPolicy(redirect("/admin", request, context), host, pathname);
    }
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── eterapy.com (main) ───
  // Normalise www → apex already handled by nginx; just in case
  if (host === `www.${MAIN_DOMAIN}`) {
    return applyRobotsPolicy(redirectAbs(MAIN_DOMAIN, pathname, context), host, pathname);
  }

  // Logged-in user hitting main domain
  if (role) {
    // /cabinet here → push to app subdomain
    if (pathname.startsWith("/cabinet")) {
      return applyRobotsPolicy(redirectAbs(APP_DOMAIN, pathname, context), host, pathname);
    }
    // /admin here → push to admin subdomain
    if (pathname.startsWith("/admin")) {
      return applyRobotsPolicy(redirectAbs(ADMIN_DOMAIN, pathname, context), host, pathname);
    }
    // Login/register while logged in → home
    if (pathname === "/login" || pathname === "/register") {
      return applyRobotsPolicy(redirectAbs(domainForPath(homePathForRole(role)), homePathForRole(role), context), host, pathname);
    }
    // Landing page for logged-in user → their cabinet
    if (pathname === "/") {
      return applyRobotsPolicy(redirectAbs(domainForPath(homePathForRole(role)), homePathForRole(role), context), host, pathname);
    }
    // Other public pages (practitioners catalog, modalities, help, legal, how-to-choose, about) stay accessible
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // Guest on main domain — block protected paths, show everything else
  if (pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) {
    return applyRobotsPolicy(redirect(`/login?next=${encodeURIComponent(pathname)}`, request, context), host, pathname);
  }
  return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};

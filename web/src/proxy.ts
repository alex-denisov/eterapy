import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromCookie } from "@/lib/session-from-cookie";
import { getImpersonationFromRequest } from "@/lib/impersonation";
import { applyRequestContextHeaders, requestContextFromHeaders } from "@/lib/request-context";
import { shouldNoIndex } from "@/lib/seo";
import { legacyPublicRedirect } from "@/lib/legacy-public-routes";
import { MAIN_DOMAIN, APP_DOMAIN, ADMIN_DOMAIN } from "@/lib/env";
import { v5Products } from "@/lib/v5-products";
import { homeAgentMarkdown } from "@/lib/agent-readiness";

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

function withOriginalSearch(target: string, search: string): string {
  if (!search) return target;
  return `${target}${target.includes("?") ? "&" : "?"}${search.slice(1)}`;
}

function encodedNext(pathname: string, search: string): string {
  return encodeURIComponent(withOriginalSearch(pathname, search));
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
const APP_PUBLIC_MAIN_PATHS = [
  "/about",
  "/all-modalities",
  "/catalog",
  "/checkin",
  "/circle",
  "/experts",
  "/how-it-works",
  "/how-to-choose",
  "/legal",
  "/library",
  "/login",
  "/numerology",
  "/pair",
  // NOTE: "/practitioner" (singular) is intentionally NOT here. The practitioner
  // cabinet home is /cabinet/practitioner, which the app subdomain strips to
  // /practitioner — listing it would bounce the whole practitioner cabinet
  // (and every /practitioner/* subpage) back to the main domain (T23 bug).
  // The public directory is /practitioners (plural); the legacy singular
  // /practitioner → /practitioners redirect still fires on the main domain.
  "/practitioners",
  "/products/pair",
  "/pricing",
  "/products/chat-analysis",
  "/products/deep-report",
  "/products/natal-chart",
  "/products/synastry",
  "/products/numerology",
  "/products/reframe",
  "/products/tarot",
  "/register",
  "/share",
  "/specialists",
  "/tarot",
  "/telegram",
  "/tools",
];

export function shouldRedirectAppPublicPathToMain(pathname: string): boolean {
  if (APP_PUBLIC_MAIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }
  // B387/B389: любая валидная страница услуги — публичная (не кабинет). Деривим
  // из v5Products, чтобы новые услуги (human-design, family-scenarios, …) не
  // приходилось дублировать в списке выше (иначе app-поддомен гонит их в /login).
  const product = pathname.match(/^\/products\/([^/]+)\/?$/);
  return Boolean(product && VALID_PRODUCT_SLUGS.has(product[1]));
}

// M26/B367: выпиленные/неизвестные слаги услуг должны отдавать настоящий
// HTTP 404. notFound() внутри страницы не выставляет статус, потому что root
// loading.tsx начинает стримить ответ (200) раньше — поэтому гасим такие пути
// в middleware, переписывая их на заведомо несуществующий роут.
// B417: чат-услуга «Решить вопрос в чате» живёт на собственном статическом роуте
// /products/chat (не через [slug]/v5Products, т.к. это force-dynamic, auth-aware
// поверхность). Добавляем её слаг вручную — иначе middleware пометит путь как
// неизвестный (→ 404) и не распознает его как публичную страницу услуги.
const VALID_PRODUCT_SLUGS = new Set<string>([...v5Products.map((product) => product.slug), "chat"]);

// B373 (M26): любой слаг, которого нет в v5Products, отдаёт честный 404 (без
// редиректа). Выпиленные услуги и «Круг» (закрыт в B385) убраны из v5Products/
// sitemap/каталога/рекомендаций, поэтому их публичные страницы 404 автоматически —
// отдельный список RETIRED больше не нужен.
function unknownProductSlug(pathname: string): boolean {
  const match = pathname.match(/^\/products\/([^/]+)\/?$/);
  if (!match) return false;
  return !VALID_PRODUCT_SLUGS.has(match[1]);
}

// M26/B369: выпиленные кабинетные роуты (без редиректов). Покрываем и
// «голые» пути app-поддомена, и их /cabinet-формы на основном домене.
const REMOVED_PATHS = ["/cabinet/action-history", "/cabinet/map", "/action-history", "/map"];

function isRemovedPath(pathname: string): boolean {
  return REMOVED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAdminResultInspectionPath(pathname: string): boolean {
  return pathname.startsWith("/cabinet/results/") || pathname.startsWith("/results/");
}

export default async function proxy(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const requestHeaders = new Headers(request.headers);
  const host = (request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? "").split(":")[0].toLowerCase();
  const pathname = request.nextUrl.pathname;

  const servesPublicHome = !USE_SUBDOMAINS || host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`;
  if (servesPublicHome && pathname === "/" && request.headers.get("accept")?.includes("text/markdown")) {
    return withRequestContext(new NextResponse(homeAgentMarkdown(), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        Vary: "Accept",
      },
    }), context);
  }

  // B441 (M28): «perspectives» услуга переименована в «reframe» (Переосмысление).
  // Постоянный (308) редирект со старого слага — фиксируется ДО проверки
  // unknownProductSlug (иначе старый URL отдал бы 404).
  if (pathname === "/products/perspectives" || pathname.startsWith("/products/perspectives/")) {
    const target = pathname.replace("/products/perspectives", "/products/reframe");
    return applyRobotsPolicy(
      withRequestContext(NextResponse.redirect(new URL(target + request.nextUrl.search, request.url), 308), context),
      host,
      pathname,
    );
  }

  // B463 (M28): standalone «Совместимость» was folded into «Вместе» as the «Ваша связь»
  // mode (a relationship-type inside «Сверить взгляды»). The /products/compatibility
  // route was retired with no redirect → 404 (incl. legacy invite links). Permanent
  // (308) redirect to the compare scenario, preserving search (invite=…) so old invites
  // still resolve. Must run BEFORE unknownProductSlug, which would otherwise 404 it.
  if (pathname === "/products/compatibility" || pathname.startsWith("/products/compatibility/")) {
    const target = new URL("/products/pair", request.url);
    target.search = request.nextUrl.search;
    target.searchParams.set("scenario", "compare");
    return applyRobotsPolicy(
      withRequestContext(NextResponse.redirect(target, 308), context),
      host,
      pathname,
    );
  }

  if (unknownProductSlug(pathname) || isRemovedPath(pathname)) {
    return applyRobotsPolicy(
      rewriteWithContext(internalRewriteUrl(request, "/__product-not-found"), requestHeaders, context),
      host,
      pathname,
    );
  }
  const realSession = await getSessionFromCookie(request);
  const role = realSession.role;
  // U3: respect impersonation on the app host. When an admin/superadmin has an
  // active impersonation cookie they must be routed as the TARGET user (e.g. a
  // superadmin impersonating a client stays in the client cabinet instead of
  // being bounced to admin.eterapy.com by the staff-role check below). The admin
  // host always keeps the real (admin) role.
  const impersonation = await getImpersonationFromRequest(request);
  const impersonating = Boolean(
    impersonation && impersonation.impersonatorId === realSession.id && isAdminRole(role),
  );
  const appRole = impersonating ? (impersonation?.targetRole ?? role) : role;
  const legacyTarget = legacyPublicRedirect(pathname);

  if (ALWAYS_ALLOW.some(p => pathname.startsWith(p))) {
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── No-subdomain mode (local dev): only enforce path-level auth ───
  if (!USE_SUBDOMAINS) {
    if (legacyTarget) {
      return applyRobotsPolicy(redirect(withOriginalSearch(legacyTarget, request.nextUrl.search), request, context), host, pathname);
    }
    if ((pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) && !role) {
      return applyRobotsPolicy(redirect(`/login?next=${encodedNext(pathname, request.nextUrl.search)}`, request, context), host, pathname);
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
    if (shouldRedirectAppPublicPathToMain(pathname)) {
      return applyRobotsPolicy(
        redirectAbs(MAIN_DOMAIN, withOriginalSearch(pathname, request.nextUrl.search), context),
        host,
        pathname
      );
    }

    if (!appRole) {
      const nextPath = pathname.startsWith("/cabinet")
        ? pathname
        : pathname === "/"
          ? "/cabinet"
          : `/cabinet${pathname}`;
      return applyRobotsPolicy(redirectAbs(MAIN_DOMAIN, `/login?next=${encodedNext(nextPath, request.nextUrl.search)}`, context), host, pathname);
    }
    if (isAdminRole(appRole)) {
      if (isAdminResultInspectionPath(pathname)) {
        if (pathname.startsWith("/results/")) {
          const rewriteUrl = internalRewriteUrl(request, `/cabinet${pathname}`);
          rewriteUrl.search = request.nextUrl.search;
          return applyRobotsPolicy(rewriteWithContext(rewriteUrl, requestHeaders, context), host, pathname);
        }
        return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
      }
      return applyRobotsPolicy(redirectAbs(ADMIN_DOMAIN, "/admin", context), host, pathname);
    }
    // CLIENT or PRACTITIONER (or an admin/superadmin impersonating one)
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
      const nextPath = pathname.startsWith("/admin") ? pathname : "/admin";
      return applyRobotsPolicy(redirectAbs(MAIN_DOMAIN, `/login?next=${encodedNext(nextPath, request.nextUrl.search)}`, context), host, pathname);
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

  if (legacyTarget) {
    return applyRobotsPolicy(redirect(withOriginalSearch(legacyTarget, request.nextUrl.search), request, context), host, pathname);
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
    // Landing and all other public pages stay accessible for logged-in users
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // Guest on main domain — block protected paths, show everything else
  if (pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) {
    return applyRobotsPolicy(redirect(`/login?next=${encodedNext(pathname, request.nextUrl.search)}`, request, context), host, pathname);
  }
  return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};

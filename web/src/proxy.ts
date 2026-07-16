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
import { cspHeaders, cspValue } from "@/lib/security-headers";

// B523: заголовок-маркер per-request nonce для applyDocumentCsp.
const NONCE_REQUEST_HEADER = "x-eterapy-csp-nonce";

// B523: включает nonce-CSP для аутентифицированного рендера. Next читает nonce
// из request-заголовка Content-Security-Policy и проставляет его своим
// inline-скриптам; наш маркер повторяет тот же nonce для ответной политики.
function enableNonce(requestHeaders: Headers): void {
  const nonce = Buffer.from(globalThis.crypto.randomUUID()).toString("base64");
  requestHeaders.set(
    "content-security-policy",
    cspValue({ production: process.env.NODE_ENV === "production", nonce }),
  );
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);
}

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

// B523: CSP документа. Аутентифицированные поверхности (в requestHeaders уже
// проставлен nonce) получают nonce-политику БЕЗ 'unsafe-inline'; публичные
// (prerender) — статическую политику + строгий report-only для телеметрии.
function applyDocumentCsp<T extends NextResponse>(response: T, requestHeaders: Headers): T {
  const nonce = requestHeaders.get(NONCE_REQUEST_HEADER) ?? undefined;
  for (const header of cspHeaders(nonce ? { nonce } : {})) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

function nextWithContext(requestHeaders: Headers, context: { requestId: string; correlationId: string }) {
  applyRequestContextHeaders(requestHeaders, context);
  return applyDocumentCsp(withRequestContext(NextResponse.next({ request: { headers: requestHeaders } }), context), requestHeaders);
}

function rewriteWithContext(url: URL, requestHeaders: Headers, context: { requestId: string; correlationId: string }) {
  applyRequestContextHeaders(requestHeaders, context);
  return applyDocumentCsp(withRequestContext(NextResponse.rewrite(url, { request: { headers: requestHeaders } }), context), requestHeaders);
}

export function internalRewriteUrl(request: NextRequest, pathname: string): URL {
  // INC-066: rewrite обрабатывается ВНУТРИ процесса (один проход middleware)
  // только когда origin цели побайтово равен initUrl, который роутер Next
  // строит в resolve-routes.js как
  //   `${req.socket.encrypted || x-forwarded-proto.includes('https') ? 'https' : 'http'}` +
  //   `://${formatHostname(opts.hostname || 'localhost')}:${opts.port}`,
  // т.е. ПРОТОКОЛ из x-forwarded-proto, а хост/порт — из флагов запуска
  // листенера (у нас `next start --hostname 127.0.0.1 --port 3000/3100`;
  // ecosystem-конфиги зеркалят их в env HOSTNAME/PORT). Host-заголовок в
  // сравнении НЕ участвует, а request.nextUrl материализуется как
  // https://localhost:<port> — поэтому ни clone(nextUrl), ни прежний
  // http://localhost-хак, ни публичный Host-origin никогда не совпадали, и
  // каждый app-host rewrite уходил внешним прокси-хопом: Next заново
  // запрашивал сам себя, proxy выполнялся второй раз уже без app-хоста,
  // B477-защита срезала nonce-маркер, и наружу уходила статическая CSP +
  // report-only (прод-симптом INC-066). Относительную цель тоже нельзя:
  // adapter.js Next'а ре-абсолютизирует её обратно в localhost-origin. И на
  // env HOSTNAME опираться нельзя — в middleware-рантайме он 'localhost'
  // (проверено на staging), а не значение --hostname.
  // Поэтому: наличие x-forwarded-proto означает «мы за nginx», где листенер
  // у нас всегда 127.0.0.1 (--hostname в ecosystem-конфигах;
  // переопределяемо через ETERAPY_INTERNAL_REWRITE_HOST); протокол — из
  // x-forwarded-proto, порт — из nextUrl (он совпадает с портом листенера).
  // Без прокси-заголовка (локальный `next dev`, jest) nextUrl уже совпадает
  // с initUrl — чистый clone.
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "";
  const listenerHost =
    process.env.ETERAPY_INTERNAL_REWRITE_HOST || (forwardedProto ? "127.0.0.1" : "");
  if (listenerHost) {
    url.protocol = forwardedProto.includes("https") ? "https:" : "http:";
    url.hostname = listenerHost;
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
  // B477/B523: never trust a client-supplied CSP nonce. requestHeaders is built
  // from the incoming request, so strip any inbound nonce/CSP marker — only
  // enableNonce() (server-generated) may set them. Otherwise a caller could
  // pin a known nonce and weaken their document CSP.
  requestHeaders.delete(NONCE_REQUEST_HEADER);
  requestHeaders.delete("content-security-policy");
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
    // B523: nonce-CSP для аутентифицированного дерева (локальный no-subdomain).
    if (pathname.startsWith("/cabinet") || pathname.startsWith("/admin")) {
      enableNonce(requestHeaders);
    }
    return applyRobotsPolicy(nextWithContext(requestHeaders, context), host, pathname);
  }

  // ─── Production with subdomains ───────────────────────────────────
  const onMain = host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`;
  const onApp = host === APP_DOMAIN;
  const onAdmin = host === ADMIN_DOMAIN;

  // B523: app/admin поддомены рендерят /cabinet и /admin дерево — nonce-CSP без
  // 'unsafe-inline'. Публичные страницы услуг на app-поддомене редиректятся на
  // main (там остаётся статическая политика), /help — статический паспорт.
  const rendersAuthenticatedTree =
    (onApp && !shouldRedirectAppPublicPathToMain(pathname) && pathname !== "/help" && !pathname.startsWith("/help/")) ||
    (onAdmin && pathname.startsWith("/admin"));
  if (rendersAuthenticatedTree) {
    enableNonce(requestHeaders);
  }

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

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { mainUrl } from "@/lib/subdomain";
import { AUTH_HINT_COOKIE } from "@/lib/auth-hint";

const BASE_EXPIRED = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires: new Date(0),
  maxAge: 0,
};

function clearCookie(response: NextResponse, name: string, withDomain = false) {
  response.cookies.set(name, "", {
    ...BASE_EXPIRED,
    ...(withDomain && SHARED_COOKIE_DOMAIN ? { domain: SHARED_COOKIE_DOMAIN } : {}),
  });
}

/**
 * INC-068: выход — разрушающее действие на GET, а `<Link>` в Next.js
 * ПРЕДЗАГРУЖАЕТ цель, как только она попадает во вьюпорт. На экране профиля
 * мини-аппа кнопка «Выйти» была ссылкой — и открытие профиля разлогинивало
 * человека без единого нажатия. В логах прода это видно по маркеру `_rsc=`:
 *
 *   19:35:53 GET /api/auth/logout?callbackUrl=/miniapp&_rsc=… 307
 *   19:35:59 GET /miniapp/account?mode=login&…                200
 *
 * Ссылку на экране заменили на кнопку, но одной клиентской правки мало: любой
 * префетчер (браузер, следующий `<Link>`, сканер) снова уронит сессию. Поэтому
 * запрос с признаком предзагрузки обслуживаем как no-op — куки не трогаем.
 */
function isPrefetch(request: Request): boolean {
  const headers = request.headers;
  return headers.get("next-router-prefetch") === "1"
    || headers.get("purpose")?.toLowerCase() === "prefetch"
    || headers.get("x-purpose")?.toLowerCase() === "preview"
    || headers.get("x-moz")?.toLowerCase() === "prefetch"
    || headers.get("sec-purpose")?.toLowerCase().includes("prefetch") === true
    || new URL(request.url).searchParams.has("_rsc");
}

export async function GET(request: Request) {
  if (isPrefetch(request)) {
    return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const params = new URL(request.url).searchParams;
  const reason = params.get("reason");
  // B554: Mini App звал `?callbackUrl=/miniapp`, но параметр не читался — клиент
  // из Telegram-вебвью выбрасывало на публичный сайт без пути назад. Принимаем
  // только относительный внутренний путь: абсолютный URL здесь стал бы
  // open redirect.
  const callbackUrl = params.get("callbackUrl");
  const safeCallback = callbackUrl
    && callbackUrl.startsWith("/")
    && !callbackUrl.startsWith("//")
    ? callbackUrl
    : null;
  const target = reason === "blocked" || reason === "deleted"
    ? `/login?account=${reason}`
    : safeCallback ?? "/";
  // Внутренний путь резолвим относительно текущего origin, а не главного
  // домена: иначе возврат в Mini App снова уводит на публичный сайт.
  const response = NextResponse.redirect(
    safeCallback && !reason
      ? new URL(safeCallback, request.url)
      : new URL(mainUrl(target), request.url),
  );

  const names = [
    SESSION_COOKIE_NAME,
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-authjs.callback-url",
    "authjs.callback-url",
    "__Host-authjs.csrf-token",
    "authjs.csrf-token",
    "admin-impersonating",
    "admin-session-backup",
    "__Host-admin-session-backup",
    // W5: the active impersonation cookie must die on logout too, otherwise a
    // later (non-admin) login still trips the impersonation banner.
    "eterapy-imp",
    // INC-080: и видимая метка вместе с ним — плашку теперь рисует клиент по
    // ней, и пережившая выход метка врала бы про чужой аккаунт.
    "eterapy-imp-on",
    // B604: подсказка «этот браузер был авторизован». Пережив выход, она
    // заставила бы шапку рисовать заглушку вместо кнопки «Войти» — и человек
    // на секунду видел бы, что вход как будто ещё есть.
    AUTH_HINT_COOKIE,
  ];

  for (const name of names) {
    clearCookie(response, name, false);
    clearCookie(response, name, true);
  }

  return response;
}

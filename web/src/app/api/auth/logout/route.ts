import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { mainUrl } from "@/lib/subdomain";

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

export async function GET(request: Request) {
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
  ];

  for (const name of names) {
    clearCookie(response, name, false);
    clearCookie(response, name, true);
  }

  return response;
}

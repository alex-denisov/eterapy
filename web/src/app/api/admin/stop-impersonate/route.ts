/**
 * GET /api/admin/stop-impersonate
 *
 * Завершает режим имперсонации:
 * - Удаляет session cookie для app.eterapy.com
 * - Удаляет флаг admin-impersonating
 * - Перенаправляет обратно в админ-панель
 *
 * Сессия суперадмина на admin.eterapy.com никогда не трогалась, поэтому
 * восстановление не требуется.
 */
import { NextRequest, NextResponse } from "next/server";

const USE_SUBDOMAINS = process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true";
const APP_DOMAIN = "app.eterapy.com";
const ADMIN_DOMAIN = "admin.eterapy.com";
const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export async function GET(_req: NextRequest) {
  const adminUrl = USE_SUBDOMAINS
    ? `https://${ADMIN_DOMAIN}/admin`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com") + "/admin";

  const response = NextResponse.redirect(adminUrl);

  const expiredCookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  // Delete impersonation session cookie (scoped to app subdomain)
  if (USE_SUBDOMAINS) {
    response.cookies.set(COOKIE_NAME, "", { ...expiredCookieOpts, domain: APP_DOMAIN });
    response.cookies.set("admin-impersonating", "", { ...expiredCookieOpts, domain: APP_DOMAIN });
  } else {
    response.cookies.set(COOKIE_NAME, "", expiredCookieOpts);
    response.cookies.set("admin-impersonating", "", expiredCookieOpts);
  }

  // Clean up old backup cookies if they exist (legacy support)
  response.cookies.set("admin-session-backup", "", expiredCookieOpts);
  response.cookies.set("__Host-admin-session-backup", "", expiredCookieOpts);

  return response;
}

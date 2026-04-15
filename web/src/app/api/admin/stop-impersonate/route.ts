/**
 * GET /api/admin/stop-impersonate
 *
 * Завершает режим имперсонации:
 * - Восстанавливает сессию суперадмина из admin-session-backup cookie
 * - Удаляет флаг admin-impersonating
 * - Перенаправляет обратно в админ-панель
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { adminUrl } from "@/lib/subdomain";

const BACKUP_COOKIE_NAME = "admin-session-backup";

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL(adminUrl("/admin"), req.url));

  const expiredCookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: SHARED_COOKIE_DOMAIN,
    maxAge: 0,
  };

  // Restore admin session from backup
  const backup = req.cookies.get(BACKUP_COOKIE_NAME)?.value;
  if (backup) {
    response.cookies.set(SESSION_COOKIE_NAME, backup, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      domain: SHARED_COOKIE_DOMAIN,
      maxAge: 60 * 60 * 8, // 8 hours
    });
  } else {
    // No backup — clear the session so admin has to log in again
    response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOpts);
  }

  // Clear impersonation cookies
  response.cookies.set("admin-impersonating", "", expiredCookieOpts);
  response.cookies.set(BACKUP_COOKIE_NAME, "", expiredCookieOpts);

  return response;
}

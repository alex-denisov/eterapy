/**
 * GET /api/admin/stop-impersonate
 *
 * Ends impersonation by clearing the `eterapy-imp` cookie. The real superadmin
 * session is never touched under the new model (B1), so nothing needs to be
 * restored. For sessions that were started under the old swap model (still
 * in-flight at deploy time) we restore the backed-up admin session.
 */
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { adminUrl } from "@/lib/subdomain";
import { clearImpersonationCookie } from "@/lib/impersonation";

const BACKUP_COOKIE_NAME = "admin-session-backup";

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL(adminUrl("/admin"), req.url));

  const expired = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: SHARED_COOKIE_DOMAIN,
    maxAge: 0,
  };

  // New model: drop the separate impersonation cookie.
  clearImpersonationCookie(response);

  // Legacy swap model: if an admin-session backup is still present, restore it.
  // (We never CLEAR the session cookie when there is no backup — that would log
  // out a real superadmin who simply never impersonated.)
  const backup = req.cookies.get(BACKUP_COOKIE_NAME)?.value;
  if (backup) {
    response.cookies.set(SESSION_COOKIE_NAME, backup, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      domain: SHARED_COOKIE_DOMAIN,
      maxAge: 60 * 60 * 8,
    });
  }
  response.cookies.set("admin-impersonating", "", expired);
  response.cookies.set(BACKUP_COOKIE_NAME, "", expired);

  return response;
}

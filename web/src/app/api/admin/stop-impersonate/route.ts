/**
 * GET /api/admin/stop-impersonate
 * 
 * Восстанавливает оригинальную сессию администратора из backup cookie.
 * Удаляет backup cookie после восстановления.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const backupCookie = req.cookies.get("admin-session-backup");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";

  if (!backupCookie) {
    return NextResponse.redirect(new URL("/admin", baseUrl));
  }

  // Сначала удаляем текущую (impersonated) сессию
  // Затем восстанавливаем backup
  const response = NextResponse.redirect(new URL("/admin", baseUrl));

  response.cookies.set("__Secure-authjs.session-token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("authjs.session-token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  
  // Восстанавливаем обе возможные cookie — только одна будет активной
  response.cookies.set("__Secure-authjs.session-token", backupCookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  response.cookies.set("authjs.session-token", backupCookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  
  // Удаляем backup cookie
  response.cookies.set("admin-session-backup", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  
  return response;
}

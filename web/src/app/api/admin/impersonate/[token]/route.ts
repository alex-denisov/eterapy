/**
 * GET /api/admin/impersonate/[token]
 *
 * Принимает одноразовый токен имперсонации.
 * Создаёт JWT-сессию для целевого пользователя.
 * Текущая сессия (суперадмина) сохраняется в admin-session-backup cookie
 * и восстанавливается при /api/admin/stop-impersonate.
 *
 * Безопасность:
 * - Токен удаляется при первом открытии (one-time use)
 * - TTL: 5 минут
 * - AuditLog записан при генерации
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import db from "@/lib/db";
import { SESSION_COOKIE_NAME, SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";
import { adminUrl, appUrl } from "@/lib/subdomain";

const BACKUP_COOKIE_NAME = "admin-session-backup";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const record = await db.telegramLinkToken.findUnique({
    where: { token: `imp:${token}` },
  });

  if (!record || record.expiresAt < new Date()) {
    return new NextResponse(
      `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Ошибка</title>
      <style>body{font-family:sans-serif;background:#0e1628;color:#e8e0d4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
      .card{background:#1a2438;border:1px solid #2a3448;border-radius:16px;padding:40px;max-width:420px;text-align:center}
      h2{color:#ef4444}a{color:#c9a96e}</style></head>
      <body><div class="card"><h2>❌ Ссылка устарела</h2>
      <p style="color:#8899aa">Токен недействителен или истёк (TTL: 5 минут).</p>
      <p><a href="/admin/clients">← Вернуться в панель</a></p></div></body></html>`,
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // One-time use: delete immediately
  await db.telegramLinkToken.delete({ where: { token: `imp:${token}` } });

  const user = await db.user.findUnique({
    where: { id: record.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    return NextResponse.redirect(new URL(adminUrl("/admin/clients"), req.url));
  }

  const cabinet = user.role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";

  // Build the JWT payload in the same shape NextAuth v5 uses
  const now = Math.floor(Date.now() / 1000);
  const sessionToken = await encode({
    token: {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      iat: now,
      exp: now + 60 * 60 * 2, // 2 hours
      jti: crypto.randomUUID(),
    },
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE_NAME,
  });

  const response = NextResponse.redirect(new URL(appUrl(cabinet), req.url));

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: SHARED_COOKIE_DOMAIN,
    maxAge: 60 * 60 * 2,
  };

  // Save the current admin session so it can be restored later
  const currentSession = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (currentSession) {
    response.cookies.set(BACKUP_COOKIE_NAME, currentSession, cookieOpts);
  }

  // Set impersonated session
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, cookieOpts);

  // Flag for impersonation banner in cabinet layout
  response.cookies.set("admin-impersonating", "1", {
    ...cookieOpts,
  });

  return response;
}

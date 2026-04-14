/**
 * GET /api/admin/impersonate/[token]
 *
 * Принимает одноразовый токен имперсонации.
 * Создаёт JWT-сессию для целевого пользователя и устанавливает её
 * ТОЛЬКО для app.eterapy.com — сессия суперадмина на admin.eterapy.com
 * остаётся нетронутой.
 *
 * Безопасность:
 * - Токен удаляется при первом открытии (one-time use)
 * - TTL: 5 минут
 * - AuditLog записан при генерации
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import db from "@/lib/db";

const USE_SUBDOMAINS = process.env.NEXT_PUBLIC_USE_SUBDOMAINS === "true";
const APP_DOMAIN = "app.eterapy.com";
const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
    return NextResponse.redirect(new URL("/admin/clients", baseUrl));
  }

  const cabinet = user.role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";
  const appUrl = USE_SUBDOMAINS ? `https://${APP_DOMAIN}` : (process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com");

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
    salt: COOKIE_NAME,
  });

  const response = NextResponse.redirect(new URL(cabinet, appUrl));

  // Set session cookie scoped only to app.eterapy.com (not .eterapy.com)
  // This preserves the superadmin's session on admin.eterapy.com
  response.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
    // Only set domain when using subdomains; otherwise use current domain
    ...(USE_SUBDOMAINS ? { domain: APP_DOMAIN } : {}),
  });

  // Flag for impersonation banner in cabinet layout
  response.cookies.set("admin-impersonating", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
    ...(USE_SUBDOMAINS ? { domain: APP_DOMAIN } : {}),
  });

  return response;
}

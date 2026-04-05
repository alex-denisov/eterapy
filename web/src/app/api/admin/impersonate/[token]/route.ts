/**
 * GET /api/admin/impersonate/[token]
 *
 * Принимает одноразовый токен, рендерит HTML-страницу с авто-POST формой
 * на /api/auth/callback/credentials — NextAuth создаёт реальную JWT-сессию
 * от имени целевого пользователя.
 *
 * Безопасность:
 * - Токен удаляется при первом открытии страницы (в authorize callback)
 * - TTL: 5 минут
 * - Только суперадмин может сгенерировать токен (проверяется в /api/admin/impersonate GET)
 * - AuditLog записан при генерации токена
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Проверяем что токен существует и не истёк (не удаляем — это делает authorize callback)
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

  const user = await db.user.findUnique({
    where: { id: record.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/admin/clients", req.url));
  }

  const cabinet = user.role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";

  // CSRF token нужен для NextAuth credentials signIn.
  // Получаем через GET /api/auth/csrf.
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, { cache: "no-store" });
  const csrfData = await csrfRes.json().catch(() => ({ csrfToken: "" }));
  const csrfToken: string = csrfData.csrfToken ?? "";

  // Авто-сабмит формы — NextAuth обрабатывает POST /api/auth/callback/credentials
  // и устанавливает session cookie, затем редиректит на callbackUrl.
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Вход как ${user.name}</title>
  <style>
    body{font-family:sans-serif;background:#0e1628;color:#e8e0d4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#1a2438;border:1px solid #2a3448;border-radius:16px;padding:40px;max-width:440px;text-align:center}
    h2{color:#c9a96e;margin-bottom:8px}
    p{color:#8899aa;font-size:14px;margin:8px 0}
    .email{background:#0e1628;border-radius:8px;padding:12px;font-family:monospace;font-size:13px;margin:16px 0;color:#e8e0d4}
    .spinner{display:inline-block;width:24px;height:24px;border:3px solid #2a3448;border-top-color:#c9a96e;border-radius:50%;animation:spin 0.8s linear infinite;margin:16px 0}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <h2>👤 Вход как пользователь</h2>
    <div class="email">
      <strong>${user.name}</strong><br>
      ${user.email}<br>
      <small style="color:#556677">роль: ${user.role}</small>
    </div>
    <div class="spinner"></div>
    <p>Переключаем сессию...</p>
    <form id="f" method="POST" action="/api/auth/callback/credentials" style="display:none">
      <input name="csrfToken" value="${csrfToken}">
      <input name="impersonateToken" value="${token}">
      <input name="callbackUrl" value="${cabinet}">
    </form>
  </div>
  <script>
    // Небольшая задержка чтобы страница успела отрисоваться
    setTimeout(() => document.getElementById('f').submit(), 300);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

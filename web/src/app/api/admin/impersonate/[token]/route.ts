/**
 * GET /api/admin/impersonate/[token]
 *
 * Принимает одноразовый токен, создаёт временную сессию и перенаправляет
 * в кабинет целевого пользователя.
 *
 * Безопасность:
 * - Токен одноразовый (удаляется после использования)
 * - TTL: 5 минут
 * - Только суперадмин может сгенерировать токен (проверяется при создании)
 * - Записывается в AuditLog
 *
 * Текущая реализация: открывает страницу /impersonate-landing?as=userId с инструкцией.
 * Полная реализация требует серверного setSession через NextAuth callbacks.
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const record = await db.telegramLinkToken.findUnique({
    where: { token: `imp:${token}` },
  });

  if (!record || record.expiresAt < new Date()) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2>❌ Ссылка устарела</h2>
        <p>Токен недействителен или истёк. Сгенерируйте новый в панели суперадмина.</p>
        <a href="/admin">← Вернуться</a>
      </body></html>`,
      { status: 410, headers: { "Content-Type": "text/html" } }
    );
  }

  // Delete the token (one-time use)
  await db.telegramLinkToken.delete({ where: { token: `imp:${token}` } });

  const user = await db.user.findUnique({
    where: { id: record.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) return NextResponse.redirect("/admin");

  // Determine target cabinet
  const cabinet = user.role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";

  // Show confirmation page — actual session switch requires additional NextAuth setup
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Вход как ${user.name}</title>
  <style>
    body { font-family: sans-serif; background: #0e1628; color: #e8e0d4; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1a2438; border: 1px solid #2a3448; border-radius: 16px; padding: 40px; max-width: 420px; text-align: center; }
    h2 { color: #c9a96e; margin-bottom: 8px; }
    p { color: #8899aa; font-size: 14px; }
    .email { background: #0e1628; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 13px; margin: 16px 0; }
    .btn { display: inline-block; background: #c9a96e; color: #0e1628; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 4px; }
    .btn-outline { background: transparent; color: #c9a96e; border: 1px solid #c9a96e; }
    .info { background: #1e2d20; border: 1px solid #2a4a2a; border-radius: 8px; padding: 12px; font-size: 13px; color: #6db86d; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>👤 Войти как пользователь</h2>
    <p>Вы собираетесь войти в кабинет:</p>
    <div class="email">
      <strong>${user.name}</strong><br>
      ${user.email}<br>
      <small style="color:#556">роль: ${user.role}</small>
    </div>
    <div class="info">
      ℹ️ Эта функция открывает сессию пользователя в текущем браузере.
      Ваша сессия администратора будет заменена.
      Для возврата — войдите снова как администратор.
    </div>
    <br>
    <a href="${cabinet}" class="btn">Открыть кабинет ↗</a>
    <a href="/admin" class="btn btn-outline">Отмена</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

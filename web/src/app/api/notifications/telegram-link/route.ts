/**
 * GET    /api/notifications/telegram-link — текущий статус привязки Telegram
 * POST   /api/notifications/telegram-link — генерирует токен для привязки Telegram
 * DELETE /api/notifications/telegram-link — отвязывает Telegram
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getTelegramLinkUrl } from "@/lib/telegram";
import { randomBytes } from "crypto";
import { canUnlinkLoginProvider } from "@/lib/auth-access";
import { logAudit } from "@/lib/audit";
import { unbindTelegramFromUser } from "@/lib/telegram-binding";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramId: true, telegramUsername: true },
  });
  const linked = Boolean(user?.telegramId);
  const pendingToken = linked
    ? null
    : await db.telegramLinkToken.findFirst({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true, expiresAt: true },
    });

  return NextResponse.json({
    linked,
    username: user?.telegramUsername ?? null,
    pending: Boolean(pendingToken),
    url: pendingToken ? getTelegramLinkUrl(pendingToken.token) : null,
    expiresAt: pendingToken?.expiresAt.toISOString() ?? null,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, telegramUsername: true },
  });

  if (user?.telegramId) {
    return NextResponse.json({
      ok: true,
      linked: true,
      username: user.telegramUsername ?? null,
      pending: false,
      url: null,
      expiresAt: null,
    });
  }

  // Delete old tokens for this user
  await db.telegramLinkToken.deleteMany({ where: { userId } });

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

  await db.telegramLinkToken.create({ data: { token, userId, expiresAt } });

  const url = getTelegramLinkUrl(token);
  return NextResponse.json({
    ok: true,
    linked: false,
    pending: true,
    url,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, provider: true, providerId: true, telegramId: true, telegramUsername: true },
  });
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const guard = canUnlinkLoginProvider(user, "telegram");
  if (!guard.allowed) {
    return NextResponse.json({
      error: guard.reason === "last_login_method"
        ? "Сначала назначьте пароль или подключите другой способ входа"
        : "Telegram не подключён",
      code: guard.reason,
    }, { status: guard.reason === "last_login_method" ? 409 : 400 });
  }

  // INC-088: снимаем обе записи — адрес доставки и identity входа из Mini App.
  await unbindTelegramFromUser(userId);
  await logAudit(userId, "LOGIN_METHOD_UNLINK", undefined, JSON.stringify({ provider: "telegram" }));

  return NextResponse.json({
    ok: true,
    linked: false,
    username: null,
    pending: false,
    url: null,
    expiresAt: null,
  });
}

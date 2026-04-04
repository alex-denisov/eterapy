/**
 * POST /api/notifications/telegram-link  — генерирует токен для привязки Telegram
 * DELETE /api/notifications/telegram-link — отвязывает Telegram
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getTelegramLinkUrl } from "@/lib/telegram";
import { randomBytes } from "crypto";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Delete old tokens for this user
  await db.telegramLinkToken.deleteMany({ where: { userId } });

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут

  await db.telegramLinkToken.create({ data: { token, userId, expiresAt } });

  const url = getTelegramLinkUrl(token);
  return NextResponse.json({ ok: true, url, token, expiresAt: expiresAt.toISOString() });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.user.update({
    where: { id: session.user.id },
    data: { telegramId: null, telegramUsername: null },
  });

  return NextResponse.json({ ok: true });
}

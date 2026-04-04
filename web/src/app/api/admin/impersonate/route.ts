/**
 * GET /api/admin/impersonate?userId=xxx
 *
 * Войти в кабинет как другой пользователь (только SUPERADMIN).
 * Использует NextAuth signIn с специальным флагом в сессии.
 * Открывает /api/admin/impersonate-session → устанавливает cookie с временной сессией.
 *
 * Реализация: генерируем одноразовый токен в БД, открываем /api/auth/impersonate/[token].
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { randomBytes } from "crypto";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Только суперадмин" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // Superadmin cannot impersonate another superadmin
  if (target.role === "SUPERADMIN") {
    return NextResponse.json({ error: "Нельзя войти как суперадмин" }, { status: 403 });
  }

  // Generate short-lived impersonation token (5 minutes)
  const token = randomBytes(24).toString("hex");
  await db.telegramLinkToken.create({
    data: {
      token: `imp:${token}`,
      userId,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  // @ts-expect-error custom
  await logAudit(session.user.id, "IMPERSONATE", userId, `Вход как ${target.name} (${target.email})`);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUrl = `${baseUrl}/api/admin/impersonate/${token}`;

  return NextResponse.redirect(redirectUrl);
}

/**
 * GET /api/admin/impersonate?userId=xxx
 *
 * Войти в кабинет как другой пользователь (только SUPERADMIN).
 * Генерирует одноразовый токен и перенаправляет на страницу имперсонации.
 * Сессия суперадмина НЕ затрагивается — кабинет открывается в новой вкладке.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { randomBytes } from "crypto";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Только администратор и выше" }, { status: 403 });
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

  await logAudit(session.user.id, "IMPERSONATE", userId, `Вход как ${target.name} (${target.email})`);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const redirectUrl = `${baseUrl}/api/admin/impersonate/${token}`;

  return NextResponse.redirect(redirectUrl);
}

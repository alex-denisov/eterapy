import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: "Минимум 8 символов" }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.user!.id } });
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return NextResponse.json({ error: "Неверный текущий пароль" }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id: user.id }, data: { password: hashed } });
  await logAudit(user.id, "PASSWORD_CHANGE");

  return NextResponse.json({ ok: true });
}

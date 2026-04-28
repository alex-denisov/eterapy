import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: "Данные отсутствуют" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });

    const user = await usersDb.getByResetToken(token);
    if (!user) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
    if (user.resetExpires && Date.now() > new Date(user.resetExpires).getTime()) {
      return NextResponse.json({ error: "Ссылка истекла" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await usersDb.update(user.email, {
      password: passwordHash,
      resetToken: null,
      resetExpires: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

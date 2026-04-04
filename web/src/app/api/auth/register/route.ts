import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
    }
    if (await usersDb.get(email)) {
      return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
    }

    const user = await usersDb.create({ email, name, password });

    // Отправляем письмо подтверждения
    try {
      await sendVerificationEmail(email, name, user.verificationToken!);
    } catch (emailErr) {
      console.error("[register] email send failed:", emailErr);
      // Не блокируем регистрацию если email не отправился
    }

    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

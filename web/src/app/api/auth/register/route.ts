import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendVerificationEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { validateName, validateEmail } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }
    if (!validateName(name)) {
      return NextResponse.json({ error: "Имя может содержать только буквы, пробелы и дефисы (макс. 50 символов)" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Введите корректный email (без символа '+', макс. 50 символов)" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
    }
    if (await usersDb.get(email)) {
      return NextResponse.json({ error: "Email уже зарегистрирован", code: "DUPLICATE_EMAIL" }, { status: 409 });
    }

    const user = await usersDb.create({ email, name, password });

    // Отправляем письмо подтверждения
    try {
      await sendVerificationEmail(email, name, user.verificationToken!);
    } catch (emailErr) {
      console.error("[register] email send failed:", emailErr);
      // Не блокируем регистрацию если email не отправился
    }

    await logAudit(user.id, "REGISTER", undefined, `Регистрация: ${email}`);
    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

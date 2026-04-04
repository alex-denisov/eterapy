import { NextRequest, NextResponse } from "next/server";
import { usersStore } from "@/lib/users-store";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: "Данные отсутствуют" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });

    const user = usersStore.getByResetToken(token);
    if (!user) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
    if (user.resetExpires && Date.now() > user.resetExpires) {
      return NextResponse.json({ error: "Ссылка истекла" }, { status: 400 });
    }

    usersStore.update(user.email, {
      password,
      resetToken: null,
      resetExpires: null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

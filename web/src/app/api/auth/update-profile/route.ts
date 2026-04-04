import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { usersStore } from "@/lib/users-store";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  try {
    const { name, currentPassword, newPassword } = await req.json();
    const user = usersStore.get(session.user.email);
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

    const patch: Partial<typeof user> = {};

    if (name && name.trim() !== user.name) {
      if (name.trim().length < 2) return NextResponse.json({ error: "Имя слишком короткое" }, { status: 400 });
      patch.name = name.trim();
    }

    if (newPassword) {
      if (!currentPassword) return NextResponse.json({ error: "Введите текущий пароль" }, { status: 400 });
      if (user.password !== currentPassword) return NextResponse.json({ error: "Текущий пароль неверен" }, { status: 400 });
      if (newPassword.length < 6) return NextResponse.json({ error: "Новый пароль минимум 6 символов" }, { status: 400 });
      patch.password = newPassword;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
    }

    usersStore.update(session.user.email, patch);
    return NextResponse.json({ ok: true, name: patch.name ?? user.name });
  } catch (err) {
    console.error("[update-profile]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

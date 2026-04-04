import { NextRequest, NextResponse } from "next/server";
import { usersStore } from "@/lib/users-store";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Токен отсутствует" }, { status: 400 });

    const user = usersStore.getByVerificationToken(token);
    if (!user) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
    if (user.verificationExpires && Date.now() > user.verificationExpires) {
      return NextResponse.json({ error: "Ссылка истекла. Запросите новую." }, { status: 400 });
    }

    usersStore.update(user.email, {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    });

    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    console.error("[verify-email]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

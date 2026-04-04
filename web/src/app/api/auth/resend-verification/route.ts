import { NextRequest, NextResponse } from "next/server";
import { usersStore } from "@/lib/users-store";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email обязателен" }, { status: 400 });

    const user = usersStore.get(email);
    if (!user) return NextResponse.json({ ok: true }); // не раскрываем
    if (user.emailVerified) return NextResponse.json({ error: "Email уже подтверждён" }, { status: 400 });

    // Обновляем токен
    const token = crypto.randomUUID().replace(/-/g, "");
    usersStore.update(email, {
      verificationToken: token,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    await sendVerificationEmail(email, user.name, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resend-verification]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

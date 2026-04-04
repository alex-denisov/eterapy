import { NextRequest, NextResponse } from "next/server";
import { usersStore } from "@/lib/users-db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email обязателен" }, { status: 400 });

    // Всегда 200 — не раскрываем есть ли такой email
    const user = await usersDb.get(email);
    if (user) {
      const token = await usersDb.setResetToken(email);
      if (token) {
        try {
          await sendPasswordResetEmail(email, user.name, token);
        } catch (emailErr) {
          console.error("[forgot-password] email send failed:", emailErr);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

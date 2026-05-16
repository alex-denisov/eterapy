import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendPasswordResetEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { authRateLimitKey, authRateLimitResponse, checkAuthRateLimit, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ipLimit = checkRequestAuthRateLimit(req, "forgot-password", 10, 15 * 60_000);
    if (!ipLimit.allowed) return authRateLimitResponse(ipLimit);

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    const emailLimit = checkAuthRateLimit(authRateLimitKey("forgot-password:email", email), 5, 60 * 60_000);
    if (!emailLimit.allowed) return authRateLimitResponse(emailLimit);

    // Всегда 200 — не раскрываем есть ли такой email
    const user = await usersDb.get(email);
    if (user) {
      const token = await usersDb.setResetToken(email);
      if (token) {
        try {
          await sendPasswordResetEmail(email, user.name, token);
          await logAudit(user.id, "PASSWORD_RESET", undefined, "Запрошен сброс пароля");
        } catch (emailErr) {
          log.error("forgot_password.email_send_failed", { err: emailErr });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("forgot_password.unhandled", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendVerificationEmail } from "@/lib/email";
import { log } from "@/lib/logger";
import { authRateLimitKey, authRateLimitResponse, checkAuthRateLimit, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ipLimit = checkRequestAuthRateLimit(req, "resend-verification", 10, 15 * 60_000);
    if (!ipLimit.allowed) return authRateLimitResponse(ipLimit);

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email обязателен" }, { status: 400 });
    const emailLimit = checkAuthRateLimit(authRateLimitKey("resend-verification:email", email), 5, 60 * 60_000);
    if (!emailLimit.allowed) return authRateLimitResponse(emailLimit);

    const user = await usersDb.get(email);
    if (!user) return NextResponse.json({ ok: true }); // не раскрываем
    if (user.emailVerified) return NextResponse.json({ ok: true }); // не раскрываем статус

    // Обновляем токен
    const token = crypto.randomUUID().replace(/-/g, "");
    await usersDb.update(email, {
      verificationToken: token,
      verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await sendVerificationEmail(email, user.name, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("resend_verification.unhandled", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

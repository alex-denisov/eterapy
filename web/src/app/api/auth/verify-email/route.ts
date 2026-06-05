import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { grantWelcomeCredits } from "@/lib/welcome-credits";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Токен отсутствует" }, { status: 400 });

    const user = await usersDb.getByVerificationToken(token);
    if (!user) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 400 });
    if (user.verificationExpires && Date.now() > new Date(user.verificationExpires).getTime()) {
      return NextResponse.json({ error: "Ссылка истекла. Запросите новую." }, { status: 400 });
    }

    await usersDb.update(user.email, {
      emailVerified: true,
      verificationToken: null,
      verificationExpires: null,
    });

    void grantWelcomeCredits({ request: req, userId: user.id }).catch((error) => {
      log.warn("welcome_credits.grant_failed", { userId: user.id, errorName: error instanceof Error ? error.name : "unknown" });
    });

    await logAudit(user.id, "EMAIL_VERIFY", undefined, "Email подтверждён");
    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    log.error("verify_email.unhandled", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

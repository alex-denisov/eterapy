import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { grantWelcomeCredits } from "@/lib/welcome-credits";
import { confirmReferralOnVerification } from "@/lib/share-referral";

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
    });

    void grantWelcomeCredits({ request: req, userId: user.id }).catch((error) => {
      log.warn("welcome_credits.grant_failed", { userId: user.id, errorName: error instanceof Error ? error.name : "unknown" });
    });
    // B464: the verified-email referral gate must finish before the request
    // ends or a serverless/runtime boundary could discard the transaction.
    await confirmReferralOnVerification({ request: req, userId: user.id });
    // Clear the token only after the idempotent referral grant finishes. A
    // transient failure therefore remains retryable until the original expiry.
    await usersDb.update(user.email, {
      verificationToken: null,
      verificationExpires: null,
    });

    await logAudit(user.id, "EMAIL_VERIFY", undefined, "Email подтверждён");
    return NextResponse.json({ ok: true, email: user.email });
  } catch (err) {
    log.error("verify_email.unhandled", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

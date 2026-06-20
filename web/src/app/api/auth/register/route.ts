import { NextRequest, NextResponse } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendVerificationEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/logger";
import { validateName, validateEmail } from "@/lib/validation";
import { authRateLimitKey, authRateLimitResponse, checkAuthRateLimit, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import { attachReferralToRegisteredUser } from "@/lib/share-referral";
import { markChannelConversion } from "@/lib/channel-attribution";
import { attachByocAtRegistration } from "@/lib/byoc";
import { getRequestMeta } from "@/lib/request-meta";
import { normalizeEmailForFraud } from "@/lib/email-normalize";
import { readClientFingerprint } from "@/lib/guest-fingerprint";
import db from "@/lib/db";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { recordRegistrationConsent } from "@/lib/legal/consent";

export async function POST(req: NextRequest) {
  try {
    const ipLimit = checkRequestAuthRateLimit(req, "register", 10, 15 * 60_000);
    if (!ipLimit.allowed) return authRateLimitResponse(ipLimit);

    const dailyIpLimit = checkRequestAuthRateLimit(req, "register:daily:ip", 3, 24 * 60 * 60_000);
    if (!dailyIpLimit.allowed) return authRateLimitResponse(dailyIpLimit);

    const { email, password, name, acceptContract, acceptPdn } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }
    // B427 (M28): registration requires both checkboxes — the contract package
    // and the separate personal-data consent. Neither is pre-checked in the UI.
    if (acceptContract !== true || acceptPdn !== true) {
      return NextResponse.json(
        {
          error: "Для регистрации нужно принять документы платформы и согласие на обработку персональных данных",
          code: "CONSENT_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (!validateName(name)) {
      return NextResponse.json({ error: "Имя может содержать только буквы, пробелы и дефисы (макс. 50 символов)" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Введите корректный email (без символа '+', макс. 50 символов)" }, { status: 400 });
    }
    const emailLimit = checkAuthRateLimit(authRateLimitKey("register:email", email), 5, 60 * 60_000);
    if (!emailLimit.allowed) return authRateLimitResponse(emailLimit);
    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль минимум 8 символов" }, { status: 400 });
    }
    if (await usersDb.get(email)) {
      return NextResponse.json({ error: "Email уже зарегистрирован", code: "DUPLICATE_EMAIL" }, { status: 409 });
    }

    const user = await usersDb.create({ email, name, password });

    // B427 (M28): log the two registration consents (contract + ПДн) with the
    // accepted document versions, IP and user-agent. Best-effort — the UI already
    // gated submission on both checkboxes, so a log failure never blocks signup.
    try {
      const consentMeta = await getRequestMeta();
      await recordRegistrationConsent(db.consentLog, user.id, {
        ipAddress: consentMeta.ip ?? null,
        userAgent: req.headers.get("user-agent"),
      });
    } catch (consentErr) {
      log.error("register.consent_log_failed", { err: consentErr });
    }

    // B372 (M26): gmail-дубль через точки/+suffix — risk-флаг в антифрод-журнал
    // (регистрацию не блокируем: алиасы легальны, но велосити по ним — сигнал).
    try {
      const normalized = normalizeEmailForFraud(email);
      const aliasTwin = normalized.endsWith("@gmail.com")
        ? await db.user.findFirst({
          where: { normalizedEmail: normalized, id: { not: user.id } },
          select: { id: true, email: true },
        })
        : null;
      if (aliasTwin) {
        const fp = requestFingerprint(req);
        await logFraudEvent(db, {
          subjectType: "user",
          subjectId: user.id,
          actorUserId: user.id,
          riskScore: 45,
          riskFlags: ["gmail_alias_duplicate"],
          action: "register_gmail_alias_duplicate",
          status: "review",
          ipHash: fp.ipHash,
          userAgentHash: fp.userAgentHash,
          deviceHash: fp.deviceHash,
          metadata: { normalizedEmail: normalized, matchedUserId: aliasTwin.id },
        });
      }
    } catch (fraudErr) {
      log.error("register.gmail_alias_check_failed", { err: fraudErr });
    }
    await attachReferralToRegisteredUser({ request: req, userId: user.id }).catch((referralErr) => {
      log.error("register.referral_attach_failed", { err: referralErr });
    });
    await attachByocAtRegistration({ request: req, userId: user.id }).catch((byocErr) => {
      log.error("register.byoc_attach_failed", { err: byocErr });
    });
    await markChannelConversion({
      request: req,
      userId: user.id,
      conversionType: "registration",
      conversionId: user.id,
    }).catch((attributionErr) => {
      log.error("register.channel_attribution_failed", { err: attributionErr });
    });

    try {
      await sendVerificationEmail(email, name, user.verificationToken!);
    } catch (emailErr) {
      log.error("register.email_send_failed", { err: emailErr });
    }

    const meta = await getRequestMeta();
    const details = JSON.stringify({
      email,
      device: meta.device ?? null,
      // B372: клиентский отпечаток — виден в логах суперадминки.
      fingerprint: readClientFingerprint(req),
    });
    await logAudit(user.id, "REGISTER", undefined, details, meta.ip ?? undefined);
    
    return NextResponse.json({ ok: true, emailSent: true });
  } catch (err) {
    log.error("register.unhandled", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

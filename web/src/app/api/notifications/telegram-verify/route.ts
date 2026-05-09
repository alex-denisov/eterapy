import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

interface TelegramAuthData {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}

function verifyTelegramAuth(authData: TelegramAuthData): boolean {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!botToken) return false;

  const { hash, ...rest } = authData;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${(rest as Record<string, string>)[key]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return false;

  const authAge = Date.now() / 1000 - Number(authData.auth_date);
  return authAge < 86400; // Require auth to be within 24 hours
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const authData: TelegramAuthData = body;

    if (!authData.id || !authData.hash || !authData.auth_date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!verifyTelegramAuth(authData)) {
      log.warn("telegram-verify-invalid", { telegramId: authData.id });
      return NextResponse.json({ error: "Invalid Telegram signature" }, { status: 403 });
    }

    const telegramId = String(authData.id);
    const telegramUsername = authData.username ?? null;

    const existing = await db.user.findFirst({
      where: { telegramId },
      select: { id: true },
    });
    if (existing && existing.id !== session.user.id) {
      return NextResponse.json({ error: "Telegram already linked to another account" }, { status: 409 });
    }

    await db.telegramLinkToken.deleteMany({ where: { userId: session.user.id } }).catch(() => {});
    await db.user.update({
      where: { id: session.user.id },
      data: { telegramId, telegramUsername },
    });

    log.info("telegram-verify-linked", { userId: session.user.id, telegramId });

    return NextResponse.json({
      ok: true,
      linked: true,
      username: telegramUsername,
    });
  } catch (err) {
    log.error("telegram-verify-failed", { error: serializeError(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

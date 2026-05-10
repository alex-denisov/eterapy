/**
 * POST /api/telegram/setup-webhook
 * Регистрирует webhook URL в Telegram Bot API.
 * Вызывается один раз при деплое или вручную для настройки бота.
 */
import { NextResponse } from "next/server";
import { setTelegramWebhook } from "@/lib/telegram";

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
    || `${process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com"}/api/telegram/webhook`;

  const ok = await setTelegramWebhook(webhookUrl);
  
  return NextResponse.json({ 
    ok, 
    webhookUrl,
    usingRelay: Boolean(process.env.TELEGRAM_API_BASE),
    botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
  });
}

/**
 * POST /api/telegram/setup-webhook
 * Регистрирует webhook URL в Telegram Bot API.
 * Вызывается один раз при деплое или вручную для настройки бота.
 */
import { NextResponse } from "next/server";
import { configureTelegramBot, setTelegramWebhook } from "@/lib/telegram";
import { getTrackedTelegramMiniAppUrl } from "@/lib/telegram-growth";
import { APP_URL } from "@/lib/env";

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
    || `${APP_URL}/api/telegram/webhook`;

  const miniAppUrl = getTrackedTelegramMiniAppUrl(
    process.env.TELEGRAM_MINIAPP_URL
      || new URL("/miniapp?miniapp=telegram", APP_URL).toString(),
    "bot_menu",
  );
  const [webhookOk, branding] = await Promise.all([
    setTelegramWebhook(webhookUrl),
    configureTelegramBot({
      miniAppUrl,
      staging: APP_URL.includes("staging") || (process.env.TELEGRAM_BOT_USERNAME ?? "").includes("staging"),
    }),
  ]);
  const ok = webhookOk && branding.ok;
  
  return NextResponse.json({ 
    ok, 
    webhookUrl,
    miniAppUrl,
    branding,
    usingRelay: Boolean(process.env.TELEGRAM_API_BASE),
    botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
  });
}

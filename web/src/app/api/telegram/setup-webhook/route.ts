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

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  const ok = await setTelegramWebhook(webhookUrl);
  if (ok) {
    return NextResponse.json({ ok: true, webhookUrl });
  }
  return NextResponse.json({ error: "Failed to register webhook" }, { status: 500 });
}

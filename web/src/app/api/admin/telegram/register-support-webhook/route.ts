/**
 * POST /api/admin/telegram/register-support-webhook  (SUPERADMIN)
 *
 * Registers the dedicated support bot's webhook so staff replies in the
 * support supergroup reach the cabinet chat. Run this once after
 * TELEGRAM_SUPPORT_BOT_TOKEN is set in the runtime env (B7). The webhook
 * secret is read server-side from env and never returned.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mainUrl } from "@/lib/subdomain";
import { setSupportTelegramWebhook, hasSupportBot } from "@/lib/telegram";

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Только суперадмин" }, { status: 403 });
  }
  if (!hasSupportBot()) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_SUPPORT_BOT_TOKEN не задан в окружении прод-сервера" }, { status: 400 });
  }

  const webhookUrl = mainUrl("/api/telegram/support-webhook");
  const result = await setSupportTelegramWebhook(webhookUrl);
  return NextResponse.json({ ...result, webhookUrl }, { status: result.ok ? 200 : 502 });
}

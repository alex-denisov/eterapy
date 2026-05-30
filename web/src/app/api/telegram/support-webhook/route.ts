/**
 * POST /api/telegram/support-webhook
 *
 * Webhook for the DEDICATED support bot (@eterapy_support_bot). It handles the
 * support supergroup ONLY: staff replies to a forwarded user message (which
 * carry a `conversation: <id>` marker) are persisted as STAFF SupportMessages
 * so the client's cabinet chat surfaces them. Everything else is ignored —
 * no /start, /status or "unknown command" replies (those belong to the
 * notification bot and were the source of the B7 spam).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";

interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    date?: number;
    message_id?: number;
    message_thread_id?: number;
    chat: { id: number };
    from?: { username?: string };
    reply_to_message?: { text?: string; message_id?: number };
  };
}

export async function POST(req: NextRequest) {
  let claimedEventId: string | null = null;
  try {
    const secret = process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "";
    if (!secret && process.env.NODE_ENV === "production") {
      log.error("telegram-support-webhook-secret-missing", {});
      return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
    }
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret && provided !== secret) {
      log.warn("telegram-support-webhook-unauthorized", { hasSecret: Boolean(provided) });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json();
    } catch {
      return NextResponse.json({ ok: false });
    }

    const msg = update.message;
    if (!msg || !msg.text) return NextResponse.json({ ok: true });

    // Prefix with "support:" so support-bot update_ids never collide with the
    // notification bot's claims (both use provider "telegram").
    const eventId = `support:${update.update_id !== undefined ? update.update_id : `${msg.chat.id}:${msg.date}:${msg.message_id}`}`;
    const claim = await claimWebhookEvent({
      provider: "telegram",
      eventId,
      eventType: "support-reply",
      resourceId: String(msg.chat.id),
      payload: update as unknown as Prisma.InputJsonObject,
    });
    if (!claim.claimed || !claim.event) return NextResponse.json({ ok: true, duplicate: true });
    claimedEventId = claim.event.id;

    const chatId = String(msg.chat.id);
    const text = msg.text.trim();
    const supportGroupChatId = process.env.TELEGRAM_SUPPORT_CHAT_ID ?? process.env.SUPPORT_TELEGRAM_CHAT_ID ?? null;

    // Only act on staff replies inside the configured support group.
    const conversationId = msg.reply_to_message?.text?.match(/conversation:\s*([A-Za-z0-9_-]+)/)?.[1];
    if (supportGroupChatId && chatId === supportGroupChatId && conversationId) {
      const conversation = await db.supportConversation.findUnique({ where: { id: conversationId } });
      if (conversation && conversation.status === "OPEN") {
        const existing = msg.message_id !== undefined
          ? await db.supportMessage.findFirst({ where: { conversationId, telegramMessageId: msg.message_id }, select: { id: true } })
          : null;
        if (!existing) {
          await db.supportMessage.create({
            data: { conversationId, role: "STAFF", content: text, telegramMessageId: msg.message_id ?? null },
          });
          await db.supportConversation.update({
            where: { id: conversationId },
            data: { telegramChatId: chatId, telegramThreadId: msg.message_thread_id ?? null },
          });
        }
      }
      await completeWebhookEvent(claim.event.id, { result: "support-reply" });
      return NextResponse.json({ ok: true });
    }

    // Everything else in the support bot is intentionally ignored (no spam).
    await completeWebhookEvent(claim.event.id, { result: "ignored" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("telegram-support-webhook-unhandled", { error: serializeError(err) });
    if (claimedEventId) {
      await failWebhookEvent(claimedEventId, err).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }
}

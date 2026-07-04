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
    from?: { username?: string; is_bot?: boolean };
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
    const inSupportGroup = Boolean(supportGroupChatId && chatId === supportGroupChatId);
    // With privacy mode off the bot also receives its own forwarded user
    // messages and other bots — only human staff replies become STAFF messages.
    const fromBot = Boolean(msg.from?.is_bot);
    const isOwnForward = text.startsWith("ETerapy support");

    // Resolve the target conversation two ways (N1d multichat):
    //   1) by forum topic (message_thread_id) — staff just type in the client's
    //      topic and the reply is routed by thread;
    //   2) by the `conversation:<id>` marker in a Reply — the fallback.
    // B464 round-5 #13: сессии закрываются по 30-минутному таймауту, но ответ
    // поддержки, пришедший позже, обязан дойти клиенту — маршрутизируем БЕЗ
    // фильтра по статусу (forum topic уникален для каждой сессии, коллизий нет).
    let conversation: { id: string; telegramThreadId: number | null } | null = null;
    if (inSupportGroup && !fromBot && !isOwnForward) {
      if (typeof msg.message_thread_id === "number") {
        conversation = await db.supportConversation.findFirst({
          where: { telegramChatId: chatId, telegramThreadId: msg.message_thread_id },
          orderBy: { createdAt: "desc" },
          select: { id: true, telegramThreadId: true },
        });
      }
      if (!conversation) {
        const conversationId = msg.reply_to_message?.text?.match(/conversation:\s*([A-Za-z0-9_-]+)/)?.[1];
        if (conversationId) {
          const byMarker = await db.supportConversation.findUnique({
            where: { id: conversationId },
            select: { id: true, status: true, telegramThreadId: true },
          });
          if (byMarker) {
            conversation = { id: byMarker.id, telegramThreadId: byMarker.telegramThreadId };
          }
        }
      }
    }

    if (conversation) {
      const existing = msg.message_id !== undefined
        ? await db.supportMessage.findFirst({ where: { conversationId: conversation.id, telegramMessageId: msg.message_id }, select: { id: true } })
        : null;
      if (!existing) {
        await db.supportMessage.create({
          data: { conversationId: conversation.id, role: "STAFF", content: text, telegramMessageId: msg.message_id ?? null },
        });
        await db.supportConversation.update({
          where: { id: conversation.id },
          data: { telegramChatId: chatId, telegramThreadId: msg.message_thread_id ?? conversation.telegramThreadId ?? null },
        });
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

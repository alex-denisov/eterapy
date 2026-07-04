/**
 * POST /api/telegram/webhook
 * Webhook для Telegram-бота. Принимает обновления от Telegram.
 *
 * Команды:
 * /start <token> — привязывает telegramId к аккаунту пользователя
 * /start         — показывает инструкцию по привязке
 * /stop          — отвязывает Telegram-аккаунт
 * /status        — проверяет статус привязки
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { enableAllTelegramNotifications } from "@/lib/notifications";
import { sendTelegram } from "@/lib/telegram";
import { formatTelegramGrowthMessage, resolveTelegramGrowthPayload } from "@/lib/telegram-growth";
import { log, serializeError } from "@/lib/logger";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";
import { APP_URL } from "@/lib/env";

/** Безопасная отправка — не кидает ошибку, логирует при неудаче */
async function safeSend(chatId: string, text: string) {
  try {
    await sendTelegram(chatId, text);
  } catch (err) {
    log.error("telegram-webhook-send-failed", { error: serializeError(err) });
  }
}

export async function POST(req: NextRequest) {
  let claimedEventId: string | null = null;
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
    if (!webhookSecret && process.env.NODE_ENV === "production") {
      log.error("telegram-webhook-secret-missing", {});
      return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
    }

    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (webhookSecret && secret !== webhookSecret) {
      log.warn("telegram-webhook-unauthorized", { hasSecret: Boolean(secret) });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json();
    } catch {
      log.warn("telegram-webhook-invalid-json", {});
      return NextResponse.json({ ok: false });
    }

    const eventId = update.update_id !== undefined
      ? String(update.update_id)
      : `message:${update.message?.chat.id ?? "unknown"}:${update.message?.date ?? "unknown"}:${update.message?.text ?? ""}`;
    const claim = await claimWebhookEvent({
      provider: "telegram",
      eventId,
      eventType: update.message?.text?.split(" ")[0] ?? "update",
      resourceId: update.message?.chat.id !== undefined ? String(update.message.chat.id) : null,
      payload: update as unknown as Prisma.InputJsonObject,
    });
    if (!claim.claimed || !claim.event) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    claimedEventId = claim.event.id;

    const msg = update.message;
    if (!msg || !msg.text) {
      await completeWebhookEvent(claim.event.id, { result: "ignored" });
      return NextResponse.json({ ok: true });
    }

    const chatId = String(msg.chat.id);
    const username = msg.from?.username ?? null;
    const text = msg.text.trim();

    log.info("telegram-webhook-message", { command: text.split(" ")[0] });

    // B333: staff reply routing. When a message arrives in the
    // configured support group, see if it is a Telegram-reply to one of
    // our forwarded user messages — we tagged those with a
    // "conversation: <id>" line. Extract that and persist the staff
    // text as a SupportMessage so the polling chat widget surfaces it.
    const supportGroupChatId =
      process.env.TELEGRAM_SUPPORT_CHAT_ID ?? process.env.SUPPORT_TELEGRAM_CHAT_ID ?? null;
    if (supportGroupChatId && chatId === supportGroupChatId && msg.reply_to_message?.text) {
      const conversationIdMatch = msg.reply_to_message.text.match(/conversation:\s*([A-Za-z0-9_-]+)/);
      const conversationId = conversationIdMatch?.[1];
      if (conversationId) {
        const conversation = await db.supportConversation.findUnique({ where: { id: conversationId } });
        // Round-5 #13: ответ поддержки доходит и в сессию, закрытую 30-минутным
        // таймаутом — статус здесь не фильтруем (id из маркера точен).
        if (conversation) {
          // Dedupe — Telegram retries can re-deliver the same update.
          const existing = msg.message_id !== undefined
            ? await db.supportMessage.findFirst({
                where: { conversationId, telegramMessageId: msg.message_id },
                select: { id: true },
              })
            : null;
          if (!existing) {
            await db.supportMessage.create({
              data: {
                conversationId,
                role: "STAFF",
                content: text,
                telegramMessageId: msg.message_id ?? null,
              },
            });
            await db.supportConversation.update({
              where: { id: conversationId },
              data: {
                telegramChatId: chatId,
                telegramThreadId: msg.message_thread_id ?? null,
              },
            });
          }
          await completeWebhookEvent(claim.event.id, { result: "support-reply" });
          return NextResponse.json({ ok: true });
        }
      }
    }

    // B7: the notification bot must stay silent in the support group — running
    // /start/command logic there spammed staff with linking replies. The
    // dedicated support bot (/api/telegram/support-webhook) now owns the group.
    if (supportGroupChatId && chatId === supportGroupChatId) {
      await completeWebhookEvent(claim.event.id, { result: "support-group-ignored" });
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/start")) {
      const token = text.split(" ")[1]?.trim();

      if (!token) {
        const baseUrl = APP_URL;
        await safeSend(chatId,
          `👋 Добро пожаловать в ETerapy!\n\nЧтобы получать уведомления, привяжите Telegram к своему аккаунту:\n\n1. Войдите на <a href="${baseUrl}">ETerapy</a>\n2. Перейдите в Настройки → Уведомления\n3. Нажмите Привязать Telegram`
        );
        await completeWebhookEvent(claim.event.id, { result: "start-help" });
        return NextResponse.json({ ok: true });
      }

      const growthEntry = resolveTelegramGrowthPayload(token);
      if (growthEntry) {
        await safeSend(chatId, formatTelegramGrowthMessage(growthEntry));
        await completeWebhookEvent(claim.event.id, { result: `growth:${growthEntry.key}` });
        return NextResponse.json({ ok: true });
      }

      // Verify token from DB
      const link = await db.telegramLinkToken.findUnique({ where: { token } });
      if (!link || link.expiresAt < new Date()) {
        await safeSend(chatId, "❌ Ссылка устарела или неверна. Сгенерируйте новую в настройках аккаунта.");
        await completeWebhookEvent(claim.event.id, { result: "invalid-token" });
        return NextResponse.json({ ok: true });
      }

      // Check if this Telegram is already linked to someone else
      const existing = await db.user.findFirst({ where: { telegramId: chatId } });
      if (existing && existing.id !== link.userId) {
        await safeSend(chatId, "⚠️ Этот Telegram уже привязан к другому аккаунту ETerapy.");
        await completeWebhookEvent(claim.event.id, { result: "already-linked-other-user" });
        return NextResponse.json({ ok: true });
      }

      // Link
      await db.$transaction([
        db.user.update({
          where: { id: link.userId },
          data: { telegramId: chatId, telegramUsername: username },
        }),
        db.telegramLinkToken.delete({ where: { token } }),
      ]);

      // Механика 5: enable all Telegram notification toggles on link.
      await enableAllTelegramNotifications(link.userId).catch((e: unknown) =>
        log.error("telegram-webhook-enable-prefs-failed", { userId: link.userId, err: e }));

      const user = await db.user.findUnique({ where: { id: link.userId }, select: { name: true } });
      log.info("telegram-webhook-linked", { userId: link.userId });
      await safeSend(chatId,
        `✅ Telegram привязан!\nПривет, ${user?.name ?? ""}! Теперь вы будете получать уведомления ETerapy через Telegram.`
      );
      await completeWebhookEvent(claim.event.id, { result: "linked" });
      return NextResponse.json({ ok: true });
    }

    if (text === "/stop") {
      const user = await db.user.findFirst({ where: { telegramId: chatId } });
      if (!user) {
        await safeSend(chatId, "Ваш Telegram не привязан ни к одному аккаунту ETerapy.");
      } else {
        await db.user.update({ where: { id: user.id }, data: { telegramId: null, telegramUsername: null } });
        log.info("telegram-webhook-unlinked", { userId: user.id });
        await safeSend(chatId, "✅ Telegram отвязан от аккаунта ETerapy. Уведомления отключены.");
      }
      await completeWebhookEvent(claim.event.id, { result: "stop" });
      return NextResponse.json({ ok: true });
    }

    if (text === "/status") {
      const user = await db.user.findFirst({ where: { telegramId: chatId }, select: { name: true, email: true } });
      if (!user) {
        await safeSend(chatId, "❌ Telegram не привязан к аккаунту ETerapy.");
      } else {
        await safeSend(chatId, `✅ Привязан к аккаунту: ${user.name} (${user.email})`);
      }
      await completeWebhookEvent(claim.event.id, { result: "status" });
      return NextResponse.json({ ok: true });
    }

    // Unknown command
    await safeSend(chatId, "Доступные команды:\n/start — начало работы\n/status — статус привязки\n/stop — отвязать аккаунт");
    await completeWebhookEvent(claim.event.id, { result: "unknown-command" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("telegram-webhook-unhandled", { error: serializeError(err) });
    if (claimedEventId) {
      await failWebhookEvent(claimedEventId, err).catch((updateErr) => {
        log.error("telegram-webhook-fail-update-failed", { error: serializeError(updateErr) });
      });
    }
    // Always return 200 — Telegram will retry on 5xx
    return NextResponse.json({ ok: true });
  }
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    date?: number;
    message_id?: number;
    message_thread_id?: number;
    chat: { id: number };
    from?: { username?: string };
    // B333: staff replies in the support group carry the original
    // forwarded message in reply_to_message so we can pick up the
    // `conversation: <id>` marker without storing thread maps.
    reply_to_message?: {
      text?: string;
      message_id?: number;
    };
  };
}

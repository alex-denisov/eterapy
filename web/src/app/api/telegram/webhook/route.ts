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
const MINI_APP_URL = process.env.TELEGRAM_MINIAPP_URL
  ?? new URL("/miniapp?miniapp=telegram", APP_URL).toString();
const OPEN_APP_KEYBOARD = { inline_keyboard: [[{ text: "Разобрать ситуацию", web_app: { url: MINI_APP_URL } }]] };

async function safeSend(chatId: string, text: string, withAppButton = false) {
  try {
    await sendTelegram(chatId, text, withAppButton ? { replyMarkup: OPEN_APP_KEYBOARD } : undefined);
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

    // B482: ignore the former support group before the idempotency claim can
    // persist its raw Telegram payload. Support replies now require an
    // authenticated SUPERADMIN session in the first-party console.
    const supportGroupChatId =
      process.env.TELEGRAM_SUPPORT_CHAT_ID ?? process.env.SUPPORT_TELEGRAM_CHAT_ID ?? null;
    if (supportGroupChatId && String(update.message?.chat.id ?? "") === supportGroupChatId) {
      return NextResponse.json({ ok: true, supportGroupIgnored: true });
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

    if (text.startsWith("/start")) {
      const token = text.split(" ")[1]?.trim();

      if (!token) {
        // B554 (owner): прежний текст обещал «прояснить вопрос» и треть письма
        // отводил под уведомления — человек не понимал, что именно получит.
        // Теперь сразу назван результат, его цена и время.
        await safeSend(chatId,
          "<b>ETerapy — разбор вашей ситуации в тексте</b>\n\n"
          + "Опишите, что происходит. Мы зададим 2–3 уточняющих вопроса и вернём разбор: "
          + "что происходит, что на это влияет и с чего начать.\n\n"
          + "Первый разбор — бесплатно, без карты. Занимает около трёх минут.",
          true,
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
        `✅ Telegram подключён${user?.name ? `, ${user.name}` : ""}.\n\nТеперь сюда будут приходить выбранные уведомления ETerapy. Приложение открывается без повторного ввода пароля.`,
        true,
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
      const user = await db.user.findFirst({ where: { telegramId: chatId }, select: { name: true } });
      if (!user) {
        await safeSend(chatId, "Уведомления Telegram пока не подключены. Само приложение уже можно открыть.", true);
      } else {
        await safeSend(chatId, `✅ Уведомления подключены${user.name ? ` для ${user.name}` : ""}.`, true);
      }
      await completeWebhookEvent(claim.event.id, { result: "status" });
      return NextResponse.json({ ok: true });
    }

    // Unknown command
    await safeSend(chatId, "Опишите ситуацию в приложении — вернём разбор и первый шаг.\n\n/status — проверить уведомления\n/stop — отключить уведомления", true);
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

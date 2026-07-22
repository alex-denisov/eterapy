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
import {
  handleStarsPreCheckout,
  handleStarsSuccessfulPayment,
  type TelegramPreCheckoutQuery,
  type TelegramSuccessfulPayment,
} from "@/lib/payments/telegram-stars-webhook";

/** Безопасная отправка — не кидает ошибку, логирует при неудаче */
const MINI_APP_URL = process.env.TELEGRAM_MINIAPP_URL
  ?? new URL("/miniapp?miniapp=telegram", APP_URL).toString();
// B576: one outcome-led action in welcome, commands and the persistent menu.
const OPEN_APP_KEYBOARD = { inline_keyboard: [[{ text: "Начать разбор", web_app: { url: MINI_APP_URL } }]] };

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

    // B529: pre_checkout_query отвечается ДО и ВНЕ журнала идемпотентности.
    // Telegram ждёт ответ 10 секунд; повторная доставка того же запроса — это
    // ещё одна попытка покупателя оплатить, и промолчать в ответ на неё значит
    // уронить платёж. Отказ здесь бесплатен, поэтому ответить важнее, чем не
    // повториться.
    if (update.pre_checkout_query) {
      const result = await handleStarsPreCheckout(update.pre_checkout_query);
      log.info("telegram-webhook-precheckout", { result });
      return NextResponse.json({ ok: true, result });
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

    // B529: успешная оплата звёздами приходит сообщением БЕЗ текста — до этой
    // правки она попадала в ветку «ignored» ниже, то есть звёзды списались бы,
    // а покупка не выдалась.
    if (msg?.successful_payment) {
      const result = await handleStarsSuccessfulPayment({
        payment: msg.successful_payment,
        requestId: claim.event.id,
      });
      await completeWebhookEvent(claim.event.id, { result });
      return NextResponse.json({ ok: true, result });
    }

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
        // B576: job-first welcome, one action and a quiet explanation of the
        // bot's second role as the cross-platform notification endpoint.
        await safeSend(chatId,
          "<b>Что сейчас не даёт вам покоя?</b>\n\n"
          + "Опишите ситуацию своими словами. ETerapy задаст 2–3 коротких вопроса и соберёт первичный разбор: "
          + "факты, главную развилку и один следующий шаг.\n\n"
          + "Первичный разбор бесплатно, без карты и регистрации. Обычно около трёх минут.\n\n"
          + "Этот же бот присылает выбранные уведомления ETerapy. Проверить связь: /status, отключить: /stop.",
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
    await safeSend(chatId, "Опишите ситуацию в приложении. ETerapy соберёт первичный разбор и один следующий шаг.\n\n/status — проверить уведомления\n/stop — отключить уведомления", true);
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
  /** B529: подтверждение счёта перед списанием звёзд. */
  pre_checkout_query?: TelegramPreCheckoutQuery;
  message?: {
    text?: string;
    date?: number;
    message_id?: number;
    message_thread_id?: number;
    chat: { id: number };
    from?: { username?: string };
    /** B529: приходит вместо текста, когда звёзды уже списаны. */
    successful_payment?: TelegramSuccessfulPayment;
    // B333: staff replies in the support group carry the original
    // forwarded message in reply_to_message so we can pick up the
    // `conversation: <id>` marker without storing thread maps.
    reply_to_message?: {
      text?: string;
      message_id?: number;
    };
  };
}

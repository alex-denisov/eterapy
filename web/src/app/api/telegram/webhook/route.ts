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
import { bindTelegramToUser, findUserByTelegramSubject, unbindTelegramFromUser } from "@/lib/telegram-binding";
import { sendTelegram } from "@/lib/telegram";
import {
  formatTelegramGrowthMessage,
  getTrackedTelegramMiniAppUrl,
  resolveTelegramGrowthPayload,
} from "@/lib/telegram-growth";
import { log, serializeError } from "@/lib/logger";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";
import { APP_URL } from "@/lib/env";
import {
  handleStarsPreCheckout,
  handleStarsSuccessfulPayment,
  type TelegramPreCheckoutQuery,
  type TelegramSuccessfulPayment,
} from "@/lib/payments/telegram-stars-webhook";
import {
  applyMarketingModeration,
  parseMarketingModerationCallback,
} from "@/lib/marketing/moderation";
import { ingestInboundMessage } from "@/lib/marketing/inbound";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";

/** Безопасная отправка — не кидает ошибку, логирует при неудаче */
const MINI_APP_URL = getTrackedTelegramMiniAppUrl(
  process.env.TELEGRAM_MINIAPP_URL
    ?? new URL("/miniapp?miniapp=telegram", APP_URL).toString(),
  "bot_welcome",
);
// B576: one outcome-led action in welcome, commands and the persistent menu.
const OPEN_APP_KEYBOARD = { inline_keyboard: [[{ text: "Понять, что дальше", web_app: { url: MINI_APP_URL } }]] };

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
    if (supportGroupChatId && String(update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? "") === supportGroupChatId) {
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
      eventType: update.callback_query ? "callback_query" : update.message?.text?.split(" ")[0] ?? "update",
      resourceId: update.message?.chat.id !== undefined
        ? String(update.message.chat.id)
        : update.callback_query?.message?.chat.id !== undefined
          ? String(update.callback_query.message.chat.id)
          : null,
      payload: update as unknown as Prisma.InputJsonObject,
    });
    if (!claim.claimed || !claim.event) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    claimedEventId = claim.event.id;

    if (update.callback_query?.data && update.callback_query.message) {
      const parsed = parseMarketingModerationCallback(update.callback_query.data);
      if (!parsed) {
        await completeWebhookEvent(claim.event.id, { result: "unknown-callback" });
        return NextResponse.json({ ok: true });
      }
      const result = await applyMarketingModeration({
        ...parsed,
        chatId: String(update.callback_query.message.chat.id),
        actor: update.callback_query.from.username
          ? `telegram:@${update.callback_query.from.username}`
          : `telegram:${update.callback_query.from.id}`,
        callbackQueryId: update.callback_query.id,
        messageId: update.callback_query.message.message_id,
      });
      await completeWebhookEvent(claim.event.id, { result });
      return NextResponse.json({ ok: true, result });
    }

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

    // B618: комментарии к постам канала физически приходят в связанную группу
    // обсуждений. Это не переписка с ботом и не команда — это входящее SMM, и
    // отвечает на него премодерируемый конвейер, а не этот обработчик.
    if (msg?.text && msg.chat.id !== undefined) {
      const discussionChatId = await marketingPlatformValue("TELEGRAM_DISCUSSION_CHAT_ID")
        .catch(() => null);
      if (discussionChatId && String(msg.chat.id) === discussionChatId.trim()) {
        // Сам пересланный пост канала — это наша публикация, не комментарий.
        // Сообщения бота тоже пропускаем, иначе агент ответит сам себе.
        const skip = Boolean(msg.is_automatic_forward) || Boolean(msg.from?.is_bot);
        const ingested = skip ? null : await ingestInboundMessage({
          platform: "telegram",
          kind: "COMMENT",
          externalId: `${msg.chat.id}:${msg.message_id ?? msg.date ?? ""}`,
          threadId: String(msg.chat.id),
          authorLabel: msg.from?.username
            ? `@${msg.from.username}`
            : [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || null,
          text: msg.text,
          permalink: msg.chat.username && msg.message_id
            ? `https://t.me/${msg.chat.username}/${msg.message_id}`
            : null,
        }).catch((error: unknown) => {
          log.error("telegram-webhook-inbound-failed", { error: serializeError(error) });
          return null;
        });
        await completeWebhookEvent(claim.event.id, {
          result: skip ? "discussion-forward" : ingested?.created ? "inbound-created" : "inbound-known",
        });
        return NextResponse.json({ ok: true });
      }
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
        //
        // B708: приведено к профилю бота. Имя и описание бота говорят про Таро,
        // матрицу судьбы и натальную карту, а приветствие звало «описать
        // ситуацию» — человек приходил по раскладу и не находил ни слова о нём.
        // Порядок именно такой: сначала то, зачем пришли, потом то, что мы
        // умеем сверх этого. Обещания предсказать судьбу здесь нет и быть не
        // может — платформа этого не делает.
        await safeSend(chatId,
          "<b>С каким вопросом пришли?</b>\n\n"
          + "Таро, матрица судьбы, натальная карта, совместимость по дате — рассчитаем и разберём. "
          + "Или просто опишите ситуацию своими словами.\n\n"
          + "ETerapy задаст 2–3 коротких вопроса и соберёт разбор: "
          + "факты, главную развилку и один следующий шаг.\n\n"
          + "Бесплатно, без карты и регистрации, обычно около трёх минут. "
          + "Отвечает нейросеть, не специалист: это не терапия и не срочная помощь.\n\n"
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

      // INC-088: привязка ботом теперь пишет и identity входа из Mini App, а не
      // только адрес доставки. Конфликты («занят другим аккаунтом», «у аккаунта
      // уже другой Telegram») считает один слой на обе записи сразу.
      const bound = await bindTelegramToUser({
        userId: link.userId,
        subjectId: chatId,
        username,
        displayName: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || null,
      });
      if (!bound.ok) {
        await safeSend(chatId, bound.code === "IDENTITY_IN_USE"
          ? "⚠️ Этот Telegram уже привязан к другому аккаунту ETerapy."
          : "⚠️ К этому аккаунту уже привязан другой Telegram. Сначала отвяжите его в настройках.");
        await completeWebhookEvent(claim.event.id, { result: `link-conflict:${bound.code}` });
        return NextResponse.json({ ok: true });
      }
      await db.telegramLinkToken.delete({ where: { token } }).catch(() => undefined);

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
      // INC-088: ищем по обеим записям и снимаем обе. Иначе `/stop` у человека,
      // привязавшегося из Mini App, отвечал «не привязан ни к одному аккаунту».
      const user = await findUserByTelegramSubject(chatId);
      if (!user) {
        await safeSend(chatId, "Ваш Telegram не привязан ни к одному аккаунту ETerapy.");
      } else {
        await unbindTelegramFromUser(user.id);
        log.info("telegram-webhook-unlinked", { userId: user.id });
        await safeSend(chatId, "✅ Telegram отвязан от аккаунта ETerapy. Уведомления отключены, вход из Mini App тоже.");
      }
      await completeWebhookEvent(claim.event.id, { result: "stop" });
      return NextResponse.json({ ok: true });
    }

    if (text === "/status") {
      const user = await findUserByTelegramSubject(chatId);
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
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; username?: string };
    message?: {
      message_id: number;
      chat: { id: number };
    };
  };
  message?: {
    text?: string;
    date?: number;
    message_id?: number;
    message_thread_id?: number;
    chat: { id: number; username?: string };
    from?: { id?: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string };
    /** B618: пересланный в группу обсуждений пост канала, а не комментарий. */
    is_automatic_forward?: boolean;
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

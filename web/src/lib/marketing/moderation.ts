import { createHmac, timingSafeEqual } from "crypto";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { engagementToneById } from "@/lib/marketing/engagement-tone";
import {
  INBOUND_REPLY_CONTENT_TYPE,
  isConversationalContentType,
} from "@/lib/marketing/perimeter";
import { moderationChatIds, resolveMarketingChannel } from "@/lib/ops-notification-channel";
import { callTelegramApi, sendTelegram } from "@/lib/telegram";

type ModerationAction = "approve" | "revise" | "reject";

function secret() {
  const value = process.env.MARKETING_MODERATION_SECRET
    ?? process.env.TELEGRAM_WEBHOOK_SECRET
    ?? "";
  if (!value) throw new Error("MARKETING_MODERATION_SECRET or TELEGRAM_WEBHOOK_SECRET is not configured");
  return value;
}

function signature(action: ModerationAction, publicationId: string) {
  return createHmac("sha256", secret())
    .update(`${action}:${publicationId}`)
    .digest("base64url")
    .slice(0, 12);
}

export function marketingModerationCallback(action: ModerationAction, publicationId: string) {
  return `smm:${action}:${publicationId}:${signature(action, publicationId)}`;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseMarketingModerationCallback(value: string): {
  action: ModerationAction;
  publicationId: string;
} | null {
  const match = /^smm:(approve|revise|reject):([a-z0-9_-]{8,40}):([A-Za-z0-9_-]{12})$/.exec(value);
  if (!match) return null;
  const action = match[1] as ModerationAction;
  const publicationId = match[2];
  if (!safeEqual(match[3], signature(action, publicationId))) return null;
  return { action, publicationId };
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function short(value: string | null, limit: number) {
  if (!value) return "—";
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

export async function requestMarketingModeration(publicationId: string) {
  const publication = await db.externalPublication.findUnique({ where: { id: publicationId } });
  if (
    !publication
    || !isConversationalContentType(publication.contentType)
    || publication.status !== "REVIEW"
  ) {
    return { sent: false, reason: "not-reviewable" };
  }
  const isInboundReply = publication.contentType === INBOUND_REPLY_CONTENT_TYPE;
  const channel = await resolveMarketingChannel();
  if (channel.chatIds.length === 0) throw new Error("Marketing Telegram channel is not configured");

  const planned = (publication.scheduledFor ?? new Date()).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  });
  const message = [
    isInboundReply
      ? "<b>Премодерация ответа на входящее</b>"
      : "<b>Премодерация рекламного комментария</b>",
    "",
    `<b>Когда:</b> ${html(planned)} МСК`,
    `<b>Площадка:</b> ${html(publication.platform)}`,
    `<b>Регистр:</b> ${html(engagementToneById(publication.engagementTone)?.label ?? "не задан")}`,
    `<b>Куда/кому:</b> ${html(short(publication.engagementTargetLabel, 180))}`,
    publication.engagementTargetUrl
      ? `<b>Ссылка:</b> ${html(publication.engagementTargetUrl)}`
      : "<b>Ссылка:</b> —",
    isInboundReply
      ? `<b>Нам написали:</b> ${html(short(publication.engagementExcerpt, 500))}`
      : `<b>Контекст:</b> ${html(short(publication.engagementExcerpt, 500))}`,
    "",
    "<b>Предлагаемый текст:</b>",
    html(short(publication.body, 2_400)),
    "",
    `<b>Writer:</b> ${html(publication.agentWriterProvider ?? "—")} / ${html(publication.agentWriterModel ?? "—")}`,
    `<b>Reviewer:</b> ${html(publication.agentReviewerProvider ?? "—")} / ${html(publication.agentReviewerModel ?? "—")}`,
    "",
    "«Принять» разрешает официальный API-вызов. Если площадка или токен не поддерживают действие, будет создан инцидент — успех не подменяется.",
  ].join("\n");

  let firstMessageId: number | null = null;
  for (const chatId of channel.chatIds) {
    const messageId = await sendTelegram(chatId, message, {
      replyMarkup: {
        inline_keyboard: [[
          { text: "✅ Принять", callback_data: marketingModerationCallback("approve", publication.id) },
          { text: "✍️ Доработать", callback_data: marketingModerationCallback("revise", publication.id) },
          { text: "⛔ Отклонить", callback_data: marketingModerationCallback("reject", publication.id) },
        ]],
      },
    });
    firstMessageId ??= messageId;
  }
  await db.externalPublication.update({
    where: { id: publication.id },
    data: { telegramReviewMessageId: firstMessageId },
  });
  return { sent: true, messageId: firstMessageId, channel: channel.source };
}

export async function applyMarketingModeration(input: {
  action: ModerationAction;
  publicationId: string;
  chatId: string;
  actor: string;
  callbackQueryId: string;
  messageId?: number;
}) {
  const allowedChats = await moderationChatIds();
  if (!allowedChats.includes(input.chatId)) {
    throw new Error("Moderation callback came from a chat we do not moderate from");
  }

  const publication = await db.externalPublication.findUnique({
    where: { id: input.publicationId },
  });
  if (!publication || !isConversationalContentType(publication.contentType)) {
    throw new Error("Comment proposal not found");
  }
  if (publication.status !== "REVIEW") {
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: input.callbackQueryId,
      text: "Решение по этому комментарию уже принято.",
    });
    return { status: publication.status, duplicate: true };
  }

  const now = new Date();
  // Approving early must not collapse the day's pacing into one burst: a slot
  // still in the future keeps its planned minute, a passed slot goes out now.
  const plannedSlot = publication.scheduledFor && publication.scheduledFor > now
    ? publication.scheduledFor
    : now;
  const update = input.action === "approve"
    ? { status: "SCHEDULED", scheduledFor: plannedSlot, lastError: null }
    : input.action === "revise"
      ? { status: "REVIEW", agentReviewedAt: null, lastError: "REVISION_REQUESTED" }
      : { status: "ARCHIVED", lastError: "REJECTED_BY_MODERATOR" };
  const result = await db.externalPublication.update({
    where: { id: publication.id },
    data: {
      ...update,
      moderationDecisionBy: input.actor,
      moderationDecisionAt: now,
    },
  });
  // B618: отклонённый ответ закрывает и входящее — иначе сторож будет вечно
  // сообщать о «неотвеченном» сообщении, по которому решение уже принято.
  if (input.action === "reject" && publication.inboundReplyToId) {
    await db.marketingInboundMessage.updateMany({
      where: { id: publication.inboundReplyToId },
      data: { status: "IGNORED", lastError: "REJECTED_BY_MODERATOR" },
    }).catch(() => undefined);
  }

  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.action === "approve"
      ? "Принято: комментарий передан официальному адаптеру."
      : input.action === "revise"
        ? "Отправлено SMM-агенту на новую редакцию."
        : "Комментарий отклонён.",
  });
  if (input.messageId) {
    await callTelegramApi("editMessageReplyMarkup", {
      chat_id: input.chatId,
      message_id: input.messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => undefined);
  }
  log.info("marketing-moderation.decision", {
    publicationId: publication.id,
    action: input.action,
    actor: input.actor,
  });
  return { status: result.status, duplicate: false };
}

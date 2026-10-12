import { createHmac, timingSafeEqual } from "crypto";
import db from "@/lib/db";
import { log } from "@/lib/logger";
import { engagementToneById } from "@/lib/marketing/engagement-tone";
import {
  INBOUND_REPLY_CONTENT_TYPE,
  isConversationalContentType,
} from "@/lib/marketing/perimeter";
import { ownerIdeaSlot } from "@/lib/marketing/owner-ideas";
import {
  isOwnerReviewed,
  ownerReviewKind,
  recordOwnerDecision,
  setAwaitingReason,
  REASON_WINDOW_MS,
} from "@/lib/marketing/owner-review-state";
import { marketingDeliveryTargets, moderationChatIds, resolveMarketingChannel } from "@/lib/ops-notification-channel";
import { callTelegramApi, sendTelegram } from "@/lib/telegram";

/**
 * B640 — «ответил сам» появился, потому что владелец ответил пользователю
 * руками, а платформа этого не заметила: входящее осталось `DRAFTED`, и
 * сторож ещё двое суток напоминал о «неотвеченном» сообщении, на которое
 * ответ давно был. Отклонить черновик было нельзя без побочного смысла:
 * `reject` означает «ответ негоден», а не «вопрос уже закрыт».
 */
type ModerationAction = "approve" | "revise" | "reject" | "answered" | "remove";

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
  const match = /^smm:(approve|revise|reject|answered|remove):([a-z0-9_-]{8,40}):([A-Za-z0-9_-]{12})$/.exec(value);
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

function notesOf(raw: string | null): { format?: string; technique?: string } {
  try {
    return raw ? JSON.parse(raw) as { format?: string; technique?: string } : {};
  } catch {
    return {};
  }
}

function ownerReviewMessage(
  publication: {
    body: string | null;
    cluster: string | null;
    notes: string | null;
    engagementTargetUrl: string | null;
    engagementExcerpt: string | null;
    agentWriterProvider: string | null;
    agentWriterModel: string | null;
    agentReviewerProvider: string | null;
    agentReviewerModel: string | null;
  },
  kind: "comment" | "idea",
  planned: string,
): string {
  const notes = notesOf(publication.notes);
  const tags = [
    `<b>Кластер:</b> ${html(short(publication.cluster, 80))}`,
    `<b>Приём:</b> ${html(notes.technique ?? notes.format ?? "—")}`,
  ];
  if (kind === "comment") {
    return [
      "<b>Комментарий для ручной публикации</b>",
      "",
      `<b>Куда:</b> ${html(publication.engagementTargetUrl ?? "—")}`,
      ...tags,
      "",
      "<b>Текст (нажмите, чтобы скопировать):</b>",
      `<code>${html(short(publication.body, 900))}</code>`,
      "",
      "Публикуете вы руками. «Принять» = «Опубликовал»: так я считаю, насколько агент попал. "
        + "«Отклонить»/«Доработать» — следом напишите причину, агент сам решит, переписать целиком или поправить.",
    ].join("\n");
  }
  return [
    "<b>Премодерация идеи: новый пост</b>",
    "",
    `<b>Слот после «Принять»:</b> не раньше ${html(planned)} МСК`,
    ...tags,
    `<b>Ваша идея:</b> ${html(short(publication.engagementExcerpt, 300))}`,
    "",
    "<b>Текст поста:</b>",
    html(short(publication.body, 2_400)),
    "",
    `<b>Writer:</b> ${html(publication.agentWriterProvider ?? "—")} / ${html(publication.agentWriterModel ?? "—")}`,
    `<b>Reviewer:</b> ${html(publication.agentReviewerProvider ?? "—")} / ${html(publication.agentReviewerModel ?? "—")}`,
    "",
    "Без «Принять» пост не выйдет. «Отклонить»/«Доработать» — следом напишите причину, агент сам решит, переписать целиком или поправить.",
  ].join("\n");
}

function ownerReviewKeyboard(publicationId: string, kind: "comment" | "idea") {
  return {
    inline_keyboard: [
      [
        {
          text: kind === "comment" ? "✅ Принять · опубликовал" : "✅ Принять",
          callback_data: marketingModerationCallback("approve", publicationId),
        },
        { text: "✍️ Доработать", callback_data: marketingModerationCallback("revise", publicationId) },
        { text: "⛔ Отклонить", callback_data: marketingModerationCallback("reject", publicationId) },
      ],
      [{ text: "🗑 Убрать", callback_data: marketingModerationCallback("remove", publicationId) }],
    ],
  };
}

export async function requestMarketingModeration(publicationId: string) {
  const publication = await db.externalPublication.findUnique({ where: { id: publicationId } });
  if (
    !publication
    || !(isConversationalContentType(publication.contentType) || isOwnerReviewed(publication))
    || publication.status !== "REVIEW"
  ) {
    return { sent: false, reason: "not-reviewable" };
  }
  const ownerKind = isOwnerReviewed(publication) ? ownerReviewKind(publication.contentType) : null;
  const isInboundReply = publication.contentType === INBOUND_REPLY_CONTENT_TYPE;
  const channel = await resolveMarketingChannel();
  if (channel.chatIds.length === 0) throw new Error("Marketing Telegram channel is not configured");

  const planned = (publication.scheduledFor ?? new Date()).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  });
  const message = ownerKind ? ownerReviewMessage(publication, ownerKind, planned) : [
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

  // Доставка идёт по списку адресов до первого успеха: маркетинговый канал,
  // затем служебный. Ненастроенный канал (бот не добавлен → `chat not found`)
  // не должен убивать материал — вызывающий код помечает исключение `FAILED`.
  const targets = await marketingDeliveryTargets();
  let firstMessageId: number | null = null;
  let delivered: string | null = null;
  let lastError: unknown = null;
  for (const chatId of targets) {
    try {
      firstMessageId = await sendTelegram(chatId, message, {
        replyMarkup: ownerKind ? ownerReviewKeyboard(publication.id, ownerKind) : {
          inline_keyboard: [
            [
              { text: "✅ Принять", callback_data: marketingModerationCallback("approve", publication.id) },
              { text: "✍️ Доработать", callback_data: marketingModerationCallback("revise", publication.id) },
              { text: "⛔ Отклонить", callback_data: marketingModerationCallback("reject", publication.id) },
            ],
            // B640: только для входящих — у собственного поста «ответил сам»
            // смысла не имеет, отвечать там некому.
            ...(isInboundReply
              ? [[{
                text: "🙋 Ответил сам",
                callback_data: marketingModerationCallback("answered", publication.id),
              }]]
              : []),
          ],
        },
      });
      delivered = chatId;
      break;
    } catch (error) {
      lastError = error;
      log.warn("marketing-moderation.delivery_failed", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!delivered) throw lastError ?? new Error("Marketing moderation card was not delivered");
  if (delivered !== channel.chatIds[0]) {
    log.warn("marketing-moderation.delivered_to_fallback", { intended: channel.chatIds[0], delivered });
  }

  await db.externalPublication.update({
    where: { id: publication.id },
    data: { telegramReviewMessageId: firstMessageId },
  });
  return { sent: true, messageId: firstMessageId, channel: channel.source, delivered };
}

/** Переход из REVIEW только если строка всё ещё там: двойной тап не применит решение дважды. */
async function moveFromReview(id: string, data: Record<string, unknown>): Promise<boolean> {
  const result = await db.externalPublication.updateMany({ where: { id, status: "REVIEW" }, data });
  return result.count === 1;
}

async function ownerDecisionAlreadyTaken(callbackQueryId: string, status: string) {
  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: "Решение по этому материалу уже принято.",
  });
  return { status, duplicate: true };
}

async function applyOwnerReviewDecision(input: {
  action: ModerationAction;
  chatId: string;
  actor: string;
  callbackQueryId: string;
  messageId?: number;
  now: Date;
  publication: NonNullable<Awaited<ReturnType<typeof db.externalPublication.findUnique>>>;
}) {
  const { publication, now, action } = input;
  const kind = ownerReviewKind(publication.contentType);
  const notes = notesOf(publication.notes);
  const entry = {
    at: now.toISOString(),
    publicationId: publication.id,
    kind,
    cluster: publication.cluster,
    technique: notes.technique ?? notes.format ?? null,
  };
  const decided = { moderationDecisionBy: input.actor, moderationDecisionAt: now };
  let answer: string;
  let status = publication.status;

  if (action === "approve") {
    if (kind === "comment") {
      // Дороги наружу нет: «Принять» — отметка, что владелец опубликовал сам.
      if (!(await moveFromReview(publication.id, { status: "ARCHIVED", archiveReason: "PUBLISHED_BY_OWNER", lastError: null, ...decided }))) {
        return ownerDecisionAlreadyTaken(input.callbackQueryId, publication.status);
      }
      status = "ARCHIVED";
      answer = "Записал: опубликовано. Учту как удачный комментарий агента.";
    } else {
      const slot = publication.scheduledFor && publication.scheduledFor > now
        ? publication.scheduledFor
        : ownerIdeaSlot(now, 0);
      if (!(await moveFromReview(publication.id, { status: "SCHEDULED", autoPublish: true, scheduledFor: slot, lastError: null, ...decided }))) {
        return ownerDecisionAlreadyTaken(input.callbackQueryId, publication.status);
      }
      status = "SCHEDULED";
      answer = "Принято: пост встал в очередь выхода.";
    }
    await recordOwnerDecision({ ...entry, action: "approve", reason: null });
  } else if (action === "remove") {
    if (!(await moveFromReview(publication.id, { status: "ARCHIVED", archiveReason: "REMOVED_BY_OWNER", lastError: "REJECTED_BY_MODERATOR", ...decided }))) {
      return ownerDecisionAlreadyTaken(input.callbackQueryId, publication.status);
    }
    status = "ARCHIVED";
    await recordOwnerDecision({ ...entry, action: "remove", reason: null });
    answer = "Убрано без замены.";
  } else {
    // «Отклонить» и «Доработать» значат «переделай с учётом причины»: причина
    // приходит следующим сообщением (чат-канал не даёт «ответить» на карточку).
    await setAwaitingReason({
      publicationId: publication.id,
      action: action === "revise" ? "revise" : "reject",
      chatId: input.chatId,
      at: now.toISOString(),
    });
    answer = "Напишите причину следующим сообщением (10 минут): агент сам решит, переписать целиком или поправить.";
    await sendTelegram(
      input.chatId,
      `✍️ Напишите причину ${action === "revise" ? "правки" : "отказа"} одним сообщением в течение ${REASON_WINDOW_MS / 60_000} минут. `
        + "«Убрать» — если материал не нужен совсем.",
    ).catch((error) => log.warn("marketing-moderation.reason_prompt_failed", {
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  await callTelegramApi("answerCallbackQuery", { callback_query_id: input.callbackQueryId, text: answer });
  // «Отклонить»/«Доработать» оставляют кнопки: решение ещё не принято, пока нет причины.
  if (input.messageId && (action === "approve" || action === "remove")) {
    await callTelegramApi("editMessageReplyMarkup", {
      chat_id: input.chatId,
      message_id: input.messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => undefined);
  }
  log.info("marketing-moderation.owner_decision", { publicationId: publication.id, action, actor: input.actor });
  return { status, duplicate: false };
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
  if (!publication || !(isConversationalContentType(publication.contentType) || isOwnerReviewed(publication))) {
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
  if (isOwnerReviewed(publication)) {
    return applyOwnerReviewDecision({ ...input, publication, now });
  }
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
  // B640: владелец ответил человеку сам — вопрос закрыт, и закрыт он ОТВЕТОМ,
  // а не отказом. Разница не косметическая: `IGNORED` означало бы, что человеку
  // не ответили, и это осталось бы в статистике площадки навсегда.
  if (input.action === "answered" && publication.inboundReplyToId) {
    await db.marketingInboundMessage.updateMany({
      where: { id: publication.inboundReplyToId },
      data: { status: "ANSWERED", answeredAt: now, lastError: "ANSWERED_BY_OWNER" },
    }).catch(() => undefined);
  }

  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: input.callbackQueryId,
    text: input.action === "approve"
      ? "Принято: комментарий передан официальному адаптеру."
      : input.action === "revise"
        ? "Отправлено SMM-агенту на новую редакцию."
        : input.action === "answered"
          ? "Записал: вы ответили сами. Входящее закрыто, напоминаний по нему не будет."
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

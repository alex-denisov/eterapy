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
  isThreadsPlanPost,
  ownerReviewKind,
  recordOwnerDecision,
  setAwaitingReason,
  REASON_WINDOW_MS,
} from "@/lib/marketing/owner-review-state";
import { REJECT_TAGS, dropPending, putPending, readCardChunks, saveCardChunks, readOwnerRating, recordThreadsVerdict, rejectTagLabel } from "@/lib/marketing/threads-verdicts";
import { marketingDeliveryTargets, moderationChatIds, resolveMarketingChannel } from "@/lib/ops-notification-channel";
import { chunkCardMessage, partsBlock, replyPartsOf } from "@/lib/marketing/moderation-card";
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

function signature(action: string, publicationId: string) {
  return createHmac("sha256", secret())
    .update(`${action}:${publicationId}`)
    .digest("base64url")
    .slice(0, 12);
}

export function marketingModerationCallback(action: ModerationAction, publicationId: string) {
  return `smm:${action}:${publicationId}:${signature(action, publicationId)}`;
}

/** B764: подписанные кнопки поста Threads — оценка `smr` и причины `smt`. */
export function threadsCallback(prefix: "smr" | "smt", arg: string, publicationId: string): string {
  return `${prefix}:${arg}:${publicationId}:${signature(`${prefix}${arg}`, publicationId)}`;
}

export function parseThreadsCallback(value: string): { prefix: "smr" | "smt"; arg: string; publicationId: string } | null {
  const match = /^(smr|smt):([a-z0-9]{1,8}):([a-z0-9_-]{8,40}):([A-Za-z0-9_-]{12})$/.exec(value);
  if (!match) return null;
  if (!safeEqual(match[4], signature(`${match[1]}${match[2]}`, match[3]))) return null;
  return { prefix: match[1] as "smr" | "smt", arg: match[2], publicationId: match[3] };
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

/** Материал, который проходит владельца: идея, комментарий или (B764) плановый пост Threads. */
function passesOwner(row: { platform: string | null; contentType: string | null; source: string | null }): boolean {
  return isOwnerReviewed(row) || isThreadsPlanPost(row);
}

function reviewKindOf(row: { platform: string | null; contentType: string | null; source: string | null }): "comment" | "idea" | "post" {
  return isThreadsPlanPost(row) ? "post" : ownerReviewKind(row.contentType);
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function short(value: string | null, limit: number) {
  if (!value) return "—";
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

export interface CardNotes {
  format?: string;
  technique?: string;
  lifeArea?: string;
  fact?: string;
  instructionVersion?: string;
  ownerRating?: number;
  rounds?: number;
}

export function notesOf(raw: string | null): CardNotes {
  try {
    return raw ? JSON.parse(raw) as CardNotes : {};
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
  kind: "comment" | "idea" | "post",
  planned: string,
): string {
  const notes = notesOf(publication.notes);
  // B773: продолжение поста (ответы под ним) — часть того, что утверждает владелец.
  const parts = partsBlock(replyPartsOf(publication.notes));
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
  if (kind === "post") {
    return [
      "<b>Пост Threads на одобрение</b>",
      "",
      `<b>Слот:</b> ${html(planned)} МСК`,
      ...tags,
      ...(notes.fact ? [`<b>Факт:</b> ${html(short(notes.fact, 200))}`] : []),
      "",
      "<b>Текст поста:</b>",
      html(publication.body ?? ""),
      ...(parts ? ["", parts] : []),
      "",
      `<b>Автор:</b> ${html(publication.agentWriterProvider ?? "—")} / ${html(publication.agentWriterModel ?? "—")}`,
      `<b>Проверяющий:</b> ${html(publication.agentReviewerProvider ?? "—")} / ${html(publication.agentReviewerModel ?? "—")}`,
      "",
      "Без «Публиковать» пост не выйдет и не пропадёт: слот ждёт вашего решения. "
        + "«Доработать» и «Отказать» — комментарий пришлёт ответом на ЭТУ карточку. Оценка 1–10 — по желанию.",
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
    html(publication.body ?? ""),
    ...(parts ? ["", parts] : []),
    "",
    `<b>Writer:</b> ${html(publication.agentWriterProvider ?? "—")} / ${html(publication.agentWriterModel ?? "—")}`,
    `<b>Reviewer:</b> ${html(publication.agentReviewerProvider ?? "—")} / ${html(publication.agentReviewerModel ?? "—")}`,
    "",
    "Без «Принять» пост не выйдет. «Отклонить»/«Доработать» — следом напишите причину, агент сам решит, переписать целиком или поправить.",
  ].join("\n");
}

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function threadsCardKeyboard(publicationId: string, rating: number | null = null) {
  const rateButton = (n: number) => ({
    text: rating === n ? `● ${n}` : String(n),
    callback_data: threadsCallback("smr", String(n), publicationId),
  });
  return {
    inline_keyboard: [
      [
        { text: "✅ Публиковать", callback_data: marketingModerationCallback("approve", publicationId) },
        { text: "✍️ Доработать", callback_data: marketingModerationCallback("revise", publicationId) },
        { text: "⛔ Отказать", callback_data: marketingModerationCallback("reject", publicationId) },
      ],
      RATINGS.slice(0, 5).map(rateButton),
      RATINGS.slice(5).map(rateButton),
      [{ text: "🗑 Убрать", callback_data: marketingModerationCallback("remove", publicationId) }],
    ],
  };
}

/** Теги причин отказа: нажатие переключает, «Отправить» завершает (текст — ответом на подсказку). */
export function rejectTagsKeyboard(publicationId: string, chosen: readonly string[]) {
  const rows = [];
  for (let i = 0; i < REJECT_TAGS.length; i += 2) {
    rows.push(REJECT_TAGS.slice(i, i + 2).map((tag, j) => ({
      text: `${chosen.includes(tag.id) ? "✓ " : ""}${tag.label}`,
      callback_data: threadsCallback("smt", String(i + j), publicationId),
    })));
  }
  rows.push([{ text: "📨 Отправить отказ", callback_data: threadsCallback("smt", "go", publicationId) }]);
  return { inline_keyboard: rows };
}

function ownerReviewKeyboard(publicationId: string, kind: "comment" | "idea" | "post") {
  if (kind === "post") return threadsCardKeyboard(publicationId);
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
    || !(isConversationalContentType(publication.contentType) || passesOwner(publication))
    || publication.status !== "REVIEW"
  ) {
    return { sent: false, reason: "not-reviewable" };
  }
  const ownerKind = passesOwner(publication) ? reviewKindOf(publication) : null;
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
  const targets = [...new Set(await marketingDeliveryTargets())];
  const chunks = chunkCardMessage(message);
  const replyMarkup = ownerKind ? ownerReviewKeyboard(publication.id, ownerKind) : {
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
        };
  let chunkIds: number[] = [];
  let delivered: string | null = null;
  let lastError: unknown = null;
  for (const chatId of targets) {
    try {
      chunkIds = await deliverChunks(chatId, chunks, replyMarkup);
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
  // Кнопки стоят под последним сообщением — оно и «карточка»; id остальных
  // частей хранится, чтобы reply на любую часть привязывался к той же карточке.
  const firstMessageId = chunkIds[chunkIds.length - 1] || null;
  await saveCardChunks(publication.id, chunkIds.filter((id) => id > 0)).catch((error) => {
    log.warn("marketing-moderation.chunks_not_saved", { error: error instanceof Error ? error.message : String(error) });
  });

  await db.externalPublication.update({
    where: { id: publication.id },
    data: { telegramReviewMessageId: firstMessageId },
  });
  return { sent: true, messageId: firstMessageId, channel: channel.source, delivered };
}

/**
 * Все части карточки уходят в ОДИН чат. Сбой на части N не отправляет карточку
 * в запасной чат с нуля, пока в этом чате не доотправлены оставшиеся части:
 * вторая попытка продолжает с места сбоя, а не дублирует уже доставленное.
 */
async function deliverChunks(chatId: string, chunks: readonly string[], replyMarkup: NonNullable<Parameters<typeof sendTelegram>[2]>["replyMarkup"]): Promise<number[]> {
  const ids: number[] = [];
  let failure: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      for (let index = ids.length; index < chunks.length; index += 1) {
        const isLast = index === chunks.length - 1;
        ids.push((await sendTelegram(chatId, chunks[index], isLast ? { replyMarkup } : undefined)) ?? 0);
      }
      return ids;
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error("card chunk delivery failed");
}

/** Переход из REVIEW только если строка всё ещё там: двойной тап не применит решение дважды. */
async function moveFromReview(id: string, data: Record<string, unknown>): Promise<boolean> {
  const result = await db.externalPublication.updateMany({ where: { id, status: "REVIEW" }, data });
  return result.count === 1;
}

/**
 * B764 — слот, который не сгорает. Будущий слот строки сохраняется; если окно
 * закрылось, пока пост ждал владельца, пост встаёт на ближайший свободный слот,
 * не ближе 20 минут к уже занятым.
 */
export async function threadsApprovalSlot(
  publication: { platform: string; scheduledFor: Date | null },
  now: Date,
): Promise<Date> {
  if (publication.scheduledFor && publication.scheduledFor.getTime() - now.getTime() > 10 * 60_000) {
    return publication.scheduledFor;
  }
  const taken = await db.externalPublication.findMany({
    where: { platform: publication.platform, status: { in: ["SCHEDULED", "MANUAL"] }, scheduledFor: { gte: now } },
    select: { scheduledFor: true },
  });
  for (let i = 0; i < 24; i++) {
    const candidate = ownerIdeaSlot(now, i);
    if (!taken.some((row) => row.scheduledFor && Math.abs(row.scheduledFor.getTime() - candidate.getTime()) < 20 * 60_000)) {
      return candidate;
    }
  }
  return ownerIdeaSlot(now, 0);
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
  const kind = reviewKindOf(publication);
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
      const slot = kind === "post"
        ? await threadsApprovalSlot(publication, now)
        : publication.scheduledFor && publication.scheduledFor > now
          ? publication.scheduledFor
          : ownerIdeaSlot(now, 0);
      if (!(await moveFromReview(publication.id, { status: "SCHEDULED", autoPublish: true, scheduledFor: slot, lastError: null, ...decided }))) {
        return ownerDecisionAlreadyTaken(input.callbackQueryId, publication.status);
      }
      status = "SCHEDULED";
      answer = "Принято: пост встал в очередь выхода.";
    }
    await recordOwnerDecision({ ...entry, action: "approve", reason: null });
    if (kind === "post") {
      await recordThreadsVerdict(threadsVerdictOf(publication, "approve", [], null, now, await readOwnerRating(publication.id)));
      await dropPending(publication.id);
    }
  } else if (action === "remove") {
    if (!(await moveFromReview(publication.id, { status: "ARCHIVED", archiveReason: "REMOVED_BY_OWNER", lastError: "REJECTED_BY_MODERATOR", ...(kind === "post" ? { planSlot: null } : {}), ...decided }))) {
      return ownerDecisionAlreadyTaken(input.callbackQueryId, publication.status);
    }
    status = "ARCHIVED";
    await recordOwnerDecision({ ...entry, action: "remove", reason: null });
    if (kind === "post") await dropPending(publication.id);
    answer = "Убрано без замены.";
  } else if (kind === "post") {
    answer = await promptThreadsReason({ ...input, publication, action: action === "revise" ? "revise" : "reject" });
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

/** Вердикт по строке: всё, из чего собран пост, чтобы потом считать связки. */
export function threadsVerdictOf(
  publication: {
    id: string;
    notes: string | null;
    cluster: string | null;
    agentWriterProvider: string | null;
    agentWriterModel: string | null;
  },
  decision: "approve" | "revise" | "reject",
  tags: readonly string[],
  comment: string | null,
  now: Date,
  rating: number | null = null,
) {
  const notes = notesOf(publication.notes);
  return {
    at: now.toISOString(),
    publicationId: publication.id,
    decision,
    rating,
    tags: [...tags],
    comment,
    writerProvider: publication.agentWriterProvider,
    writerModel: publication.agentWriterModel,
    format: notes.format ?? null,
    cluster: publication.cluster,
    technique: notes.technique ?? null,
    lifeArea: notes.lifeArea ?? null,
    fact: notes.fact ?? null,
    instructionVersion: notes.instructionVersion ?? null,
    round: (notes.rounds ?? 0) + 1,
  };
}

/**
 * B764 — «Доработать»/«Отказать» у поста: бот отвечает (reply) на ЭТУ карточку и
 * ждёт комментарий именно в её треде; ожидание хранится по карточке, поэтому
 * соседние карточки пачки не путаются.
 */
async function promptThreadsReason(input: {
  action: "revise" | "reject";
  chatId: string;
  messageId?: number;
  now: Date;
  publication: { id: string };
}): Promise<string> {
  const cardMessageId = input.messageId ?? null;
  const text = input.action === "revise"
    ? "✍️ Ответьте на ЭТО сообщение комментарием: что поправить. Агент перепишет или поправит точечно."
    : "⛔ Отметьте причины тегами и/или ответьте на ЭТО сообщение текстом, затем «Отправить отказ».";
  let promptMessageId: number | null = null;
  try {
    promptMessageId = await sendTelegram(input.chatId, text, {
      ...(cardMessageId ? { replyToMessageId: cardMessageId } : {}),
      ...(input.action === "reject" ? { replyMarkup: rejectTagsKeyboard(input.publication.id, []) } : {}),
    });
  } catch (error) {
    log.warn("marketing-moderation.reason_prompt_failed", { error: error instanceof Error ? error.message : String(error) });
  }
  await putPending({
    publicationId: input.publication.id,
    action: input.action,
    chatId: input.chatId,
    cardMessageId,
    promptMessageId,
    chunkMessageIds: await readCardChunks(input.publication.id).catch(() => []),
    tags: [],
    at: input.now.toISOString(),
  }, input.now);
  return input.action === "revise"
    ? "Ответьте комментарием на подсказку под карточкой."
    : "Выберите причины и/или ответьте текстом на подсказку.";
}

export { rejectTagLabel };

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
  if (!publication || !(isConversationalContentType(publication.contentType) || passesOwner(publication))) {
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
  if (passesOwner(publication)) {
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

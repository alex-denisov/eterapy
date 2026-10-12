/**
 * B761 — причина отказа владельца и решение агента: переписать целиком или
 * поправить частично.
 *
 * «Отклонить»/«Доработать» на карточке идеи или комментария не архивируют
 * материал, а просят причину. Причину пишет владелец следующим сообщением в том
 * же чате (в канале «ответить» на карточку нельзя). Дальше агент САМ выбирает
 * режим; больше трёх кругов отказа у одного материала — и он просит текст
 * владельца вместо четвёртой попытки.
 */

import { Prisma } from "@prisma/client";

import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { MARKETING_ORCHESTRATOR_REPORT_FEATURE } from "@/lib/marketing/model-pool";
import { requestMarketingModeration } from "@/lib/marketing/moderation";
import { draftOwnerComment, type CommentFeedback } from "@/lib/marketing/owner-comment";
import { parseOwnerCommand } from "@/lib/marketing/owner-ideas";
import { parseCardMark } from "@/lib/marketing/threads-manual-card";
import { notesOf, threadsVerdictOf } from "@/lib/marketing/moderation";
import {
  dropPending,
  pickPending,
  readPending,
  readOwnerRating,
  recordThreadsVerdict,
  rejectTagLabel,
  type PendingReason,
} from "@/lib/marketing/threads-verdicts";
import { isThreadsPlanPost } from "@/lib/marketing/owner-review-state";
import {
  MAX_REJECTION_ROUNDS,
  clearAwaitingReason,
  isOwnerReviewed,
  ownerReviewKind,
  readAwaitingReason,
  recordOwnerDecision,
} from "@/lib/marketing/owner-review-state";

export type RevisionMode = "rewrite" | "patch";

export interface RevisionDecision {
  mode: RevisionMode;
  instructions: string;
}

/** Чистый разбор ответа классификатора; сбой или мусор — безопасный `rewrite` с причиной как есть. */
export function parseRevisionDecision(raw: string, reason: string): RevisionDecision {
  const fallback: RevisionDecision = { mode: "rewrite", instructions: reason };
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as { mode?: unknown; instructions?: unknown };
    const mode = data.mode === "patch" ? "patch" : data.mode === "rewrite" ? "rewrite" : null;
    const instructions = typeof data.instructions === "string" ? data.instructions.trim() : "";
    if (!mode) return fallback;
    return { mode, instructions: instructions ? `${instructions}\nСлова владельца: ${reason}` : reason };
  } catch {
    return fallback;
  }
}

const CLASSIFIER_PROMPT = [
  "Владелец отклонил материал SMM-агента и назвал причину. Реши, как исправлять.",
  "\"patch\" — причина про конкретную деталь (слово, концовка, длина, мат, тон одной фразы): меняем только названное.",
  "\"rewrite\" — причина про идею, тему, угол, героя или общий регистр: пишем заново с учётом причины.",
  "Верни ТОЛЬКО JSON: {\"mode\":\"patch\"|\"rewrite\",\"instructions\":\"что сделать, одно-два предложения в повелительном наклонении\"}.",
].join("\n");

async function classify(kind: string, material: string, reason: string): Promise<RevisionDecision> {
  try {
    const response = await aiComplete({
      feature: MARKETING_ORCHESTRATOR_REPORT_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 300,
      temperature: 0.2,
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        { role: "user", content: `Материал (${kind}):\n${material.slice(0, 1500)}\n\nПричина владельца:\n${reason}` },
      ],
    });
    return parseRevisionDecision(response.text, reason);
  } catch (error) {
    log.warn("owner_review.classifier_failed", { error: serializeError(error) });
    return parseRevisionDecision("", reason);
  }
}

interface ReviewNotes {
  rounds?: number;
  baseAngle?: string;
  editorialAngle?: string;
  history?: Array<{ at: string; action: string; mode: RevisionMode; reason: string }>;
  [key: string]: unknown;
}

function parseNotes(raw: string | null): ReviewNotes {
  try {
    return raw ? JSON.parse(raw) as ReviewNotes : {};
  } catch {
    return {};
  }
}

function modeLabel(mode: RevisionMode): string {
  return mode === "patch" ? "правлю точечно, остальное не трогаю" : "переписываю целиком с учётом причины";
}

/**
 * Сообщение владельца как причина по ожидающей карточке. `null` — это не
 * причина (нет ожидания, ожидание просрочено, либо пришла новая команда
 * «идея»/«комментарий»): диалог продолжает обычным путём.
 */
export async function handleOwnerReason(input: {
  text: string;
  chatId: string;
  now: Date;
  /** B764: id сообщения, на которое владелец ответил (reply) — карточка или подсказка бота. */
  replyToMessageId?: number | null;
}): Promise<string | null> {
  const reason = input.text.replace(/\[приложено фото\]/g, "").trim();
  const threads = await handleThreadsReasonMessage({ ...input, reason });
  if (threads !== undefined) return threads;
  if (!reason || parseOwnerCommand(reason) || parseCardMark(reason)) return null;
  const awaiting = await readAwaitingReason(input.chatId, input.now);
  if (!awaiting) return null;

  const row = await db.externalPublication.findUnique({ where: { id: awaiting.publicationId } });
  if (!row || row.status !== "REVIEW" || !isOwnerReviewed(row)) {
    await clearAwaitingReason();
    return null;
  }

  const kind = ownerReviewKind(row.contentType);
  const notes = parseNotes(row.notes);
  const round = (notes.rounds ?? 0) + 1;
  const decided = { moderationDecisionBy: "telegram:owner", moderationDecisionAt: input.now };
  // Отказ записывается в метрику только когда он обработан: сбой генерации не должен
  // оставлять в журнале «отклонено» без переработки.
  const settle = async () => {
    await clearAwaitingReason();
    await recordOwnerDecision({
      at: input.now.toISOString(),
      publicationId: row.id,
      kind,
      action: awaiting.action,
      cluster: row.cluster,
      technique: typeof notes.technique === "string" ? notes.technique : null,
      reason: reason.slice(0, 300),
    });
  };

  if (round > MAX_REJECTION_ROUNDS) {
    await settle();
    await db.externalPublication.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", archiveReason: "REJECTION_LIMIT", lastError: "REJECTED_BY_MODERATOR", ...decided },
    });
    return `Три круга правок не помогли, снимаю этот материал. Пришлите свой текст или другую идею: «${kind === "idea" ? "идея" : "комментарий"}: …».`;
  }

  const decision = await classify(kind === "idea" ? "пост" : "комментарий", row.body ?? row.engagementExcerpt ?? "", reason);
  const history = [
    ...(notes.history ?? []),
    { at: input.now.toISOString(), action: awaiting.action, mode: decision.mode, reason: reason.slice(0, 300) },
  ];

  if (kind === "comment") {
    const feedback: CommentFeedback = { mode: decision.mode, instructions: decision.instructions, previousText: row.body ?? "" };
    const draft = await draftOwnerComment({ sample: row.engagementExcerpt ?? "", feedback });
    if (!draft) return "Не смог собрать новый вариант. Пришлите причину ещё раз (окно ещё открыто) или нажмите «Убрать».";
    await settle();
    await db.externalPublication.update({
      where: { id: row.id },
      data: {
        body: draft.text,
        cluster: draft.cluster ?? row.cluster,
        notes: JSON.stringify({ ...notes, technique: draft.technique ?? notes.technique, rounds: round, history }),
        ...decided,
      },
    });
    await requestMarketingModeration(row.id);
    return `Принял причину: ${modeLabel(decision.mode)}. Новая версия — в карточке выше по каналу.`;
  }

  const baseAngle = notes.baseAngle ?? notes.editorialAngle ?? "";
  const block = decision.mode === "patch"
    ? `\n\nПРАВКА ВЛАДЕЛЬЦА (точечно). Текущий текст:\n${row.body ?? ""}\nИзмени ТОЛЬКО названное, остальное оставь как есть:\n${decision.instructions}`
    : `\n\nВЛАДЕЛЕЦ ОТКЛОНИЛ ПРЕЖНИЙ ТЕКСТ (напиши заново, по-другому):\n${row.body ?? ""}\nПричина и ограничения:\n${decision.instructions}`;
  await settle();
  await db.externalPublication.updateMany({
    where: { id: row.id, status: "REVIEW" },
    data: {
      status: "DRAFT",
      agentReviewedAt: null,
      agentWriterDraft: Prisma.DbNull,
      agentWrittenAt: null,
      lastError: null,
      notes: JSON.stringify({ ...notes, baseAngle, editorialAngle: `${baseAngle}${block}`, rounds: round, history }),
      ...decided,
    },
  });
  return `Принял причину: ${modeLabel(decision.mode)}. Новая версия придёт на одобрение сюда же.`;
}

function matchedByReply(entry: PendingReason, replyTo: number | null | undefined): boolean {
  return replyTo != null && (entry.cardMessageId === replyTo || entry.promptMessageId === replyTo);
}

/**
 * B764: сообщение владельца как комментарий к карточке поста Threads.
 * `undefined` — это не про посты, дальше идёт прежний путь B761; `null` — про
 * посты, но не причина (обычный диалог продолжается).
 */
async function handleThreadsReasonMessage(input: {
  reason: string;
  chatId: string;
  now: Date;
  replyToMessageId?: number | null;
}): Promise<string | null | undefined> {
  if (!input.reason) return undefined;
  const lookup = pickPending(await readPending(input.now), input.chatId, input.replyToMessageId ?? null, input.now);
  if (lookup.kind === "none") return undefined;
  if (lookup.kind === "ambiguous") {
    // Несколько карточек ждут комментарий, а сообщение не reply: гадать нельзя.
    return input.replyToMessageId != null && !parseOwnerCommand(input.reason)
      ? `Ждут комментария ${lookup.count} карточек. Ответьте (reply) на карточку или на подсказку под ней, к которой он относится.`
      : undefined;
  }
  const byReply = matchedByReply(lookup.entry, input.replyToMessageId);
  if (!byReply && (parseOwnerCommand(input.reason) || parseCardMark(input.reason))) return undefined;
  return reworkThreadsPost({ entry: lookup.entry, comment: input.reason, now: input.now });
}

/**
 * Завершает «Доработать»/«Отказать» поста: пишет вердикт и возвращает строку
 * автору новым кругом. Строка НИКОГДА не архивируется: после трёх кругов пост
 * остаётся в очереди ждать решения или текста владельца.
 */
export async function reworkThreadsPost(input: {
  entry: PendingReason;
  comment: string | null;
  now: Date;
}): Promise<string | null> {
  const { entry, now } = input;
  const row = await db.externalPublication.findUnique({ where: { id: entry.publicationId } });
  if (!row || row.status !== "REVIEW" || !isThreadsPlanPost(row)) {
    await dropPending(entry.publicationId, now);
    return null;
  }
  const notes = notesOf(row.notes) as ReviewNotes;
  const round = (notes.rounds ?? 0) + 1;
  const tagText = entry.tags.map(rejectTagLabel).join(", ");
  const reason = [tagText ? `Причины: ${tagText}.` : "", input.comment ?? ""].filter(Boolean).join(" ").trim();
  const rating = await readOwnerRating(row.id);
  await dropPending(row.id, now);
  if (round > MAX_REJECTION_ROUNDS) {
    await recordThreadsVerdict(threadsVerdictOf(row, entry.action, entry.tags, input.comment, now, rating));
    return "Три круга правок не помогли. Пост остаётся в очереди и ждёт вас: пришлите свой текст «идея: …» или нажмите «Убрать» на карточке.";
  }

  const decision = entry.action === "reject"
    ? { mode: "rewrite" as const, instructions: reason || "Владелец отказал без пояснений: напиши другой пост." }
    : await classify("пост", row.body ?? "", reason);
  const history = [
    ...(notes.history ?? []),
    { at: now.toISOString(), action: entry.action, mode: decision.mode, reason: reason.slice(0, 300) },
  ];
  const baseAngle = notes.baseAngle ?? notes.editorialAngle ?? "";
  const block = decision.mode === "patch"
    ? `\n\nПРАВКА ВЛАДЕЛЬЦА (точечно). Текущий текст:\n${row.body ?? ""}\nИзмени ТОЛЬКО названное, остальное оставь как есть:\n${decision.instructions}`
    : `\n\nВЛАДЕЛЕЦ ОТКАЗАЛ ПРЕЖНЕМУ ТЕКСТУ (контрпример, не повторяй; напиши заново, по-другому):\n${row.body ?? ""}\nПричина и ограничения:\n${decision.instructions}`;
  const moved = await db.externalPublication.updateMany({
    where: { id: row.id, status: "REVIEW" },
    data: {
      status: "DRAFT",
      agentReviewedAt: null,
      agentWriterDraft: Prisma.DbNull,
      agentWrittenAt: null,
      lastError: null,
      notes: JSON.stringify({ ...notes, baseAngle, editorialAngle: `${baseAngle}${block}`, rounds: round, history }),
      moderationDecisionBy: "telegram:owner",
      moderationDecisionAt: now,
    },
  });
  // Двойное нажатие: второй вызов не нашёл REVIEW — вердикт и «Принял» были бы ложью.
  if (moved.count !== 1) return null;
  await recordThreadsVerdict(threadsVerdictOf(row, entry.action, entry.tags, input.comment, now, rating));
  return `Принял: ${modeLabel(decision.mode)}. Новая версия придёт на одобрение сюда же.`;
}

/**
 * B756 — РУЧНОЙ КОНТУР THREADS: КАРТОЧКА ОТВЕТА ПОД ЧУЖИМ ПОСТОМ.
 *
 * Публичный поиск Threads недоступен без App Review (владелец пройти его не
 * может), поэтому агент ничего не ищет и тем более НИЧЕГО НЕ ПУБЛИКУЕТ под
 * чужими постами сам. Владелец кидает в канал ссылку на пост (и/или текст, и/или
 * скриншот с подписью) — агент отвечает карточкой «куда / что / почему», а
 * публикует человек и отмечает «опубликовал» или «пропустить».
 */

import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { MARKETING_ORCHESTRATOR_REPORT_FEATURE } from "@/lib/marketing/model-pool";
import { ingestOwnerTopic } from "@/lib/marketing/discovery";
import { ORCHESTRATOR_ACTOR } from "@/lib/marketing/orchestrator-actions";

export const THREADS_CARDS_KEY = "marketing.threads.manual_cards";
const MAX_CARDS = 50;
const THREADS_POST_URL = /https?:\/\/(?:www\.)?threads\.(?:net|com)\/@[\w.]+\/post\/[\w-]+/i;
const REPLY_MAX = 280;
/** Согласовано с владельцем 2026-10-10: старт с 5 ответов под чужими постами в сутки. */
export const CARD_DAILY_LIMIT = 5;

export interface ThreadsCard {
  url: string;
  at: string;
  replies: string[];
  hook: string;
  status: "OPEN" | "PUBLISHED" | "SKIPPED";
}

export function extractThreadsPostUrl(text: string): string | null {
  return THREADS_POST_URL.exec(text)?.[0] ?? null;
}

/** Чистый разбор ответа модели: ровно два варианта ≤ 280 знаков без ссылок. */
export function parseCardDraft(raw: string): { replies: string[]; hook: string } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as { replies?: unknown; hook?: unknown };
    const replies = Array.isArray(data.replies)
      ? data.replies.filter((item): item is string => typeof item === "string").map((item) => item.trim())
      : [];
    const hook = typeof data.hook === "string" ? data.hook.trim() : "";
    const clean = replies.filter((item) => item.length > 0 && item.length <= REPLY_MAX && !/https?:\/\//i.test(item));
    if (clean.length < 2 || !hook) return null;
    return { replies: clean.slice(0, 2), hook: hook.slice(0, 200) };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "Ты редактор бренда ETerapy в Threads. Тебе дали чужой пост. Предложи два РАЗНЫХ ответа под ним.",
  "Верни ТОЛЬКО JSON: {\"hook\": \"почему этот ответ зайдёт, одна фраза\", \"replies\": [\"вариант 1\", \"вариант 2\"]}.",
  "Каждый ответ: по-русски, до 280 знаков, по делу, без ссылок, без продажи и призывов зайти к нам, без обещаний результата,",
  "тон живого человека, который добавляет в разговор своё наблюдение или аккуратный вопрос. Не спорь и не поучай.",
].join("\n");

async function readCards(): Promise<ThreadsCard[]> {
  const row = await db.platformSetting.findUnique({ where: { key: THREADS_CARDS_KEY }, select: { value: true } });
  try {
    const parsed = JSON.parse(row?.value ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as ThreadsCard[]) : [];
  } catch {
    return [];
  }
}

async function writeCards(cards: ThreadsCard[]): Promise<void> {
  const value = JSON.stringify(cards.slice(-MAX_CARDS));
  await db.platformSetting.upsert({
    where: { key: THREADS_CARDS_KEY },
    create: { key: THREADS_CARDS_KEY, value, updatedBy: ORCHESTRATOR_ACTOR },
    update: { value, updatedBy: ORCHESTRATOR_ACTOR },
  });
}

/** Сколько карточек заведено за московские сутки момента `now`. */
export function cardsToday(cards: readonly ThreadsCard[], now: Date): number {
  const day = (value: Date) => new Date(value.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const today = day(now);
  return cards.filter((card) => day(new Date(card.at)) === today).length;
}

/** Отметка владельца по последней открытой карточке. `null` — это не отметка. */
export function parseCardMark(text: string): "PUBLISHED" | "SKIPPED" | null {
  const flat = text.trim().toLowerCase();
  if (flat.length > 40) return null;
  if (/^(опубликовал[аи]?|выложил[аи]?|ответил[аи]?)(?![\p{L}])/u.test(flat)) return "PUBLISHED";
  if (/^(пропустить|пропускаю|пропустил[аи]?|не надо|отмена)(?![\p{L}])/u.test(flat)) return "SKIPPED";
  return null;
}

export async function markLatestCard(mark: "PUBLISHED" | "SKIPPED"): Promise<string | null> {
  const cards = await readCards();
  const index = [...cards].reverse().findIndex((card) => card.status === "OPEN");
  if (index < 0) return null;
  const real = cards.length - 1 - index;
  const next = cards.map((card, i) => (i === real ? { ...card, status: mark } : card));
  await writeCards(next);
  return mark === "PUBLISHED"
    ? "Записал: ответ опубликован. Посмотрю охват через Insights и учту в отчёте."
    : "Записал: пропущено, больше по этому посту не напоминаю.";
}

/** Карточка по ссылке/тексту поста. Текст ответа — владельцу, публикует человек. */
export async function buildThreadsCard(input: { url: string; text: string; now: Date }): Promise<string> {
  if (cardsToday(await readCards(), input.now) >= CARD_DAILY_LIMIT) {
    return `На сегодня лимит ${CARD_DAILY_LIMIT} ответов под чужими постами выбран: чаще — риск антиспама Meta. Пришлите завтра.`;
  }
  let draft: { replies: string[]; hook: string } | null = null;
  try {
    const response = await aiComplete({
      feature: MARKETING_ORCHESTRATOR_REPORT_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 400,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Пост: ${input.url}\n${input.text.replace(input.url, "").trim()}` },
      ],
    });
    draft = parseCardDraft(response.text);
  } catch (error) {
    log.warn("orchestrator.threads_card_failed", { error: serializeError(error) });
  }
  if (!draft) {
    return "Не смог собрать ответ под этот пост: пришлите ещё и текст поста (модель без него гадает) или повторите чуть позже.";
  }
  await writeCards([
    ...(await readCards()),
    { url: input.url, at: input.now.toISOString(), replies: draft.replies, hook: draft.hook, status: "OPEN" },
  ]);
  // Тема поста — в очередь собственных постов. Нужен сам текст: по одной ссылке
  // темы нет. Отказ очереди не отменяет карточку.
  const topicText = input.text.replace(input.url, "").replace(/\[приложено фото\]/g, "").trim();
  let topicQueued = false;
  if (topicText.length >= 40) {
    const postId = input.url.split("/post/")[1] ?? input.url;
    topicQueued = await ingestOwnerTopic({
      platform: "threads",
      targetId: postId,
      targetUrl: input.url,
      targetLabel: "Threads (вручную)",
      excerpt: topicText.slice(0, 500),
      topic: topicText.slice(0, 80),
    }, input.now).catch((error: unknown) => {
      log.warn("orchestrator.threads_topic_failed", { error: serializeError(error) });
      return false;
    });
  }
  return [
    "📌 Куда:",
    input.url,
    "",
    "✍️ Что (выберите один):",
    `1) ${draft.replies[0]}`,
    `2) ${draft.replies[1]}`,
    "",
    `💡 Почему: ${draft.hook}`,
    "",
    topicQueued ? "🗂 Тема поста добавлена в очередь наших тем." : "",
    "Публикую не я: ответьте «опубликовал» или «пропустить».",
  ].join("\n");
}

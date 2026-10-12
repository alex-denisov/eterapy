/**
 * B756 — РУЧНОЙ КОНТУР THREADS: ПОДГОТОВКА ОТВЕТА ПОД ЧУЖИМ ПОСТОМ.
 *
 * B761: новые комментарии собирает и премодерирует `owner-comment.ts` (кнопки в
 * канале, без суточного лимита). Здесь остаются разбор ссылки и отметки по
 * старым открытым карточкам.
 *
 * Публичный поиск Threads недоступен без App Review (владелец пройти его не
 * может), поэтому агент ничего не ищет и тем более НИЧЕГО НЕ ПУБЛИКУЕТ под
 * чужими постами сам. Владелец кидает в канал ссылку на пост (и/или текст, и/или
 * скриншот с подписью) — агент отвечает карточкой «куда / что / почему», а
 * публикует человек и отмечает «опубликовал» или «пропустить».
 */

import db from "@/lib/db";
import { ORCHESTRATOR_ACTOR } from "@/lib/marketing/orchestrator-actions";

export const THREADS_CARDS_KEY = "marketing.threads.manual_cards";
const MAX_CARDS = 50;
const THREADS_POST_URL = /https?:\/\/(?:www\.)?threads\.(?:net|com)\/(?:@[\w.]+\/post|share)\/[\w-]+/i;

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

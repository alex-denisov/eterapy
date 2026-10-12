/**
 * B761 — премодерация владельца для идей (посты) и комментариев (чужие посты).
 *
 * Общие примитивы без зависимостей от агента и Telegram: признак «этот материал
 * проходит владельца», ожидание причины отказа и журнал решений. Журнал — это
 * внутренняя метрика качества агента: «Принять» значит «агент справился»
 * (для комментария — ещё и «опубликовал»), «Доработать»/«Отклонить» — нет.
 */

import db from "@/lib/db";
import { OWNER_IDEA_SOURCE } from "@/lib/marketing/owner-ideas";
import { OWNER_COMMENT_CONTENT_TYPE } from "@/lib/marketing/perimeter";

export const OWNER_REVIEW_AWAITING_KEY = "marketing.owner_review.awaiting";
export const OWNER_REVIEW_LOG_KEY = "marketing.owner_review.log";
/** Сколько минут бот ждёт причину после «Отклонить»/«Доработать». */
export const REASON_WINDOW_MS = 10 * 60_000;
/** Не больше трёх кругов отказа у одного материала, потом нужен текст владельца. */
export const MAX_REJECTION_ROUNDS = 3;
const MAX_LOG_ENTRIES = 1000;

export type OwnerReviewAction = "approve" | "revise" | "reject" | "remove";

export function isOwnerReviewed(row: { contentType: string | null; source: string | null }): boolean {
  const type = (row.contentType ?? "").toUpperCase();
  return type === OWNER_COMMENT_CONTENT_TYPE || (type === "POST" && row.source === OWNER_IDEA_SOURCE);
}

export function ownerReviewKind(contentType: string | null): "comment" | "idea" {
  return (contentType ?? "").toUpperCase() === OWNER_COMMENT_CONTENT_TYPE ? "comment" : "idea";
}

export interface AwaitingReason {
  publicationId: string;
  action: "revise" | "reject";
  chatId: string;
  at: string;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const row = await db.platformSetting.findUnique({ where: { key }, select: { value: true } });
  if (!row?.value) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  await db.platformSetting.upsert({ where: { key }, create: { key, value: text }, update: { value: text } });
}

export async function setAwaitingReason(state: AwaitingReason): Promise<void> {
  await writeJson(OWNER_REVIEW_AWAITING_KEY, state);
}

export async function clearAwaitingReason(): Promise<void> {
  await writeJson(OWNER_REVIEW_AWAITING_KEY, null);
}

/** Действующее ожидание причины в этом чате; просроченное — как отсутствующее. */
export async function readAwaitingReason(chatId: string, now: Date): Promise<AwaitingReason | null> {
  const state = await readJson<AwaitingReason | null>(OWNER_REVIEW_AWAITING_KEY, null);
  if (!state || state.chatId !== chatId) return null;
  return now.getTime() - new Date(state.at).getTime() <= REASON_WINDOW_MS ? state : null;
}

export interface OwnerReviewLogEntry {
  at: string;
  publicationId: string;
  kind: "comment" | "idea";
  action: OwnerReviewAction;
  cluster: string | null;
  technique: string | null;
  reason: string | null;
}

export async function recordOwnerDecision(entry: OwnerReviewLogEntry): Promise<void> {
  const log = await readJson<OwnerReviewLogEntry[]>(OWNER_REVIEW_LOG_KEY, []);
  await writeJson(OWNER_REVIEW_LOG_KEY, [...log, entry].slice(-MAX_LOG_ENTRIES));
}

export interface OwnerReviewQuality {
  decisions: number;
  approved: number;
  /** Доля «Принять» среди решений: чем выше, тем лучше работает агент. */
  approvalRate: number | null;
  byKind: Record<"comment" | "idea", { decisions: number; approved: number }>;
  topRejectionReasons: string[];
}

/** Чистая сводка журнала за окно; вызывается и из отчёта оркестратора. */
export function summarizeOwnerReview(
  log: readonly OwnerReviewLogEntry[],
  now: Date,
  days: number,
): OwnerReviewQuality {
  const since = now.getTime() - days * 86_400_000;
  const recent = log.filter((entry) => new Date(entry.at).getTime() >= since && entry.action !== "remove");
  const byKind = {
    comment: { decisions: 0, approved: 0 },
    idea: { decisions: 0, approved: 0 },
  };
  for (const entry of recent) {
    byKind[entry.kind].decisions += 1;
    if (entry.action === "approve") byKind[entry.kind].approved += 1;
  }
  const approved = byKind.comment.approved + byKind.idea.approved;
  return {
    decisions: recent.length,
    approved,
    approvalRate: recent.length > 0 ? approved / recent.length : null,
    byKind,
    topRejectionReasons: recent
      .filter((entry) => entry.reason)
      .slice(-5)
      .map((entry) => String(entry.reason).slice(0, 120)),
  };
}

export async function ownerReviewQuality(now: Date, days = 7): Promise<OwnerReviewQuality> {
  return summarizeOwnerReview(await readJson<OwnerReviewLogEntry[]>(OWNER_REVIEW_LOG_KEY, []), now, days);
}

export function describeOwnerReviewQuality(quality: OwnerReviewQuality): string {
  if (quality.decisions === 0) return "Качество агента по оценкам владельца: решений пока нет.";
  const pct = Math.round((quality.approvalRate ?? 0) * 100);
  return [
    `Качество агента по оценкам владельца за неделю: принято ${quality.approved} из ${quality.decisions} (${pct}%).`,
    `Идеи: ${quality.byKind.idea.approved}/${quality.byKind.idea.decisions}; комментарии: ${quality.byKind.comment.approved}/${quality.byKind.comment.decisions}.`,
    quality.topRejectionReasons.length > 0 ? `Последние причины отказа: ${quality.topRejectionReasons.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

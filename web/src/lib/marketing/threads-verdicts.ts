/**
 * B764 — вердикты владельца по постам Threads и ожидание причины ПО КАРТОЧКЕ.
 *
 * Два хранилища в `platform_settings`:
 *  - журнал вердиктов (решение, оценка, теги, комментарий + всё, из чего пост
 *    собран: модель автора, формат, кластер, область жизни, факт, версия
 *    инструкции) — из него считаются связки, которые заходят владельцу;
 *  - ожидания причины: по одному на карточку, с id карточки и id подсказки,
 *    чтобы комментарий владельца ушёл именно к той карточке, на которой он
 *    нажал кнопку, а соседние карточки пачки не путались.
 */

import db from "@/lib/db";

const VERDICT_PREFIX = "marketing.threads.verdict:";
const PENDING_PREFIX = "marketing.threads.pending:";
const RATING_PREFIX = "marketing.threads.rating:";
export const THREADS_PREMODERATION_MODE_KEY = "marketing.threads.premoderation_mode";
/** Пост ждёт владельца, а не слота: причину можно написать в течение суток. */
export const PENDING_WINDOW_MS = 24 * 3_600_000;
/** Обычное сообщение (не reply) считается комментарием к карточке только в этом окне. */
export const PLAIN_REPLY_WINDOW_MS = 10 * 60_000;

/** `calibration` — всё идёт владельцу; `sampled` — позже, по оценке проверяющего; `off` — аварийный выход. */
export type PremoderationMode = "calibration" | "sampled" | "off";

export const REJECT_TAGS = [
  { id: "incoherent", label: "несвязно" },
  { id: "impossible_scene", label: "невозможная сцена" },
  { id: "bookish_word", label: "книжное слово" },
  { id: "not_my_voice", label: "не мой голос" },
  { id: "unclear_hero", label: "непонятен герой" },
  { id: "not_funny", label: "не смешно" },
  { id: "off_topic", label: "не про наше" },
  { id: "other", label: "другое" },
] as const;

export type RejectTagId = (typeof REJECT_TAGS)[number]["id"];

export function rejectTagLabel(id: string): string {
  return REJECT_TAGS.find((tag) => tag.id === id)?.label ?? id;
}

export function isRejectTagIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < REJECT_TAGS.length;
}

export type VerdictDecision = "approve" | "revise" | "reject";

export interface ThreadsVerdict {
  at: string;
  publicationId: string;
  decision: VerdictDecision;
  rating: number | null;
  tags: string[];
  comment: string | null;
  writerProvider: string | null;
  writerModel: string | null;
  format: string | null;
  cluster: string | null;
  technique: string | null;
  lifeArea: string | null;
  /** B777: намерение хука, выбранного из пула (результат, боль, интрига…). */
  hookIntent?: string | null;
  fact: string | null;
  instructionVersion: string | null;
  round: number;
}

export interface PendingReason {
  publicationId: string;
  action: "revise" | "reject";
  chatId: string;
  /** Карточка, на которой нажата кнопка. */
  cardMessageId: number | null;
  /** Подсказка бота — reply на карточку; ответ владельца может быть reply на любую из двух. */
  promptMessageId: number | null;
  /** B776: id всех частей длинной карточки — reply на любую из них привязывается к ней. */
  chunkMessageIds?: number[];
  tags: string[];
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

export async function readPremoderationMode(): Promise<PremoderationMode> {
  const row = await db.platformSetting.findUnique({ where: { key: THREADS_PREMODERATION_MODE_KEY }, select: { value: true } });
  const value = row?.value?.replaceAll('"', "").trim();
  return value === "sampled" || value === "off" ? value : "calibration";
}

/** Ключ на запись, а не общий массив: параллельные нажатия не затирают друг друга. */
export async function recordThreadsVerdict(verdict: ThreadsVerdict): Promise<void> {
  const key = `${VERDICT_PREFIX}${verdict.at}:${verdict.publicationId}:${verdict.decision}`;
  await writeJson(key, verdict);
}

export async function readThreadsVerdicts(): Promise<ThreadsVerdict[]> {
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: VERDICT_PREFIX } }, select: { value: true } });
  return rows
    .flatMap((row) => { try { return [JSON.parse(row.value) as ThreadsVerdict]; } catch { return []; } })
    .sort((x, y) => x.at.localeCompare(y.at));
}

export async function setOwnerRating(publicationId: string, rating: number): Promise<void> {
  await writeJson(`${RATING_PREFIX}${publicationId}`, rating);
}

export async function readOwnerRating(publicationId: string): Promise<number | null> {
  const value = await readJson<number | null>(`${RATING_PREFIX}${publicationId}`, null);
  return typeof value === "number" ? value : null;
}

function fresh(entry: PendingReason, now: Date): boolean {
  return now.getTime() - new Date(entry.at).getTime() <= PENDING_WINDOW_MS;
}

export async function readPending(now: Date): Promise<PendingReason[]> {
  const rows = await db.platformSetting.findMany({ where: { key: { startsWith: PENDING_PREFIX } }, select: { value: true } });
  return rows
    .flatMap((row) => { try { return [JSON.parse(row.value) as PendingReason]; } catch { return []; } })
    .filter((entry) => entry && fresh(entry, now));
}

/** Одно ожидание на пост: ключ по публикации, повторное нажатие заменяет прежнее. */
export async function putPending(entry: PendingReason, _now?: Date): Promise<void> {
  await writeJson(`${PENDING_PREFIX}${entry.publicationId}`, entry);
}

export async function dropPending(publicationId: string, _now?: Date): Promise<void> {
  await db.platformSetting.deleteMany({ where: { key: `${PENDING_PREFIX}${publicationId}` } });
}

const CARD_CHUNKS_PREFIX = "marketing.moderation.card_chunks.";

export async function saveCardChunks(publicationId: string, ids: readonly number[]): Promise<void> {
  if (ids.length < 2) return;
  await writeJson(`${CARD_CHUNKS_PREFIX}${publicationId}`, ids);
}

export async function readCardChunks(publicationId: string): Promise<number[]> {
  const ids = await readJson<unknown>(`${CARD_CHUNKS_PREFIX}${publicationId}`, []);
  return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [];
}

export type PendingLookup =
  | { kind: "found"; entry: PendingReason }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" };

/**
 * Чистый выбор ожидания для сообщения владельца. Ответ (reply) на карточку или
 * на подсказку бота однозначен; обычное сообщение берётся, только если ожидание
 * в чате одно — иначе комментарий мог бы уйти не к той карточке.
 */
export function pickPending(
  pending: readonly PendingReason[],
  chatId: string,
  replyToMessageId: number | null,
  now: Date,
): PendingLookup {
  const inChat = pending.filter((entry) => entry.chatId === chatId);
  if (replyToMessageId !== null) {
    // Reply на постороннее сообщение — не наш комментарий: диалог идёт прежним путём.
    const hit = inChat.find((entry) => entry.cardMessageId === replyToMessageId
      || entry.promptMessageId === replyToMessageId
      || entry.chunkMessageIds?.includes(replyToMessageId));
    return hit ? { kind: "found", entry: hit } : { kind: "none" };
  }
  // Без reply комментарий привязывается только к недавнему единственному ожиданию:
  // иначе любая реплика владельца за сутки ушла бы к чужой карточке.
  const recent = inChat.filter((entry) => now.getTime() - new Date(entry.at).getTime() <= PLAIN_REPLY_WINDOW_MS);
  if (recent.length === 1 && inChat.length === 1) return { kind: "found", entry: recent[0] };
  if (inChat.length > 1) return { kind: "ambiguous", count: inChat.length };
  return { kind: "none" };
}

export function toggleTag(tags: readonly string[], id: string): string[] {
  return tags.includes(id) ? tags.filter((tag) => tag !== id) : [...tags, id];
}

export interface VerdictGroup {
  key: string;
  decisions: number;
  approved: number;
  rejected: number;
  revised: number;
  /** Среднее по тем вердиктам, где оценка поставлена. */
  avgRating: number | null;
}

export type VerdictGroupBy = "writerModel" | "format" | "cluster" | "technique" | "lifeArea" | "hookIntent";

/** Чистая выгрузка: какие модели/форматы/темы/приёмы заходят владельцу лучше. */
export function groupVerdicts(
  verdicts: readonly ThreadsVerdict[],
  by: VerdictGroupBy,
  since?: Date,
): VerdictGroup[] {
  const groups = new Map<string, { group: VerdictGroup; ratings: number[] }>();
  for (const verdict of verdicts) {
    if (since && new Date(verdict.at).getTime() < since.getTime()) continue;
    const key = verdict[by] ?? "—";
    const entry = groups.get(key) ?? {
      group: { key, decisions: 0, approved: 0, rejected: 0, revised: 0, avgRating: null },
      ratings: [],
    };
    entry.group.decisions += 1;
    if (verdict.decision === "approve") entry.group.approved += 1;
    if (verdict.decision === "reject") entry.group.rejected += 1;
    if (verdict.decision === "revise") entry.group.revised += 1;
    if (verdict.rating !== null) entry.ratings.push(verdict.rating);
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map(({ group, ratings }) => ({
      ...group,
      avgRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.decisions - a.decisions);
}

/** Эталоны для автора: утверждённое с оценкой ≥ 9. Контрпримеры — отказы с причиной. */
export function exemplarIds(verdicts: readonly ThreadsVerdict[]): { good: string[]; bad: string[] } {
  return {
    good: verdicts.filter((v) => v.decision === "approve" && (v.rating ?? 0) >= 9).map((v) => v.publicationId),
    bad: verdicts.filter((v) => v.decision === "reject" && (v.tags.length > 0 || v.comment)).map((v) => v.publicationId),
  };
}

const REPORT_AXES: ReadonlyArray<{ by: VerdictGroupBy; title: string }> = [
  { by: "writerModel", title: "Модель автора" },
  { by: "format", title: "Формат" },
  { by: "cluster", title: "Кластер" },
  { by: "technique", title: "Приём" },
  { by: "lifeArea", title: "Область жизни" },
  { by: "hookIntent", title: "Намерение хука" },
];

/** Текстовая выгрузка вердиктов за окно: что заходит владельцу по моделям, форматам, темам. */
export function renderVerdictReport(verdicts: readonly ThreadsVerdict[], since?: Date): string {
  const inWindow = since ? verdicts.filter((v) => new Date(v.at).getTime() >= since.getTime()) : verdicts;
  if (inWindow.length === 0) return "Вердиктов по постам Threads пока нет.";
  const tagCounts = new Map<string, number>();
  for (const verdict of inWindow) for (const tag of verdict.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const lines = [`Вердиктов: ${inWindow.length}`, ""];
  for (const axis of REPORT_AXES) {
    lines.push(`## ${axis.title}`);
    for (const g of groupVerdicts(inWindow, axis.by)) {
      lines.push(`- ${g.key}: решений ${g.decisions}, принято ${g.approved}, доработок ${g.revised}, отказов ${g.rejected}, средняя оценка ${g.avgRating ?? "—"}`);
    }
    lines.push("");
  }
  lines.push("## Причины отказов");
  for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${rejectTagLabel(tag)}: ${count}`);
  }
  return lines.join("\n");
}

/**
 * B626 — суточный срез поисковой аналитики.
 *
 * ЧТО ИМЕННО БЫЛО НЕ ТАК. Владелец 2026-07-30: «кажется, что не обновляется
 * «Очередь SEO-действий», колонка «позиция» и «Поисковые системы»». Проверка
 * показала, что все три блока собираются живым запросом при каждом открытии
 * страницы — то есть обновляются постоянно. Пустыми они выглядят потому, что
 * источник пуст: у Яндекса в индексе одна страница из 208, поэтому Вебмастеру
 * нечего вернуть по запросам, а без запросов нет ни позиций, ни очереди
 * действий. Это открытая работа B470/B550, а не дефект интеграции.
 *
 * ПОЧЕМУ ЭТОГО ОБЪЯСНЕНИЯ НЕДОСТАТОЧНО. По экрану «данных нет» и «мы перестали
 * спрашивать» неотличимы, и различить их не может никто, включая меня — я
 * лазил в код, чтобы это выяснить. Суточный срез делает движение фактом:
 * у каждого дня есть отметка времени, значения и разница с предыдущим днём.
 * Ноль, отмеченный вчерашней датой, — это ответ, а пустая таблица — нет.
 */

import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { getSearchMarketingData } from "@/lib/search-marketing-data";

/** Окно замера. 28 дней — тот же горизонт, что у отчётов D+28 в B578. */
const SNAPSHOT_WINDOW_DAYS = 28;

export function moscowDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface MarketingSnapshotRow {
  dayKey: string;
  capturedAt: Date;
  impressions: number;
  clicks: number;
  averagePosition: number | null;
  searchablePages: number;
  organicVisits: number;
  observedQueries: number;
}

/**
 * Снять срез за московские сутки. Повторный вызов в те же сутки обновляет
 * существующую строку, а не создаёт вторую: воркер тикает раз в минуту, и
 * защита от дубля лежит в уникальном ключе базы, а не в порядке вызовов.
 */
export async function captureMarketingDailySnapshot(
  input: { now?: Date } = {},
): Promise<MarketingSnapshotRow | null> {
  const now = input.now ?? new Date();
  const dayKey = moscowDayKey(now);
  const start = new Date(now.getTime() - SNAPSHOT_WINDOW_DAYS * 24 * 60 * 60_000);

  try {
    const days: string[] = [];
    for (let cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    const data = await getSearchMarketingData({
      start,
      end: now,
      startInput: start.toISOString().slice(0, 10),
      endInput: now.toISOString().slice(0, 10),
      days,
    });
    const values = {
      impressions: Math.round(data.totals.impressions),
      clicks: Math.round(data.totals.clicks),
      averagePosition: data.totals.averagePosition,
      searchablePages: Math.round(data.webmaster.summary.searchablePages),
      organicVisits: Math.round(data.totals.organicVisits),
      observedQueries: data.webmaster.queries.length,
      sources: data.sources.map((source) => ({
        key: source.key,
        status: source.status,
        note: source.note,
      })) as unknown as Prisma.InputJsonValue,
    };
    const row = await db.marketingDailySnapshot.upsert({
      where: { dayKey },
      create: { dayKey, capturedAt: now, ...values },
      update: { capturedAt: now, ...values },
    });
    log.info("marketing.daily_snapshot", { dayKey, observedQueries: values.observedQueries });
    return {
      dayKey: row.dayKey,
      capturedAt: row.capturedAt,
      impressions: row.impressions,
      clicks: row.clicks,
      averagePosition: row.averagePosition,
      searchablePages: row.searchablePages,
      organicVisits: row.organicVisits,
      observedQueries: row.observedQueries,
    };
  } catch (error) {
    // Отказ внешнего источника не должен ронять воркер и не должен записывать
    // нули как результат замера: «нам не ответили» и «значение равно нулю» —
    // разные факты, и подменять один другим значит врать в истории.
    log.error("marketing.daily_snapshot_failed", { dayKey, error: serializeError(error) });
    return null;
  }
}

export async function listMarketingSnapshots(limit = 14): Promise<MarketingSnapshotRow[]> {
  const rows = await db.marketingDailySnapshot.findMany({
    orderBy: { dayKey: "desc" },
    take: limit,
  }).catch(() => []);
  return rows.map((row) => ({
    dayKey: row.dayKey,
    capturedAt: row.capturedAt,
    impressions: row.impressions,
    clicks: row.clicks,
    averagePosition: row.averagePosition,
    searchablePages: row.searchablePages,
    organicVisits: row.organicVisits,
    observedQueries: row.observedQueries,
  }));
}

/** Нужен ли срез за текущие сутки. */
export async function marketingSnapshotDue(now: Date): Promise<boolean> {
  const dayKey = moscowDayKey(now);
  const existing = await db.marketingDailySnapshot.findUnique({
    where: { dayKey },
    select: { id: true },
  }).catch(() => null);
  return !existing;
}

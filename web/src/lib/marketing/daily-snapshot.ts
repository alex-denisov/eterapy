/**
 * B626 — суточный срез поисковой аналитики.
 *
 * ЧТО ИМЕННО БЫЛО НЕ ТАК. Владелец 2026-07-30: «кажется, что не обновляется
 * «Очередь SEO-действий», колонка «позиция» и «Поисковые системы»». Проверка
 * показала, что все три блока собираются живым запросом при каждом открытии
 * страницы — то есть обновляются постоянно. Пустыми они выглядят потому, что
 * источник пуст. Это открытая работа B470/B550, а не дефект интеграции.
 *
 * ПОЧЕМУ ЭТОГО ОБЪЯСНЕНИЯ НЕДОСТАТОЧНО. По экрану «данных нет» и «мы перестали
 * спрашивать» неотличимы. Суточный срез делает движение фактом: у каждого дня
 * есть отметка времени и значения. Ноль, отмеченный вчерашней датой, — это
 * ответ, а пустая таблица — нет.
 *
 * B697 — срез перестал быть нарастающим итогом.
 *
 * Первая версия спрашивала у источников окно в 28 дней и клала ИТОГ ОКНА как
 * значение дня. Соседние сутки перекрывались на 27 дней из 28, и график
 * читался как накопление: показы монотонно росли, клики намертво стояли на 2.
 * Живой ряд за те же сутки говорил обратное — пик 26–30 июля и падение до нуля.
 *
 * Теперь поток (показы, клики, визиты) берётся посуточно у источника, а уровень
 * (страниц в поиске, наблюдаемых запросов, позиция) остаётся состоянием на день
 * замера. Проход обновляет весь хвост окна, потому что оба источника уточняют
 * данные задним числом: история чинит себя сама.
 */

import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { getSearchMarketingData } from "@/lib/search-marketing-data";
import {
  fetchMetrikaDailyVisits,
  fetchWebmasterDailySeries,
  mergeDailyFlow,
  moscowDayRange,
  type SearchDailyFlow,
} from "@/lib/marketing/search-daily-series";

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
  /** Уровень известен только за сутки, когда срез снимался. `null` — не мерили. */
  averagePosition: number | null;
  searchablePages: number | null;
  organicVisits: number;
  observedQueries: number | null;
}

type LevelValues = {
  averagePosition: number | null;
  searchablePages: number;
  observedQueries: number;
  sources: Prisma.InputJsonValue;
};

/** Поток за все сутки окна. `null` — источник не ответил, и это не «ноль». */
async function loadDailyFlow(input: {
  from: string;
  to: string;
  days: string[];
}): Promise<Map<string, SearchDailyFlow> | null> {
  const [webmaster, metrika] = await Promise.allSettled([
    fetchWebmasterDailySeries({ from: input.from, to: input.to }),
    fetchMetrikaDailyVisits({ from: input.from, to: input.to }),
  ]);
  if (webmaster.status === "rejected" && metrika.status === "rejected") {
    log.error("marketing.daily_series_failed", {
      webmaster: serializeError(webmaster.reason),
      metrika: serializeError(metrika.reason),
    });
    return null;
  }
  return mergeDailyFlow({
    days: input.days,
    webmaster: webmaster.status === "fulfilled" ? webmaster.value : new Map(),
    metrika: metrika.status === "fulfilled" ? metrika.value : new Map(),
  });
}

/** Уровень на сегодня: сколько страниц и запросов есть СЕЙЧАС. */
async function loadLevel(input: { now: Date; start: Date; days: string[] }): Promise<LevelValues | null> {
  try {
    const data = await getSearchMarketingData({
      start: input.start,
      end: input.now,
      startInput: input.days[0],
      endInput: input.days[input.days.length - 1],
      days: input.days,
    });
    return {
      averagePosition: data.totals.averagePosition,
      searchablePages: Math.round(data.webmaster.summary.searchablePages),
      observedQueries: data.webmaster.queries.length,
      sources: data.sources.map((source) => ({
        key: source.key,
        status: source.status,
        note: source.note,
      })) as unknown as Prisma.InputJsonValue,
    };
  } catch (error) {
    log.error("marketing.daily_snapshot_level_failed", { error: serializeError(error) });
    return null;
  }
}

/**
 * Снять срез за московские сутки и переснять хвост окна. Повторный вызов в те же
 * сутки обновляет существующие строки, а не создаёт вторые: защита от дубля
 * лежит в уникальном ключе базы, а не в порядке вызовов.
 */
export async function captureMarketingDailySnapshot(
  input: { now?: Date } = {},
): Promise<MarketingSnapshotRow | null> {
  const now = input.now ?? new Date();
  const today = moscowDayKey(now);
  const start = new Date(now.getTime() - (SNAPSHOT_WINDOW_DAYS - 1) * 24 * 60 * 60_000);
  const days = moscowDayRange(moscowDayKey(start), today);

  try {
    const flow = await loadDailyFlow({ from: days[0], to: today, days });
    if (!flow) {
      // Отказ источника не должен записывать нули как результат замера: «нам не
      // ответили» и «значение равно нулю» — разные факты, и подменять один
      // другим значит врать в истории.
      log.error("marketing.daily_snapshot_failed", { dayKey: today, error: "нет посуточного ряда" });
      return null;
    }
    const level = await loadLevel({ now, start, days });

    // Хвост окна: у прошедших суток обновляется ТОЛЬКО поток. Уровень на них —
    // это состояние того дня, и подменять его сегодняшним значило бы задним
    // числом переписать историю индексации.
    for (const day of days) {
      const values = flow.get(day);
      if (!values || day === today) continue;
      await db.marketingDailySnapshot.upsert({
        where: { dayKey: day },
        create: { dayKey: day, capturedAt: now, ...values },
        update: { capturedAt: now, ...values },
      });
    }

    const todayFlow = flow.get(today) ?? { impressions: 0, clicks: 0, organicVisits: 0 };
    const row = await db.marketingDailySnapshot.upsert({
      where: { dayKey: today },
      create: { dayKey: today, capturedAt: now, ...todayFlow, ...(level ?? {}) },
      update: { capturedAt: now, ...todayFlow, ...(level ?? {}) },
    });
    log.info("marketing.daily_snapshot", {
      dayKey: today,
      days: days.length,
      measuredDays: flow.size,
      observedQueries: level?.observedQueries ?? null,
    });
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
    log.error("marketing.daily_snapshot_failed", { dayKey: today, error: serializeError(error) });
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

/**
 * Как часто переснимается хвост окна. B697: раньше срез снимался ровно один раз
 * в сутки и после этого замирал до полуночи. Оба источника уточняют вчерашние и
 * позавчерашние данные в течение дня, поэтому строка, записанная в 00:05,
 * оставалась заведомо неполной ещё сутки.
 */
const SNAPSHOT_REFRESH_HOURS = 6;

/** Нужен ли проход: строки за сегодня нет или она давно не переснималась. */
export async function marketingSnapshotDue(now: Date): Promise<boolean> {
  const dayKey = moscowDayKey(now);
  const existing = await db.marketingDailySnapshot.findUnique({
    where: { dayKey },
    select: { capturedAt: true },
  }).catch(() => null);
  if (!existing) return true;
  return now.getTime() - existing.capturedAt.getTime() >= SNAPSHOT_REFRESH_HOURS * 60 * 60_000;
}

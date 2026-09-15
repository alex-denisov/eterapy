/**
 * B746 — ТРЕНД И РАЗНООБРАЗИЕ: ЧТО ИЗМЕНИЛОСЬ, А НЕ ТОЛЬКО «КАК СЕЙЧАС».
 *
 * Владелец 2026-09-15: «хочу чтоб в отчётах оркестратора видно было какую-то
 * тенденцию (графики или что-то визуальное) "что изменилось и как
 * улучшилось", а то сейчас я вижу что он топчется на месте и дает кучу
 * текстовых отчетов». И второе: «такое впечатление будто оркестратор живет
 * полностью отрешенным от данных проекта и ничего сам не читает».
 *
 * Оба упрёка справедливы к одному и тому же месту. `OrchestratorState` — срез
 * «сейчас»: спрос, очередь, живые провайдеры. В нём нет ни ряда по дням, ни
 * меры однотипности — и потому оркестратор не мог увидеть ни ленту из десяти
 * одинаковых постов («9 аркан (Отшельник)» 10 раз за 12 суток, замер прода
 * 2026-09-15), ни того, стало ли лучше после его же правок.
 *
 * Ряды здесь НЕ заводят новых таблиц: всё уже лежит в базе —
 * `external_publications.published_at`, `external_publication_metrics`,
 * `seo_library_pages.published_at`, `marketing_daily_snapshots`. Это срез
 * над существующим, и его можно пересчитать за любой день задним числом.
 *
 * Чистые функции отделены от чтения базы: диагноз и отчёт проверяются
 * прогоном на выдуманных рядах, а не на живой базе (то же решение, что у
 * `orchestrator-state.ts`).
 */

import db from "@/lib/db";
import { SEO_PAGE_STATUS } from "@/lib/seo/library-store";

export const TREND_DAYS = 14;
export const DIVERSITY_WINDOW_DAYS = 7;

/** Один день ряда — московские сутки. */
export interface TrendDay {
  day: string;
  /** Постов вышло на всех площадках. */
  posts: number;
  /** Разных заголовков среди них. */
  distinctTitles: number;
  /** Постов с картинкой. */
  withMedia: number;
  /** Просмотры постов, вышедших в этот день (последний замер по каждому). */
  views: number;
  /** Страниц Библиотеки выпущено SEO-агентом. */
  seoPages: number;
  /** Показы и клики в поиске за сутки (`marketing_daily_snapshots`); `null` — не снимали. */
  impressions: number | null;
  clicks: number | null;
}

export interface PlatformDiversity {
  platform: string;
  posts: number;
  distinctTitles: number;
  /** Доля постов с картинкой, 0…1. */
  mediaShare: number;
  /** Самый частый заголовок и сколько раз он вышел. */
  topTitle: string | null;
  topTitleCount: number;
  /** Разных форматов (из `notes.format`). */
  formats: number;
}

export interface WeekDelta {
  metric: "posts" | "distinctShare" | "views" | "seoPages" | "impressions" | "clicks";
  label: string;
  current: number;
  previous: number;
  /** В какую сторону «лучше». */
  better: "up" | "down";
  unit: string;
}

export interface TrendState {
  days: TrendDay[];
  weeks: WeekDelta[];
  diversity: PlatformDiversity[];
  /**
   * Черновики без текста, дублирующие тему, которая уже стоит или вышла на
   * той же площадке в окне. Кандидаты на снятие: их перепишет планировщик с
   * новой темой, и стоят они одной строки в базе (B646 — черновик без текста
   * уступает всегда).
   */
  duplicateDraftIds: string[];
}

export interface PublicationRow {
  id: string;
  platform: string;
  status: string;
  title: string;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  mediaUrl: string | null;
  utmContent: string | null;
  notes: string | null;
  agentReviewedAt: Date | null;
  views: number | null;
}

export function moscowDayKey(value: Date): string {
  return new Date(value.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function formatOf(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as { format?: unknown };
    return typeof parsed.format === "string" ? parsed.format : null;
  } catch {
    return null;
  }
}

/** Разнообразие ленты каждой площадки за окно — чистая функция от строк. */
export function diversityFrom(rows: readonly PublicationRow[]): PlatformDiversity[] {
  const byPlatform = new Map<string, PublicationRow[]>();
  for (const row of rows) {
    if (row.status !== "PUBLISHED") continue;
    const platform = row.platform.trim().toLowerCase();
    byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), row]);
  }
  return [...byPlatform.entries()]
    .map(([platform, items]) => {
      const titles = new Map<string, number>();
      const formats = new Set<string>();
      let withMedia = 0;
      for (const row of items) {
        const title = row.title.trim().toLowerCase();
        titles.set(title, (titles.get(title) ?? 0) + 1);
        if (row.mediaUrl) withMedia += 1;
        const format = formatOf(row.notes);
        if (format) formats.add(format);
      }
      const top = [...titles.entries()].sort((left, right) => right[1] - left[1])[0];
      return {
        platform,
        posts: items.length,
        distinctTitles: titles.size,
        mediaShare: items.length > 0 ? withMedia / items.length : 0,
        topTitle: top ? items.find((row) => row.title.trim().toLowerCase() === top[0])?.title ?? top[0] : null,
        topTitleCount: top?.[1] ?? 0,
        formats: formats.size,
      };
    })
    .sort((left, right) => right.posts - left.posts);
}

/** Суточный ряд — чистая функция от строк и срезов. */
export function trendDaysFrom(input: {
  now: Date;
  days?: number;
  publications: readonly PublicationRow[];
  seoPublishedAt: readonly Date[];
  snapshots: readonly { dayKey: string; impressions: number; clicks: number }[];
}): TrendDay[] {
  const length = input.days ?? TREND_DAYS;
  const snapshotByDay = new Map(input.snapshots.map((row) => [row.dayKey, row]));
  const result: TrendDay[] = [];
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const day = moscowDayKey(new Date(input.now.getTime() - offset * 24 * 60 * 60_000));
    const posts = input.publications.filter(
      (row) => row.status === "PUBLISHED" && row.publishedAt && moscowDayKey(row.publishedAt) === day,
    );
    const snapshot = snapshotByDay.get(day);
    result.push({
      day,
      posts: posts.length,
      distinctTitles: new Set(posts.map((row) => row.title.trim().toLowerCase())).size,
      withMedia: posts.filter((row) => row.mediaUrl).length,
      views: posts.reduce((sum, row) => sum + (row.views ?? 0), 0),
      seoPages: input.seoPublishedAt.filter((value) => moscowDayKey(value) === day).length,
      impressions: snapshot?.impressions ?? null,
      clicks: snapshot?.clicks ?? null,
    });
  }
  return result;
}

/** Неделя к неделе: последние 7 дней против предыдущих 7. */
export function weekDeltasFrom(days: readonly TrendDay[]): WeekDelta[] {
  const current = days.slice(-7);
  const previous = days.slice(-14, -7);
  const sum = (items: readonly TrendDay[], pick: (day: TrendDay) => number | null) =>
    items.reduce((total, day) => total + (pick(day) ?? 0), 0);
  const distinctShare = (items: readonly TrendDay[]) => {
    const posts = sum(items, (day) => day.posts);
    return posts > 0 ? Math.round((sum(items, (day) => day.distinctTitles) / posts) * 100) : 0;
  };
  return [
    { metric: "posts", label: "Постов вышло", current: sum(current, (d) => d.posts), previous: sum(previous, (d) => d.posts), better: "up", unit: "" },
    { metric: "distinctShare", label: "Разных заголовков", current: distinctShare(current), previous: distinctShare(previous), better: "up", unit: "%" },
    { metric: "views", label: "Просмотров", current: sum(current, (d) => d.views), previous: sum(previous, (d) => d.views), better: "up", unit: "" },
    { metric: "seoPages", label: "Страниц Библиотеки", current: sum(current, (d) => d.seoPages), previous: sum(previous, (d) => d.seoPages), better: "up", unit: "" },
    { metric: "impressions", label: "Показов в поиске", current: sum(current, (d) => d.impressions), previous: sum(previous, (d) => d.impressions), better: "up", unit: "" },
    { metric: "clicks", label: "Кликов из поиска", current: sum(current, (d) => d.clicks), previous: sum(previous, (d) => d.clicks), better: "up", unit: "" },
  ];
}

/**
 * Черновики-дубли: без текста, с темой (слаг статьи), которая на той же
 * площадке уже вышла/стоит в окне или уже занята более ранним черновиком.
 * Первый по времени остаётся, остальные — кандидаты на снятие.
 */
export function duplicateDraftIdsFrom(rows: readonly PublicationRow[]): string[] {
  const takenByPlatform = new Map<string, Set<string>>();
  const drafts: PublicationRow[] = [];
  for (const row of rows) {
    const platform = row.platform.trim().toLowerCase();
    const slug = row.utmContent?.trim().toLowerCase();
    if (!slug) continue;
    const isEmptyDraft = row.status === "DRAFT" && !row.agentReviewedAt;
    if (isEmptyDraft) {
      drafts.push(row);
      continue;
    }
    if (row.status === "ARCHIVED" || row.status === "FAILED") continue;
    const set = takenByPlatform.get(platform) ?? new Set<string>();
    set.add(slug);
    takenByPlatform.set(platform, set);
  }
  const result: string[] = [];
  const ordered = [...drafts].sort(
    (left, right) => (left.scheduledFor?.getTime() ?? 0) - (right.scheduledFor?.getTime() ?? 0),
  );
  for (const draft of ordered) {
    const platform = draft.platform.trim().toLowerCase();
    const slug = draft.utmContent!.trim().toLowerCase();
    const set = takenByPlatform.get(platform) ?? new Set<string>();
    if (set.has(slug)) {
      result.push(draft.id);
      continue;
    }
    set.add(slug);
    takenByPlatform.set(platform, set);
  }
  return result;
}

export async function collectTrend(input: { now?: Date } = {}): Promise<TrendState> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - TREND_DAYS * 24 * 60 * 60_000);
  const ahead = new Date(now.getTime() + TREND_DAYS * 24 * 60 * 60_000);

  const [rows, seoPages, snapshots] = await Promise.all([
    db.externalPublication.findMany({
      where: {
        OR: [
          { publishedAt: { gte: since } },
          { scheduledFor: { gte: since, lte: ahead }, status: { in: ["DRAFT", "REVIEW", "SCHEDULED", "PLANNED"] } },
        ],
        contentType: "POST",
      },
      select: {
        id: true,
        platform: true,
        status: true,
        title: true,
        publishedAt: true,
        scheduledFor: true,
        mediaUrl: true,
        utmContent: true,
        notes: true,
        agentReviewedAt: true,
        metrics: {
          orderBy: { recordedAt: "desc" },
          take: 1,
          select: { views: true, reach: true },
        },
      },
    }).catch(() => []),
    db.seoLibraryPage.findMany({
      where: { status: SEO_PAGE_STATUS.published, publishedAt: { gte: since } },
      select: { publishedAt: true },
    }).catch(() => []),
    db.marketingDailySnapshot.findMany({
      where: { dayKey: { gte: moscowDayKey(since) } },
      select: { dayKey: true, impressions: true, clicks: true },
    }).catch(() => []),
  ]);

  const publications: PublicationRow[] = rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    status: row.status,
    title: row.title,
    publishedAt: row.publishedAt,
    scheduledFor: row.scheduledFor,
    mediaUrl: row.mediaUrl,
    utmContent: row.utmContent,
    notes: row.notes,
    agentReviewedAt: row.agentReviewedAt,
    views: row.metrics[0]?.views ?? row.metrics[0]?.reach ?? null,
  }));

  const windowStart = now.getTime() - DIVERSITY_WINDOW_DAYS * 24 * 60 * 60_000;
  const days = trendDaysFrom({
    now,
    publications,
    seoPublishedAt: seoPages
      .map((row) => row.publishedAt)
      .filter((value): value is Date => value instanceof Date),
    snapshots,
  });
  return {
    days,
    weeks: weekDeltasFrom(days),
    diversity: diversityFrom(
      publications.filter((row) => row.publishedAt && row.publishedAt.getTime() >= windowStart),
    ),
    duplicateDraftIds: duplicateDraftIdsFrom(publications),
  };
}

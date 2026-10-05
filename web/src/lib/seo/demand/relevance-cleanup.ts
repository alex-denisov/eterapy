/**
 * B750 — ОЧЕРЕДЬ САМА СНИМАЕТ УЖЕ НАБРАННЫЙ МУСОР.
 *
 * Фильтр в `rejectReasonFor` защищает только новые заходы сбора, а в очереди
 * уже лежали сотни строк, пришедших до него. Функция идемпотентна и дешёвая:
 * после первого прохода `NEW`-строк, которые фильтр отвергает, больше нет, и
 * каждый следующий заход читает очередь и ничего не пишет.
 *
 * Трогает только `NEW`: взятая в работу и закрытая страницей фраза уже
 * принадлежит материалу, и менять ей статус задним числом нельзя.
 */

import db from "@/lib/db";
import { duplicateOf } from "@/lib/seo/demand/duplicates";
import { relevanceVerdict } from "@/lib/seo/demand/relevance";
import { SEO_PAGE_STATUS } from "@/lib/seo/page-kinds";

export interface RelevanceCleanupResult {
  scanned: number;
  rejected: number;
}

export const RELEVANCE_REJECT_PREFIX = "B750: нерелевантно — ";
export const DUPLICATE_REJECT_PREFIX = "B750: дубль темы — ";
/** Потолок строк за проход: попарная проверка O(n²) остаётся дешёвой. */
export const CLEANUP_MAX_ROWS = 600;

/**
 * Фразы, чьё намерение уже занято: взятые в работу, закрытые страницей и
 * опубликованные страницы. Новая фраза, близкая к любой из них, — каннибал.
 */
export async function liveTopicPhrases(options: { includeNew?: boolean } = {}): Promise<string[]> {
  const [candidates, pages] = await Promise.all([
    db.seoKeywordCandidate
      .findMany({
        where: { status: { in: options.includeNew ? ["NEW", "PLANNED", "USED"] : ["PLANNED", "USED"] } },
        select: { phrase: true },
        take: 2000,
      })
      .catch(() => [] as Array<{ phrase: string }>),
    db.seoLibraryPage
      .findMany({
        where: { status: SEO_PAGE_STATUS.published },
        select: { targetQuery: true },
        take: 2000,
      })
      .catch(() => [] as Array<{ targetQuery: string }>),
  ]);
  return [...candidates.map((row) => row.phrase), ...pages.map((row) => row.targetQuery)];
}

export async function rejectIrrelevantCandidates(): Promise<RelevanceCleanupResult> {
  const rows = (await db.seoKeywordCandidate.findMany({
    where: { status: "NEW" },
    select: { id: true, phrase: true, cluster: true, monthlyDemand: true, firstSeenAt: true },
    orderBy: [{ monthlyDemand: { sort: "desc", nulls: "last" } }, { firstSeenAt: "asc" }],
    take: CLEANUP_MAX_ROWS,
  })) as Array<{
    id: string;
    phrase: string;
    cluster: string | null;
    monthlyDemand?: number | null;
    firstSeenAt?: Date;
  }>;

  const idsByReason = new Map<string, string[]>();
  const reject = (reason: string, id: string) =>
    idsByReason.set(reason, [...(idsByReason.get(reason) ?? []), id]);

  const survivors: typeof rows = [];
  for (const row of rows) {
    const verdict = relevanceVerdict(row.phrase, row.cluster);
    if (verdict) reject(`${RELEVANCE_REJECT_PREFIX}${verdict}`, row.id);
    else survivors.push(row);
  }

  // Порядок: частота по убыванию, при равенстве — раньше замеченная. Сортируем
  // здесь, а не доверяем базе: так правило держится и на подменённой выборке.
  const ordered = [...survivors].sort(
    (a, b) =>
      (b.monthlyDemand ?? -1) - (a.monthlyDemand ?? -1) ||
      (a.firstSeenAt?.getTime() ?? 0) - (b.firstSeenAt?.getTime() ?? 0),
  );
  const occupied = await liveTopicPhrases();
  const kept: string[] = [];
  for (const row of ordered) {
    const rival = duplicateOf(row.phrase, occupied) ?? duplicateOf(row.phrase, kept);
    if (rival) reject(`${DUPLICATE_REJECT_PREFIX}${rival}`, row.id);
    else kept.push(row.phrase);
  }

  let rejected = 0;
  for (const [reason, ids] of idsByReason) {
    // Условие `status: NEW` повторено: между чтением и записью агент мог взять
    // строку в работу, и перезаписать его статус нельзя.
    const result = await db.seoKeywordCandidate.updateMany({
      where: { id: { in: ids }, status: "NEW" },
      data: { status: "REJECTED", rejectReason: reason },
    });
    rejected += result.count;
  }
  return { scanned: rows.length, rejected };
}

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
import { relevanceVerdict } from "@/lib/seo/demand/relevance";

export interface RelevanceCleanupResult {
  scanned: number;
  rejected: number;
}

export const RELEVANCE_REJECT_PREFIX = "B750: нерелевантно — ";

export async function rejectIrrelevantCandidates(): Promise<RelevanceCleanupResult> {
  const rows = await db.seoKeywordCandidate.findMany({
    where: { status: "NEW" },
    select: { id: true, phrase: true, cluster: true },
  });

  const idsByReason = new Map<string, string[]>();
  for (const row of rows) {
    const verdict = relevanceVerdict(row.phrase, row.cluster);
    if (!verdict) continue;
    const reason = `${RELEVANCE_REJECT_PREFIX}${verdict}`;
    idsByReason.set(reason, [...(idsByReason.get(reason) ?? []), row.id]);
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

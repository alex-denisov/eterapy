/**
 * B750 — ЛЕСЕНКА ЧАСТОТНОСТИ ДЛЯ ОЧЕРЕДИ SEO-ЗАПРОСОВ.
 *
 * Совет, с которого всё началось: при нулевом доверии к домену начинать надо с
 * запросов средней и низкой частоты, где реально выйти на первые места, и
 * подниматься вверх по мере роста. Очередь делала наоборот: сортировка
 * `monthlyDemand desc` отдавала агенту фразу на 40–60 тысяч показов, а ИКС 0
 * и 52 проиндексированные страницы в такой выдаче не видны.
 *
 * Потолок хранится в `platform_settings` (`seo.demand_ceiling`), и оркестратор
 * вправе его двигать: рост показов в Вебмастере/GSC — основание поднять.
 */

import db from "@/lib/db";

/** Ниже пола фраза не окупает страницу (в Wordstat это единицы запросов в месяц). */
export const SEO_DEMAND_FLOOR = 300;
export const SEO_DEMAND_CEILING_KEY = "seo.demand_ceiling";
export const SEO_DEMAND_CEILING_DEFAULT = 3_000;
export const SEO_DEMAND_CEILING_MIN = 1_000;
export const SEO_DEMAND_CEILING_MAX = 60_000;

export interface LadderCandidate {
  id: string;
  monthlyDemand: number | null;
  growth: number | null;
  /** Направление ядра. Без него кандидат считается непокрытым направлением «-». */
  cluster?: string | null;
}

/** Сколько опубликованных страниц уже у каждого направления. */
export type ClusterCoverage = ReadonlyMap<string, number>;

const clusterKey = (candidate: LadderCandidate) => candidate.cluster ?? "-";

export function clampDemandCeiling(value: number): number {
  if (!Number.isFinite(value)) return SEO_DEMAND_CEILING_DEFAULT;
  return Math.min(SEO_DEMAND_CEILING_MAX, Math.max(SEO_DEMAND_CEILING_MIN, Math.round(value)));
}

export async function seoDemandCeiling(): Promise<number> {
  const row = await db.platformSetting
    .findUnique({ where: { key: SEO_DEMAND_CEILING_KEY }, select: { value: true } })
    .catch(() => null);
  if (!row) return SEO_DEMAND_CEILING_DEFAULT;
  return clampDemandCeiling(Number(row.value));
}

/**
 * Выбор запроса:
 *  1. лучший (самый частотный) ВНУТРИ полосы [пол, потолок];
 *  2. полоса пуста — самый низкий из лежащих выше потолка, чтобы очередь не
 *     голодала, но и не прыгала сразу к головным фразам;
 *  3. измеренного спроса нет вовсе — растущие запросы Trends по росту.
 */
export function pickLadderCandidate<T extends LadderCandidate>(
  candidates: readonly T[],
  ceiling: number,
  coverage: ClusterCoverage = new Map(),
): T | null {
  /**
   * B750 — БАЛАНС НАПРАВЛЕНИЙ. Владелец 2026-10-05: «SEO должно работать не в
   * одном направлении». Из 17 страниц 12 лежали в «Натальной карте». Внутри
   * полосы побеждает направление с НАИМЕНЬШИМ числом страниц, и только потом
   * частота: одна и та же тема не получает вторую страницу, пока у другой нет
   * ни одной.
   */
  const byCoverage = (a: T, b: T) =>
    (coverage.get(clusterKey(a)) ?? 0) - (coverage.get(clusterKey(b)) ?? 0);
  const measured = candidates.filter(
    (candidate): candidate is T & { monthlyDemand: number } =>
      candidate.monthlyDemand !== null && candidate.monthlyDemand >= SEO_DEMAND_FLOOR,
  );
  const inBand = measured
    .filter((candidate) => candidate.monthlyDemand <= ceiling)
    .sort((a, b) => byCoverage(a, b) || b.monthlyDemand - a.monthlyDemand);
  if (inBand[0]) return inBand[0];

  const above = measured
    .filter((candidate) => candidate.monthlyDemand > ceiling)
    .sort((a, b) => byCoverage(a, b) || a.monthlyDemand - b.monthlyDemand);
  if (above[0]) return above[0];

  const unmeasured = candidates
    .filter((candidate) => candidate.monthlyDemand === null)
    .sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0));
  return unmeasured[0] ?? null;
}

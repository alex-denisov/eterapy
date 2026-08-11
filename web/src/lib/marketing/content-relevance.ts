/**
 * B702 фаза 1 — спрос как единый вход планировщика тем.
 *
 * Контент-план до сих пор выбирал тему ротацией по константе `TOPICS`, и
 * `SEMANTIC_CORE` (1750 фраз), wordstat-графики и запросы Вебмастера/поисковой
 * консоли на решение не влияли. Этот модуль сводит все источники спроса в один
 * снимок и даёт чистый scorer «насколько тема релевантна тому, что люди ищут».
 *
 * Scorer ЧИСТЫЙ и не имеет права тянуть сеть: снимок спроса собирается в одном
 * месте и проходит по кругу, а падение источника на пути сборки не должно
 * валить планировщик — недоступный источник просто отдаёт пустой список.
 */

import { buildQueryFamilyMatcher } from "@/lib/search-marketing-parsers";
import type { SearchQueryMetric, WordstatMetric } from "@/lib/search-marketing-parsers";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";

/** Откуда пришла фраза спроса. */
export type DemandSource = "semanticCore" | "wordstat" | "webmaster" | "gsc";

export interface DemandSignalItem {
  phrase: string;
  /** Показов в месяц (ядро/wordstat) или показов за окно (webmaster/gsc). */
  demand: number;
  source: DemandSource;
}

/**
 * Снимок спроса на момент планирования. `items` плоские и готовые к scorer'у;
 * `window` — окно, за которое собраны живые данные (если источник их отдаёт).
 */
export interface DemandSignals {
  items: DemandSignalItem[];
  window?: { from: string; to: string } | null;
}

/** Балл релевантности темы спросу. */
export interface TopicDemandScore {
  /** Суммарный балл. 0 — спроса по теме нет ни в одном источнике. */
  score: number;
  /** Фразы, по которым тема совпала с источником. */
  matched: DemandSignalItem[];
  /** Источники, давшие ненулевой вклад. */
  sources: DemandSource[];
}

const DEMAND_SOURCE_WEIGHT: Record<DemandSource, number> = {
  // Ядро собрано разовым замером и стареет — его вклад скромный.
  semanticCore: 1,
  // Живой wordstat за сутки — ближе к реальному спросу.
  wordstat: 2,
  // Что уже искали на нашем сайте — самый свежий и специфичный сигнал.
  webmaster: 3,
  gsc: 3,
};

/** Фразы спроса из семантического ядра (замер Wordstat 27.07.2026). */
export function demandFromCore(): DemandSignalItem[] {
  return SEMANTIC_CORE.flatMap((cluster) =>
    cluster.phrases.map((phrase) => ({
      phrase: phrase.phrase,
      demand: phrase.demand,
      source: "semanticCore" as const,
    })),
  );
}

/** Фразы спроса из живого wordstat watchlist (`WordstatMetric[]`). */
export function demandFromWordstat(metrics: WordstatMetric[]): DemandSignalItem[] {
  return metrics.flatMap((item) =>
    item.monthlyDemand === null ? [] : [{ phrase: item.phrase, demand: item.monthlyDemand, source: "wordstat" as const }],
  );
}

/** Фразы спроса из популярных запросов Вебмастера. */
export function demandFromWebmaster(queries: SearchQueryMetric[]): DemandSignalItem[] {
  return queries.flatMap((item) =>
    item.impressions <= 0 ? [] : [{ phrase: item.query, demand: item.impressions, source: "webmaster" as const }],
  );
}

/** Фразы спроса из запросов поисковой консоли. */
export function demandFromGsc(queries: SearchQueryMetric[]): DemandSignalItem[] {
  return queries.flatMap((item) =>
    item.impressions <= 0 ? [] : [{ phrase: item.query, demand: item.impressions, source: "gsc" as const }],
  );
}

/** Свести источники в один снимок. Пустой источник не ломает снимок. */
export function mergeDemandSignals(
  groups: DemandSignalItem[][],
  window?: { from: string; to: string } | null,
): DemandSignals {
  return { items: groups.flat(), window };
}

/**
 * Насколько тема релевантна спросу.
 *
 * Тема совпадает с фразой спроса, когда каждый токен целевого запроса темы
 * встречается во фразе по стеммингу `search-marketing-parsers`. Такое
 * пересечение ловит и точное вхождение, и словоформы («вернётся ли бывший»
 * найдёт «вернётся ли бывший человек»), но не подтянет чужой кластер из
 * случайной общей лексемы. Кластер темы как запасной ключ не используется:
 * названия кластеров («расставание и возврат») не пересекаются с фразами
 * спроса по токенам, и матч по нему давал бы ложные нули.
 *
 * Балл — взвешенная лог-нормализованная сумма спроса совпавших фраз: живой
 * сигнал важнее разового замера, а гигантский показ не забивает всё остальное.
 */
export function scoreTopicDemand(
  topic: { targetQuery?: string | null; cluster?: string | null },
  signals: DemandSignals,
): TopicDemandScore {
  const query = (topic.targetQuery ?? "").trim().toLocaleLowerCase("ru-RU");
  if (!query || signals.items.length === 0) {
    return { score: 0, matched: [], sources: [] };
  }

  // Строим псевдо-запросы: scorer'у parsers нужен `SearchQueryMetric`, но нам
  // важна только фраза и её вес. Показы храним в `impressions` — туда же, где
  // живут реальные показы Вебмастера.
  const pseudoQueries: SearchQueryMetric[] = signals.items.map((item) => ({
    query: item.phrase,
    impressions: item.demand,
    clicks: 0,
    ctr: 0,
    averagePosition: null,
    opportunity: "Удерживать",
  }));

  const match = buildQueryFamilyMatcher(pseudoQueries)(query);
  if (match.length === 0) {
    return { score: 0, matched: [], sources: [] };
  }

  const matched = signals.items.filter((item) =>
    match.some((entry) => entry.query === item.phrase),
  );
  const score = matched.reduce(
    (sum, item) => sum + DEMAND_SOURCE_WEIGHT[item.source] * Math.log1p(item.demand),
    0,
  );
  return {
    score,
    matched,
    sources: [...new Set(matched.map((item) => item.source))],
  };
}

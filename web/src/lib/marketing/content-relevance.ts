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

const EMPTY_SCORE: TopicDemandScore = { score: 0, matched: [], sources: [] };

/**
 * Какая доля слов фразы спроса должна найтись в тексте темы, чтобы фраза
 * зачлась.
 *
 * Не 1.0 намеренно: «к чему снится вода в доме» обслуживается статьёй «к чему
 * снится вода», и терять этот спрос из-за двух лишних слов неправильно. Не
 * ниже 0.6 — иначе одно общее слово («отношения») притянет чужой кластер, а
 * ровно это и сломало первый замер.
 */
const DEMAND_COVERAGE_MIN = 0.6;

const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;

/** Тот же стем, что у `search-marketing-parsers`: слово от пяти букв теряет последнюю. */
function stems(value: string): string[] {
  return value
    .toLocaleLowerCase("ru-RU")
    .split(TOKEN_SPLIT)
    .filter(Boolean)
    .map((token) => (token.length >= 5 ? token.slice(0, -1) : token));
}

/**
 * Совпадение стемов с допуском на словоформу — правило `search-marketing-parsers`:
 * короткий токен приставкой не считаем, иначе «дом» подтянет «домашний».
 */
function stemsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < 4) return false;
  return longer.startsWith(shorter) && longer.length - shorter.length <= 2;
}

/** Ключ корзины индекса. Совпадающие по `stemsMatch` стемы делят первые 4 буквы. */
function bucketKey(stem: string): string {
  return stem.slice(0, 4);
}

/**
 * Готовый scorer по снимку спроса: «сколько спроса покрывает эта тема».
 *
 * НАПРАВЛЕНИЕ СРАВНЕНИЯ. Первая реализация звала `buildQueryFamilyMatcher` и
 * спрашивала обратное: «содержится ли текст темы во фразе спроса». Для семьи
 * запросов (короткое зерно → его длинные варианты) это верно, для темы статьи —
 * нет, и замер на стенде 2026-08-11 показал цену ошибки:
 *
 * - человеческий вопрос статьи («Мне очень одиноко, хотя вокруг люди») не
 *   совпадал НИ С ЧЕМ: фразы спроса короче вопроса, значит «все слова вопроса
 *   есть во фразе» невыполнимо;
 * - зато название кластера («Отношения») совпадало со 183 фразами сразу.
 *
 * В итоге балл считался на уровне КЛАСТЕРА: у всех восьми слотов он был
 * одинаковым (1682.7), и выбор темы сваливался в алфавит слага. Планировщик
 * выглядел работающим и не ранжировал ничего.
 *
 * Теперь тема — это текст, а фраза спроса — искомое: фраза засчитывается, если
 * в тексте темы нашлось не меньше `DEMAND_COVERAGE_MIN` её слов. Балл —
 * взвешенная лог-нормализованная сумма спроса засчитанных фраз.
 */
export function createDemandScorer(
  signals: DemandSignals,
): (topic: { targetQuery?: string | null; cluster?: string | null }) => TopicDemandScore {
  if (signals.items.length === 0) return () => EMPTY_SCORE;

  // Снимок раскладывается ОДИН раз: 1750 фраз против сотен тем — пересборка на
  // каждую тему стоила 16 секунд прохода (замер 2026-08-11).
  const phraseStems = signals.items.map((item) => stems(item.phrase));
  // Обратный индекс «первые 4 буквы стема → номера фраз». Без него на каждую
  // тему пришлось бы сверять её слова со всеми 1750 фразами.
  const buckets = new Map<string, number[]>();
  phraseStems.forEach((tokens, index) => {
    for (const token of new Set(tokens)) {
      const key = bucketKey(token);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
  });

  return (topic) => {
    const topicStems = stems(topic.targetQuery ?? "");
    if (topicStems.length === 0) return EMPTY_SCORE;

    // Сколько РАЗНЫХ слов фразы нашлось в тексте темы.
    const hits = new Map<number, Set<string>>();
    for (const token of new Set(topicStems)) {
      for (const index of buckets.get(bucketKey(token)) ?? []) {
        for (const phraseToken of phraseStems[index]) {
          if (!stemsMatch(phraseToken, token)) continue;
          const found = hits.get(index);
          if (found) found.add(phraseToken);
          else hits.set(index, new Set([phraseToken]));
        }
      }
    }

    const matched: DemandSignalItem[] = [];
    for (const [index, found] of hits) {
      const total = new Set(phraseStems[index]).size;
      if (total === 0 || found.size / total < DEMAND_COVERAGE_MIN) continue;
      matched.push(signals.items[index]);
    }
    if (matched.length === 0) return EMPTY_SCORE;

    const score = matched.reduce(
      (sum, item) => sum + DEMAND_SOURCE_WEIGHT[item.source] * Math.log1p(item.demand),
      0,
    );
    return { score, matched, sources: [...new Set(matched.map((item) => item.source))] };
  };
}

/**
 * Насколько тема релевантна спросу — разовый вызов.
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
 *
 * Для нескольких тем по одному снимку берите `createDemandScorer`: здесь снимок
 * стеммится заново на каждый вызов.
 */
export function scoreTopicDemand(
  topic: { targetQuery?: string | null; cluster?: string | null },
  signals: DemandSignals,
): TopicDemandScore {
  return createDemandScorer(signals)(topic);
}

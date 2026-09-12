/**
 * B740 — РАСТУЩИЕ ЗАПРОСЫ ИЗ GOOGLE TRENDS.
 *
 * Wordstat отвечает на вопрос «сколько людей ищут это вообще». Trends отвечает
 * на другой — «что вокруг этой темы РАСТЁТ прямо сейчас». Два источника не
 * дублируют друг друга: у Яндекса нет ничего похожего на `rising`, а у Google
 * нет абсолютной частотности по России в нужной нам гранулярности.
 *
 * ⚠ ПОЧЕМУ ДВА ЗАПРОСА, А НЕ ОДИН. У Trends нет публичного метода «дай
 * связанные запросы по фразе». Есть двухшаговый путь, которым ходит сам сайт:
 *
 *   1. `/api/explore` по теме отдаёт список виджетов; у каждого свой `token`
 *      и свой `request` — подписанные параметры конкретного виджета;
 *   2. `/api/widgetdata/relatedsearches` с этим токеном отдаёт данные.
 *
 * Пропустить первый шаг нельзя: без токена второй отвечает 400. Токен
 * одноразовый по смыслу — он привязан к параметрам запроса, поэтому кэшировать
 * его между темами бессмысленно.
 *
 * ⚠ ОТВЕТ НАЧИНАЕТСЯ С МУСОРА. Обе ручки отдают `)]}',\n` перед JSON — это
 * защита от JSONP-исполнения, а не повреждённый ответ. `JSON.parse` на сыром
 * теле падает всегда, поэтому префикс срезается по первой `{`.
 *
 * ⚠ КЛЮЧА У ЭТОГО ИСТОЧНИКА НЕТ, И ЭТО НЕ ПОВОД СЧИТАТЬ ЕГО НАДЁЖНЫМ. Google
 * отвечает 429 без предупреждения и может замолчать совсем. Поэтому модуль
 * ВСЕГДА возвращает список (пустой при отказе) и никогда не бросает: спрос из
 * Wordstat самодостаточен, а Trends — добавка.
 */

import { log, serializeError } from "@/lib/logger";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import {
  seedWindow as wordstatSeedWindow,
  type HarvestedPhrase,
} from "@/lib/seo/demand/wordstat-harvest";

const EXPLORE_URL = "https://trends.google.com/trends/api/explore";
const RELATED_URL = "https://trends.google.com/trends/api/widgetdata/relatedsearches";

/** Сколько тем спрашиваем за заход. Больше — и площадка отвечает 429. */
export const TRENDS_SEEDS_PER_RUN = 2;
/** Сколько растущих запросов берём с темы. */
export const TRENDS_PHRASES_PER_SEED = 12;
/**
 * Порог роста. `value` у Trends — это процент роста для `rising`; запросы с
 * прорывным ростом приходят со служебным значением 5000 («Breakout»).
 */
export const TRENDS_MIN_RISE_PERCENT = 50;

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Срезает антиJSONP-префикс `)]}'` и разбирает остаток. */
export function parseTrendsBody(raw: string): unknown {
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("Google Trends вернул тело без JSON");
  return JSON.parse(raw.slice(start));
}

/** Виджет связанных запросов из ответа `explore`. */
export function pickRelatedQueriesWidget(payload: unknown): { token: string; request: unknown } | null {
  const widgets = (payload as { widgets?: unknown })?.widgets;
  if (!Array.isArray(widgets)) return null;
  for (const raw of widgets) {
    const widget = (raw ?? {}) as Record<string, unknown>;
    // `id` у виджета связанных запросов — `RELATED_QUERIES`; у связанных ТЕМ
    // он `RELATED_TOPICS`, и данные там про сущности, а не про запросы людей.
    if (widget.id !== "RELATED_QUERIES") continue;
    const token = typeof widget.token === "string" ? widget.token : "";
    if (!token || !widget.request) continue;
    return { token, request: widget.request };
  }
  return null;
}

/**
 * Растущие запросы из ответа `relatedsearches`.
 *
 * `rankedList` содержит ДВА списка: нулевой — самые популярные (`top`),
 * первый — растущие (`rising`). Нужен именно первый: популярное мы и так
 * знаем из Wordstat, а растущее — это то, чего там ещё нет.
 */
export function parseRisingQueries(payload: unknown): Array<{ query: string; value: number }> {
  const lists = (payload as { default?: { rankedList?: unknown } })?.default?.rankedList;
  if (!Array.isArray(lists)) return [];
  const rising = lists[1] ?? lists[0];
  const keywords = (rising as { rankedKeyword?: unknown })?.rankedKeyword;
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const query = typeof row.query === "string" ? row.query.trim() : "";
      const value = Number(row.value);
      return { query, value: Number.isFinite(value) ? value : 0 };
    })
    .filter((row) => row.query.length > 0);
}

async function trendsJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`trends HTTP ${response.status}`);
  return parseTrendsBody(await response.text());
}

async function risingFor(seed: string): Promise<Array<{ query: string; value: number }>> {
  const exploreReq = {
    comparisonItem: [{ keyword: seed, geo: "RU", time: "today 12-m" }],
    category: 0,
    property: "",
  };
  const explore = await trendsJson(
    `${EXPLORE_URL}?hl=ru&tz=-180&req=${encodeURIComponent(JSON.stringify(exploreReq))}`,
  );
  const widget = pickRelatedQueriesWidget(explore);
  if (!widget) return [];
  const related = await trendsJson(
    `${RELATED_URL}?hl=ru&tz=-180&req=${encodeURIComponent(JSON.stringify(widget.request))}`
    + `&token=${encodeURIComponent(widget.token)}`,
  );
  return parseRisingQueries(related);
}

/**
 * Темы этого захода.
 *
 * ⚠ ОКНО ЯВНО ИСКЛЮЧАЕТ ТО, ЧТО В ЭТОМ ЖЕ ЗАХОДЕ СПРАШИВАЕТ WORDSTAT.
 *
 * Первая версия просто сдвигала начало окна на полкруга и надеялась, что
 * окна разойдутся. Они расходятся не всегда: шаги у окон разные (четыре против
 * двух), кластеров тринадцать, и на части слотов сдвинутое окно попадало
 * внутрь чужого. Два источника в такие заходы давали одну точку зрения —
 * молча, потому что спрос всё равно собирался.
 *
 * Поэтому исключение не вычисляется арифметикой, а спрашивается у самого
 * соседа: непересечение обязано быть свойством кода, а не совпадением
 * периодов.
 */
export function trendsSeedWindow(now: Date, size = TRENDS_SEEDS_PER_RUN) {
  const clusters = SEMANTIC_CORE.filter((cluster) => cluster.phrases.length > 0);
  if (clusters.length === 0) return [];
  const taken = new Set(wordstatSeedWindow(now).map((target) => target.seed));
  const free = clusters.filter((cluster) => !taken.has(cluster.phrases[0].phrase));
  // Если Wordstat занял всё ядро (кластеров меньше, чем его окно), берём круг
  // целиком: одна точка зрения лучше, чем ни одной.
  const pool = free.length > 0 ? free : clusters;
  const slot = Math.floor(now.getTime() / (6 * 60 * 60_000));
  const offset = (slot * size) % pool.length;
  return Array.from({ length: Math.min(size, pool.length) }, (_, index) => {
    const cluster = pool[(offset + index) % pool.length];
    return {
      seed: cluster.phrases[0].phrase,
      cluster: cluster.cluster,
      service: cluster.service,
    };
  });
}

export function googleTrendsEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  // Выключатель есть намеренно: источник без ключа и без SLA, и владелец
  // должен иметь возможность погасить его, не выкатывая код.
  return env.SEO_GOOGLE_TRENDS_ENABLED !== "false";
}

export async function harvestGoogleTrends(input: { now?: Date } = {}): Promise<HarvestedPhrase[]> {
  if (!googleTrendsEnabled()) return [];
  const now = input.now ?? new Date();
  const harvested: HarvestedPhrase[] = [];

  for (const target of trendsSeedWindow(now)) {
    try {
      const rows = await risingFor(target.seed);
      for (const row of rows.slice(0, TRENDS_PHRASES_PER_SEED)) {
        if (row.value < TRENDS_MIN_RISE_PERCENT) continue;
        harvested.push({
          phrase: row.query,
          // Абсолютной частотности Trends не отдаёт вовсе. Проставить сюда
          // число, выведенное из процента роста, значило бы выдумать замер.
          monthlyDemand: null,
          growth: row.value / 100,
          source: "google-trends",
          cluster: target.cluster,
          service: target.service,
        });
      }
    } catch (error) {
      log.warn("seo-demand.trends_seed_failed", {
        seed: target.seed,
        error: serializeError(error),
      });
    }
  }

  log.info("seo-demand.trends_harvested", { phrases: harvested.length });
  return harvested;
}

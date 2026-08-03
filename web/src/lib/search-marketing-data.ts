import { unstable_cache } from "next/cache";
import db from "@/lib/db";
import type { AdminPeriod } from "@/app/admin/admin-analytics-data";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import { publicSeoRoutes } from "@/lib/seo";
import { SEMANTIC_CORE, semanticCoreRows } from "@/lib/seo/semantic-core-index";
import type { SemanticIntent } from "@/lib/seo/semantic-core-types";
import {
  parseMetrikaTotals,
  parseMetrikaTrafficSources,
  matchQueryFamily,
  parseWebmasterQueries,
  parseWebmasterSummary,
  parseWebmasterWindow,
  parseWordstatDemand,
  weightedAveragePosition,
  type MetrikaTotals,
  type SearchQueryMetric,
  type TrafficSourceMetric,
  type WebmasterSummary,
  type WordstatMetric,
} from "@/lib/search-marketing-parsers";

export type StrategicKeyword = {
  phrase: string;
  cluster: string;
  landing: string;
  priority: "P1" | "P2";
  intent: SemanticIntent;
  service: string;
  serviceName: string;
  verifiedDemand: number;
};

// B578 → B607 → B608: одно семантическое ядро, и в нём НЕТ ни одной
// неизмеренной фразы.
//
// Владелец 2026-07-27: «нужно чтобы по каждому из услуг ты делал полный поиск
// слов из wordstat, пусть их будет не менее 50 по каждому, но не более 150
// (только при условии что у всех у них есть не менее 100 просмотров в месяц)».
//
// Ядро собрано по услугам (13 кластеров, 98 входных фраз Wordstat), поэтому
// оно живёт данными в `lib/seo/semantic-core/*`, а не литералом здесь: одна
// услуга — один файл, который можно перезамерить, не трогая остальные.
// Порог 100 показов и потолок 150 фраз зашиты в сборку ядра.
export const STRATEGIC_KEYWORDS: readonly StrategicKeyword[] = semanticCoreRows().map((row) => ({
  phrase: row.phrase,
  cluster: row.cluster,
  landing: row.landing,
  priority: row.priority,
  intent: row.intent,
  service: row.service,
  serviceName: row.serviceName,
  verifiedDemand: row.demand,
}));

// Живой Wordstat вызывается по одной головной фразе на услугу: 13 вызовов
// вместо 1769. Остальное ядро несёт сохранённый замер и позиции Вебмастера —
// открытие страницы не должно превращаться в очередь к API.
export const SEARCH_WATCHLIST = SEMANTIC_CORE
  .map((cluster) => cluster.phrases[0]?.phrase)
  .filter((phrase): phrase is string => Boolean(phrase));

export type MarketingSourceState = {
  key: "webmaster" | "metrika" | "wordstat" | "internal";
  label: string;
  status: "ready" | "missing" | "error";
  note: string;
  refreshedAt: string;
};

type ExternalResult<T> = {
  data: T;
  source: MarketingSourceState;
};

const EMPTY_SUMMARY: WebmasterSummary = {
  searchablePages: 0,
  downloadedPages: 0,
  siteQualityIndex: 0,
  fatalProblems: 0,
};

const EMPTY_METRIKA: MetrikaTotals = {
  visits: 0,
  users: 0,
  bounceRate: 0,
  pageDepth: 0,
};

function sourceState(
  key: MarketingSourceState["key"],
  label: string,
  status: MarketingSourceState["status"],
  note: string,
): MarketingSourceState {
  return { key, label, status, note, refreshedAt: new Date().toISOString() };
}

/**
 * Панель показывала одну и ту же фразу «Источник временно не отвечает» на любую
 * причину, поэтому «токен протух», «хост не тот» и «Яндекс дал 500» выглядели
 * одинаково — и неотличимо от честного нуля.
 *
 * Наружу уходит только КЛАСС причины, и классифицируем мы по типу ошибки, а не
 * по её тексту: тело ответа апстрима может содержать эхо запроса вместе с
 * токеном, и этот модуль не должен иметь к нему доступа даже случайно.
 */
class UpstreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`UPSTREAM_${status}`);
    this.name = "UpstreamError";
    this.status = status;
  }
}

function describeSourceFailure(error: unknown): string {
  if (error instanceof UpstreamError) {
    if (error.status === 401 || error.status === 403) return "Яндекс отклонил токен — нужен новый OAuth-токен";
    if (error.status === 404) return "Счётчик или хост не найден — проверьте id в настройках";
    if (error.status === 429) return "Превышен лимит обращений к API";
    return error.status >= 500 ? "Яндекс временно недоступен" : "Яндекс отклонил запрос";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Источник не ответил за 8 секунд";
  }
  return "Обращение к источнику не удалось";
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new UpstreamError(response.status);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * B649: раньше эта функция не принимала период вовсе, и Вебмастер отдавал свою
 * неделю по умолчанию. Фильтр на странице при этом стоял и выглядел рабочим —
 * менялись только Метрика и внутренняя воронка, то есть две карточки из шести.
 *
 * Окно, которое ВЕРНУЛ Яндекс, приходится показывать отдельно: у выгрузки
 * задержка в пару суток, и `date_to` он молча подрезает (запрос по 2026-08-04
 * возвращает данные по 2026-08-01). Без этого «фильтр не работает» и «данные
 * ещё не доехали» выглядят одинаково — ровно та ошибка, которую мы уже
 * разбирали с источниками маркетинга.
 */
async function getWebmaster(period: AdminPeriod): Promise<ExternalResult<{ summary: WebmasterSummary; queries: SearchQueryMetric[]; window: { from: string; to: string } | null }>> {
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!token) {
    return {
      data: { summary: EMPTY_SUMMARY, queries: [], window: null },
      source: sourceState("webmaster", "Яндекс Вебмастер", "missing", "Не настроен OAuth-токен"),
    };
  }

  const userId = process.env.YANDEX_WEBMASTER_USER_ID ?? "253574184";
  const hostId = process.env.YANDEX_WEBMASTER_HOST_ID ?? "https:eterapy.com:443";
  const host = encodeURIComponent(hostId);
  const base = `https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(userId)}/hosts/${host}`;
  const queryParams = new URLSearchParams({
    order_by: "TOTAL_SHOWS",
    limit: "500",
    offset: "0",
    date_from: period.startInput,
    date_to: period.endInput,
  });
  for (const indicator of ["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_SHOW_POSITION", "AVG_CLICK_POSITION"]) {
    queryParams.append("query_indicator", indicator);
  }

  try {
    const headers = { Authorization: `OAuth ${token}` };
    const [summaryPayload, queryPayload] = await Promise.all([
      fetchJson(`${base}/summary`, { headers }),
      fetchJson(`${base}/search-queries/popular/?${queryParams}`, { headers }),
    ]);
    const window = parseWebmasterWindow(queryPayload);
    return {
      data: { summary: parseWebmasterSummary(summaryPayload), queries: parseWebmasterQueries(queryPayload), window },
      source: sourceState(
        "webmaster",
        "Яндекс Вебмастер",
        "ready",
        window ? `${window.from} — ${window.to} · до 500 запросов` : `${period.startInput} — ${period.endInput} · до 500 запросов`,
      ),
    };
  } catch (error) {
    return {
      data: { summary: EMPTY_SUMMARY, queries: [], window: null },
      source: sourceState("webmaster", "Яндекс Вебмастер", "error", describeSourceFailure(error)),
    };
  }
}

async function getMetrika(period: AdminPeriod): Promise<ExternalResult<{ totals: MetrikaTotals; searchEngines: TrafficSourceMetric[] }>> {
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!token) {
    return {
      data: { totals: EMPTY_METRIKA, searchEngines: [] },
      source: sourceState("metrika", "Яндекс Метрика", "missing", "Не настроен OAuth-токен"),
    };
  }
  const counterId = process.env.YANDEX_METRIKA_COUNTER_ID ?? "108502034";
  const common = { ids: counterId, date1: period.startInput, date2: period.endInput, accuracy: "full" };
  const totalsParams = new URLSearchParams({
    ...common,
    metrics: "ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:pageDepth",
  });
  const searchParams = new URLSearchParams({
    ...common,
    metrics: "ym:s:visits,ym:s:users",
    dimensions: "ym:s:lastSearchEngineRoot",
    sort: "-ym:s:visits",
    limit: "10",
  });

  try {
    const headers = { Authorization: `OAuth ${token}` };
    const [totalsPayload, searchPayload] = await Promise.all([
      fetchJson(`https://api-metrika.yandex.net/stat/v1/data?${totalsParams}`, { headers }),
      fetchJson(`https://api-metrika.yandex.net/stat/v1/data?${searchParams}`, { headers }),
    ]);
    return {
      data: { totals: parseMetrikaTotals(totalsPayload), searchEngines: parseMetrikaTrafficSources(searchPayload) },
      source: sourceState("metrika", "Яндекс Метрика", "ready", `${period.startInput} — ${period.endInput}`),
    };
  } catch (error) {
    return {
      data: { totals: EMPTY_METRIKA, searchEngines: [] },
      source: sourceState("metrika", "Яндекс Метрика", "error", describeSourceFailure(error)),
    };
  }
}

async function requestWordstatWatchlist(): Promise<WordstatMetric[]> {
  const apiKey = process.env.YANDEX_WORDSTAT_API_KEY;
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID;
  if (!apiKey || !folderId) return [];

  const results: WordstatMetric[] = [];
  // The v2 API accepts one phrase per call. Two-at-a-time keeps the dashboard
  // responsive without turning a page view into an API burst.
  for (let index = 0; index < SEARCH_WATCHLIST.length; index += 2) {
    const batch = SEARCH_WATCHLIST.slice(index, index + 2);
    const values = await Promise.all(batch.map(async (phrase) => {
      try {
        const payload = await fetchJson("https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests", {
          method: "POST",
          headers: { Authorization: `Api-Key ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ phrase, numPhrases: 1, regions: ["225"], folderId }),
        });
        return parseWordstatDemand(phrase, payload);
      } catch {
        return { phrase, monthlyDemand: null };
      }
    }));
    results.push(...values);
  }
  return results;
}

const getCachedWordstatWatchlist = unstable_cache(
  requestWordstatWatchlist,
  ["b578-wordstat-watchlist-v2"],
  { revalidate: 86_400, tags: ["marketing-wordstat"] },
);

async function getWordstat(): Promise<ExternalResult<WordstatMetric[]>> {
  if (!process.env.YANDEX_WORDSTAT_API_KEY || !process.env.YANDEX_CLOUD_FOLDER_ID) {
    return {
      data: SEARCH_WATCHLIST.map((phrase) => ({ phrase, monthlyDemand: null })),
      source: sourceState("wordstat", "Яндекс Wordstat", "missing", "Не настроены API-ключ и folder ID"),
    };
  }
  try {
    const data = await getCachedWordstatWatchlist();
    const hasData = data.some((item) => item.monthlyDemand !== null);
    return {
      data,
      source: sourceState("wordstat", "Яндекс Wordstat", hasData ? "ready" : "error", hasData ? "Россия · broad match · кэш 24 часа" : "Ни одна фраза не вернула частотность"),
    };
  } catch (error) {
    return {
      data: SEARCH_WATCHLIST.map((phrase) => ({ phrase, monthlyDemand: null })),
      source: sourceState("wordstat", "Яндекс Wordstat", "error", describeSourceFailure(error)),
    };
  }
}

async function getInternal(period: AdminPeriod) {
  const [events, channelRows, conversions, organicConversions] = await Promise.all([
    db.analyticsEvent.groupBy({
      by: ["event"],
      where: {
        event: { in: ["dialogue_created", "primary_answer_viewed"] },
        createdAt: { gte: period.start, lte: period.end },
      },
      _count: { _all: true },
    }),
    db.channelAttribution.groupBy({
      by: ["source", "channel"],
      where: { lastTouchAt: { gte: period.start, lte: period.end } },
      _count: { _all: true },
    }),
    db.channelAttribution.count({ where: { conversionAt: { gte: period.start, lte: period.end } } }),
    db.channelAttribution.count({
      where: {
        conversionAt: { gte: period.start, lte: period.end },
        channel: { in: ["organic", "search"] },
      },
    }),
  ]);
  const eventCount = new Map(events.map((row) => [row.event, row._count._all]));
  const dialogueStarts = eventCount.get("dialogue_created") ?? 0;
  const primaryAnswers = eventCount.get("primary_answer_viewed") ?? 0;
  return {
    dialogueStarts,
    primaryAnswers,
    answerRate: dialogueStarts > 0 ? primaryAnswers / dialogueStarts * 100 : 0,
    conversions,
    organicConversions,
    channels: channelRows
      .map((row) => ({ label: `${row.source} · ${row.channel}`, value: row._count._all }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
  };
}

export async function getSearchMarketingData(period: AdminPeriod) {
  const [webmaster, metrika, wordstat, internalResult] = await Promise.allSettled([
    getWebmaster(period),
    getMetrika(period),
    getWordstat(),
    getInternal(period),
  ]);
  const internal = internalResult.status === "fulfilled"
    ? internalResult.value
    : { dialogueStarts: 0, primaryAnswers: 0, answerRate: 0, conversions: 0, organicConversions: 0, channels: [] };
  const webmasterValue = webmaster.status === "fulfilled"
    ? webmaster.value
    : { data: { summary: EMPTY_SUMMARY, queries: [], window: null }, source: sourceState("webmaster", "Яндекс Вебмастер", "error", describeSourceFailure(webmaster.reason)) };
  const metrikaValue = metrika.status === "fulfilled"
    ? metrika.value
    : { data: { totals: EMPTY_METRIKA, searchEngines: [] }, source: sourceState("metrika", "Яндекс Метрика", "error", describeSourceFailure(metrika.reason)) };
  const wordstatValue = wordstat.status === "fulfilled"
    ? wordstat.value
    : { data: SEARCH_WATCHLIST.map((phrase) => ({ phrase, monthlyDemand: null })), source: sourceState("wordstat", "Яндекс Wordstat", "error", describeSourceFailure(wordstat.reason)) };
  const queryTotals = webmasterValue.data.queries.reduce(
    (totals, row) => ({ impressions: totals.impressions + row.impressions, clicks: totals.clicks + row.clicks }),
    { impressions: 0, clicks: 0 },
  );
  const demandByPhrase = new Map(wordstatValue.data.map((item) => [item.phrase.toLocaleLowerCase("ru-RU"), item.monthlyDemand]));
  const observedByPhrase = new Map(webmasterValue.data.queries.map((item) => [item.query.toLocaleLowerCase("ru-RU"), item]));
  // B651: раньше ядро сшивалось с наблюдаемыми запросами точным равенством
  // строк. Ядро — головные фразы («таро»), Вебмастер отдаёт живые запросы
  // целиком («расклад таро онлайн бесплатно»), поэтому совпадения не было бы
  // никогда — даже когда позиция реально появится. Прочерк напротив ВЧ-фразы
  // означал «мы не умеем посмотреть», а читался как «позиции нет».
  const keywordCore = STRATEGIC_KEYWORDS.map((keyword) => {
    const liveDemand = demandByPhrase.get(keyword.phrase.toLocaleLowerCase("ru-RU"));
    const exact = observedByPhrase.get(keyword.phrase.toLocaleLowerCase("ru-RU"));
    const family = matchQueryFamily(keyword.phrase, webmasterValue.data.queries);
    const positioned = family.filter((item) => item.averagePosition !== null);
    return {
      ...keyword,
      monthlyDemand: liveDemand ?? keyword.verifiedDemand ?? null,
      demandSource: liveDemand !== undefined && liveDemand !== null ? "live" as const : keyword.verifiedDemand ? "baseline" as const : "unknown" as const,
      // Лучшая позиция по семье запросов, содержащих фразу. Прочерк остаётся
      // только там, где показов нет вовсе — то есть означает ровно то, что
      // написано.
      position: positioned.length > 0 ? Math.min(...positioned.map((item) => item.averagePosition ?? Infinity)) : null,
      exactPosition: exact?.averagePosition ?? null,
      impressions: family.reduce((sum, item) => sum + item.impressions, 0),
      clicks: family.reduce((sum, item) => sum + item.clicks, 0),
      matchedQueries: family.length,
    };
  });
  const knownPublicPages = publicSeoRoutes.length + approvedLibraryEntries().length;
  const indexCoverage = knownPublicPages > 0 ? webmasterValue.data.summary.searchablePages / knownPublicPages * 100 : 0;
  const actions = [
    ...(indexCoverage < 80 ? [{ tone: "warn" as const, title: "Индексация отстаёт от опубликованного корпуса", note: `${webmasterValue.data.summary.searchablePages} из ${knownPublicPages} известных публичных страниц находятся в поиске Яндекса.` }] : []),
    ...(webmasterValue.data.queries.length === 0 ? [{ tone: "warn" as const, title: "Нет наблюдаемых поисковых запросов", note: "После переобхода проверьте первые показы и закрепите страницы за запросами без каннибализации." }] : []),
    ...keywordCore.filter((item) => item.priority === "P1" && item.position === null).slice(0, 5).map((item) => ({
      tone: "neutral" as const,
      title: `Нет позиции: ${item.phrase}`,
      note: `Целевая страница ${item.landing}`,
    })),
  ];

  return {
    webmaster: webmasterValue.data,
    metrika: metrikaValue.data,
    wordstat: wordstatValue.data,
    keywordCore,
    indexation: { knownPublicPages, coverage: indexCoverage },
    actions,
    internal,
    totals: {
      ...queryTotals,
      ctr: queryTotals.impressions > 0 ? queryTotals.clicks / queryTotals.impressions * 100 : 0,
      averagePosition: weightedAveragePosition(webmasterValue.data.queries),
      organicVisits: metrikaValue.data.searchEngines.reduce((sum, row) => sum + row.visits, 0),
    },
    sources: [
      webmasterValue.source,
      metrikaValue.source,
      wordstatValue.source,
      sourceState("internal", "ETerapy analytics", internalResult.status === "fulfilled" ? "ready" : "error", "Только агрегаты, без идентификаторов"),
    ],
  };
}

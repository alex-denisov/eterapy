import { unstable_cache } from "next/cache";
import db from "@/lib/db";
import type { AdminPeriod } from "@/app/admin/admin-analytics-data";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import { publicSeoRoutes } from "@/lib/seo";
import {
  parseMetrikaTotals,
  parseMetrikaTrafficSources,
  parseWebmasterQueries,
  parseWebmasterSummary,
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
  intent: "информационный" | "коммерческий" | "смешанный";
  verifiedDemand?: number;
};

// B578: one owned semantic core. The verifiedDemand values are retained only
// where the 2026-07-22 Wordstat check is documented; all other demand cells are
// populated by the live API or remain explicitly unknown.
export const STRATEGIC_KEYWORDS: readonly StrategicKeyword[] = [
  { phrase: "психолог онлайн", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P1", intent: "коммерческий", verifiedDemand: 61_264 },
  { phrase: "ии психолог", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P1", intent: "коммерческий", verifiedDemand: 12_312 },
  { phrase: "ии психолог онлайн", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P1", intent: "коммерческий" },
  { phrase: "вопрос психологу", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P2", intent: "смешанный" },
  { phrase: "разбор переписки", cluster: "Отношения", landing: "/products/chat-analysis", priority: "P1", intent: "коммерческий" },
  { phrase: "почему он перестал писать", cluster: "Отношения", landing: "/library/on-perestayal-pisat-i-ya-ne-znayu-pochemu", priority: "P1", intent: "информационный" },
  { phrase: "признаки измены", cluster: "Отношения", landing: "/library/revnuyu-bez-povoda-i-ustala", priority: "P2", intent: "информационный" },
  { phrase: "таро онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 299_945 },
  { phrase: "расклад таро онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий" },
  { phrase: "какой расклад таро выбрать", cluster: "Таро", landing: "/library/kakoy-rasklad-taro-vybrat-dlya-slozhnogo-resheniya", priority: "P2", intent: "информационный" },
  { phrase: "арканы рождения", cluster: "Таро", landing: "/products/tarot-numerology", priority: "P2", intent: "коммерческий" },
  { phrase: "матрица судьбы", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "смешанный" },
  { phrase: "матрица судьбы рассчитать", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "коммерческий", verifiedDemand: 180_466 },
  { phrase: "матрица судьбы расшифровка", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "смешанный" },
  { phrase: "натальная карта онлайн", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий" },
  { phrase: "натальная карта рассчитать", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий" },
  { phrase: "совместимость по дате рождения", cluster: "Астрология", landing: "/products/synastry", priority: "P1", intent: "коммерческий" },
  { phrase: "синастрия", cluster: "Астрология", landing: "/products/synastry", priority: "P1", intent: "смешанный" },
  { phrase: "хорарная астрология", cluster: "Астрология", landing: "/products/horary", priority: "P2", intent: "смешанный" },
  { phrase: "дизайн человека рассчитать", cluster: "Самопознание", landing: "/products/human-design", priority: "P1", intent: "коммерческий" },
  { phrase: "значение фамилии", cluster: "Имя и род", landing: "/products/surname-story", priority: "P2", intent: "смешанный" },
  { phrase: "кармический код фамилии", cluster: "Имя и род", landing: "/products/surname-story", priority: "P2", intent: "коммерческий" },
  { phrase: "сонник", cluster: "Сны", landing: "/library?direction=symbolic&topic=Сны+и+символы", priority: "P1", intent: "информационный" },
  { phrase: "к чему снится что выпадают зубы", cluster: "Сны", landing: "/library/snitsya-chto-vypadayut-zuby-pered-vazhnymi-sobytiyami", priority: "P1", intent: "информационный" },
] as const;

// Live Wordstat calls are deliberately capped to the P1 head terms. The full
// core is still position-monitored through Webmaster without turning every
// dashboard view into an API burst.
export const SEARCH_WATCHLIST = STRATEGIC_KEYWORDS
  .filter((keyword) => keyword.priority === "P1")
  .slice(0, 12)
  .map((keyword) => keyword.phrase);

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

async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function getWebmaster(): Promise<ExternalResult<{ summary: WebmasterSummary; queries: SearchQueryMetric[] }>> {
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!token) {
    return {
      data: { summary: EMPTY_SUMMARY, queries: [] },
      source: sourceState("webmaster", "Яндекс Вебмастер", "missing", "Не настроен OAuth-токен"),
    };
  }

  const userId = process.env.YANDEX_WEBMASTER_USER_ID ?? "253574184";
  const hostId = process.env.YANDEX_WEBMASTER_HOST_ID ?? "https:eterapy.com:443";
  const host = encodeURIComponent(hostId);
  const base = `https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(userId)}/hosts/${host}`;
  const queryParams = new URLSearchParams({ order_by: "TOTAL_SHOWS", limit: "500", offset: "0" });
  for (const indicator of ["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_SHOW_POSITION", "AVG_CLICK_POSITION"]) {
    queryParams.append("query_indicator", indicator);
  }

  try {
    const headers = { Authorization: `OAuth ${token}` };
    const [summaryPayload, queryPayload] = await Promise.all([
      fetchJson(`${base}/summary`, { headers }),
      fetchJson(`${base}/search-queries/popular/?${queryParams}`, { headers }),
    ]);
    return {
      data: { summary: parseWebmasterSummary(summaryPayload), queries: parseWebmasterQueries(queryPayload) },
      source: sourceState("webmaster", "Яндекс Вебмастер", "ready", "До 500 реально наблюдаемых запросов"),
    };
  } catch {
    return {
      data: { summary: EMPTY_SUMMARY, queries: [] },
      source: sourceState("webmaster", "Яндекс Вебмастер", "error", "Источник временно не отвечает"),
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
  } catch {
    return {
      data: { totals: EMPTY_METRIKA, searchEngines: [] },
      source: sourceState("metrika", "Яндекс Метрика", "error", "Источник временно не отвечает"),
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
      source: sourceState("wordstat", "Яндекс Wordstat", hasData ? "ready" : "error", hasData ? "Россия · broad match · кэш 24 часа" : "Источник временно не отвечает"),
    };
  } catch {
    return {
      data: SEARCH_WATCHLIST.map((phrase) => ({ phrase, monthlyDemand: null })),
      source: sourceState("wordstat", "Яндекс Wordstat", "error", "Источник временно не отвечает"),
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
    getWebmaster(),
    getMetrika(period),
    getWordstat(),
    getInternal(period),
  ]);
  const internal = internalResult.status === "fulfilled"
    ? internalResult.value
    : { dialogueStarts: 0, primaryAnswers: 0, answerRate: 0, conversions: 0, organicConversions: 0, channels: [] };
  const webmasterValue = webmaster.status === "fulfilled"
    ? webmaster.value
    : { data: { summary: EMPTY_SUMMARY, queries: [] }, source: sourceState("webmaster", "Яндекс Вебмастер", "error", "Источник временно не отвечает") };
  const metrikaValue = metrika.status === "fulfilled"
    ? metrika.value
    : { data: { totals: EMPTY_METRIKA, searchEngines: [] }, source: sourceState("metrika", "Яндекс Метрика", "error", "Источник временно не отвечает") };
  const wordstatValue = wordstat.status === "fulfilled"
    ? wordstat.value
    : { data: SEARCH_WATCHLIST.map((phrase) => ({ phrase, monthlyDemand: null })), source: sourceState("wordstat", "Яндекс Wordstat", "error", "Источник временно не отвечает") };
  const queryTotals = webmasterValue.data.queries.reduce(
    (totals, row) => ({ impressions: totals.impressions + row.impressions, clicks: totals.clicks + row.clicks }),
    { impressions: 0, clicks: 0 },
  );
  const demandByPhrase = new Map(wordstatValue.data.map((item) => [item.phrase.toLocaleLowerCase("ru-RU"), item.monthlyDemand]));
  const observedByPhrase = new Map(webmasterValue.data.queries.map((item) => [item.query.toLocaleLowerCase("ru-RU"), item]));
  const keywordCore = STRATEGIC_KEYWORDS.map((keyword) => {
    const liveDemand = demandByPhrase.get(keyword.phrase.toLocaleLowerCase("ru-RU"));
    const observed = observedByPhrase.get(keyword.phrase.toLocaleLowerCase("ru-RU"));
    return {
      ...keyword,
      monthlyDemand: liveDemand ?? keyword.verifiedDemand ?? null,
      demandSource: liveDemand !== undefined && liveDemand !== null ? "live" as const : keyword.verifiedDemand ? "baseline" as const : "unknown" as const,
      position: observed?.averagePosition ?? null,
      impressions: observed?.impressions ?? 0,
      clicks: observed?.clicks ?? 0,
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

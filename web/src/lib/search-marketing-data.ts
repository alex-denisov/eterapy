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

// B578 → B607: одно семантическое ядро, и в нём НЕТ ни одной неизмеренной фразы.
//
// Владелец 2026-07-27: «я хочу чтобы там были только запросы, которые ты
// проанализировал через yandex-mcp и у которых реальный спрос есть … нужно
// составить семантическое ядро и вывести в эту таблицу топ-50 запросов нашего
// направления».
//
// Все 50 строк ниже замерены живым Wordstat 27.07.2026 и несут `verifiedDemand`.
// Прочерков в графе спроса больше не бывает по построению: фраза без замера в
// ядро не попадает.
//
// Что показал замер и чего не было видно раньше:
//
//  • Направление на порядок больше со стороны эзотерики, чем со стороны
//    психологии. «таро» — 4 388 768, «к чему снится» — 4 012 656, «матрица
//    судьбы» — 1 042 657. Против «психолог онлайн» 61 264 и «как пережить
//    расставание» 14 199. Разрыв в 60–70 раз, и он определяет, какие страницы
//    вообще имеет смысл растить первыми.
//  • «кармический код фамилии» — 0 показов. Ровно ноль: так не ищет никто.
//    Реальная форма — «происхождение фамилии» (388 408), и это в тысячу раз
//    больше, чем наше название услуги.
//  • «хорарная астрология» — 5 492, и в топе «фроули», «учебник», «скачать»,
//    «обучение»: это студенты астрологии, а не клиенты. Кластер переведён на
//    «гадание да нет» (234 744) и «таро да нет» (114 021) — тот же продукт,
//    язык клиента.
//  • «значение фамилии» (90 164) на первый взгляд подходит, но в топе
//    «японские фамилии со значением» и «национальность» — это поиск про
//    этимологию чужих фамилий. Оставлено как P2 с этой оговоркой.
//
// Снятые фразы прошлого ядра и почему: «разбор переписки» (323, школьный
// морфемный разбор), «какой расклад таро выбрать» (64), «кармический код
// фамилии» (0), «хорарная астрология» (аудитория — студенты),
// «почему он перестал писать» (449, ниже порога значимости).
//
// Не взяты в ядро при живом спросе — потому что продукта под них у нас НЕТ, и
// приводить по ним людям некуда. Это не мусор, это очередь на продуктовые
// решения, и в таблице ей не место, пока страницы не существует:
//   ангельская нумерология — 228 363 (числа на часах: 11:11, 22:22)
//   арканы таро            — 106 243 (значения отдельных карт)
//   квадрат пифагора       —  71 337 (психоматрица, отдельный расчёт)
//   таро карта дня         —  33 470 (ежедневный формат)
//   гороскоп совместимости —  33 289 (по знакам, а не по картам рождения)
// Именно так в прошлый раз в ядро попало «разбор переписки»: спрос был,
// продукта под ЭТОТ спрос не было.
export const STRATEGIC_KEYWORDS: readonly StrategicKeyword[] = [
  // ── Таро и гадания: самый большой кластер направления ───────────────────
  { phrase: "таро", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "смешанный", verifiedDemand: 4_388_768 },
  { phrase: "гадание", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "смешанный", verifiedDemand: 2_120_882 },
  { phrase: "карты таро", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "смешанный", verifiedDemand: 852_887 },
  { phrase: "гадание онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 763_738 },
  { phrase: "расклад таро", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "смешанный", verifiedDemand: 565_766 },
  { phrase: "таро онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 315_064 },
  { phrase: "гадание таро", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "смешанный", verifiedDemand: 275_481 },
  // Заменяет «хорарную астрологию»: тот же продукт, язык клиента.
  { phrase: "гадание да нет", cluster: "Прямой ответ", landing: "/products/horary", priority: "P1", intent: "коммерческий", verifiedDemand: 234_744 },
  { phrase: "таро да нет", cluster: "Прямой ответ", landing: "/products/horary", priority: "P1", intent: "коммерческий", verifiedDemand: 114_021 },
  { phrase: "гадание таро онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 93_752 },
  { phrase: "гадание на мужчину", cluster: "Отношения", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 74_261 },
  { phrase: "гадание на будущее", cluster: "Прямой ответ", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 70_849 },
  { phrase: "расклад таро онлайн", cluster: "Таро", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 59_720 },
  { phrase: "гадание да нет с точным ответом", cluster: "Прямой ответ", landing: "/products/horary", priority: "P1", intent: "коммерческий", verifiedDemand: 52_402 },
  { phrase: "таро на отношения", cluster: "Отношения", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 51_885 },
  { phrase: "аркан по дате рождения", cluster: "Таро", landing: "/products/tarot-numerology", priority: "P1", intent: "коммерческий", verifiedDemand: 36_246 },
  { phrase: "гадание на любовь", cluster: "Отношения", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 32_682 },
  { phrase: "расклад таро на отношения", cluster: "Отношения", landing: "/products/tarot", priority: "P1", intent: "коммерческий", verifiedDemand: 20_612 },
  { phrase: "таро на бывшего", cluster: "Отношения", landing: "/products/tarot", priority: "P2", intent: "коммерческий", verifiedDemand: 19_027 },

  // ── Сны: второй по величине кластер, и он весь наш по формату ───────────
  { phrase: "к чему снится", cluster: "Сны", landing: "/library?topic=%D0%A1%D0%BD%D1%8B+%D0%B8+%D1%81%D0%B8%D0%BC%D0%B2%D0%BE%D0%BB%D1%8B", priority: "P1", intent: "информационный", verifiedDemand: 4_012_656 },
  { phrase: "сонник", cluster: "Сны", landing: "/library?topic=%D0%A1%D0%BD%D1%8B+%D0%B8+%D1%81%D0%B8%D0%BC%D0%B2%D0%BE%D0%BB%D1%8B", priority: "P1", intent: "информационный", verifiedDemand: 1_532_720 },
  { phrase: "к чему снится выпавший зуб", cluster: "Сны", landing: "/library/snitsya-chto-vypadayut-zuby-pered-vazhnymi-sobytiyami", priority: "P1", intent: "информационный", verifiedDemand: 35_118 },

  // ── Матрица судьбы и нумерология ────────────────────────────────────────
  { phrase: "матрица судьбы", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "смешанный", verifiedDemand: 1_042_657 },
  { phrase: "нумерология", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "информационный", verifiedDemand: 582_789 },
  { phrase: "матрица судьбы рассчитать", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "коммерческий", verifiedDemand: 195_730 },
  { phrase: "матрица судьбы бесплатно", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "коммерческий", verifiedDemand: 75_717 },
  { phrase: "матрица судьбы совместимость", cluster: "Матрица судьбы", landing: "/products/synastry", priority: "P1", intent: "коммерческий", verifiedDemand: 65_839 },
  { phrase: "нумерология по дате рождения", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "коммерческий", verifiedDemand: 41_987 },
  { phrase: "матрица судьбы расшифровка", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P1", intent: "смешанный", verifiedDemand: 28_019 },
  { phrase: "число судьбы", cluster: "Матрица судьбы", landing: "/products/numerology", priority: "P2", intent: "информационный", verifiedDemand: 24_789 },

  // ── Астрология ──────────────────────────────────────────────────────────
  { phrase: "натальная карта", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "смешанный", verifiedDemand: 888_954 },
  { phrase: "натальная карта онлайн", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий", verifiedDemand: 186_482 },
  { phrase: "совместимость по дате рождения", cluster: "Астрология", landing: "/products/synastry", priority: "P1", intent: "коммерческий", verifiedDemand: 172_729 },
  { phrase: "натальная карта бесплатно", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий", verifiedDemand: 75_270 },
  { phrase: "натальная карта рассчитать", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий", verifiedDemand: 74_533 },
  { phrase: "синастрия", cluster: "Астрология", landing: "/products/synastry", priority: "P1", intent: "смешанный", verifiedDemand: 65_765 },
  { phrase: "натальная карта с расшифровкой", cluster: "Астрология", landing: "/products/natal-chart", priority: "P1", intent: "коммерческий", verifiedDemand: 25_137 },

  // ── Имя и род. «Кармический код фамилии» = 0 показов, снят ──────────────
  { phrase: "происхождение фамилии", cluster: "Имя и род", landing: "/products/surname-story", priority: "P1", intent: "информационный", verifiedDemand: 388_408 },
  // ⚠ В топе «японские фамилии со значением» и «национальность» — это про
  //   этимологию чужих фамилий, а не про свою историю. Отсюда P2.
  { phrase: "значение фамилии", cluster: "Имя и род", landing: "/products/surname-story", priority: "P2", intent: "информационный", verifiedDemand: 90_164 },

  // ── Дизайн человека ─────────────────────────────────────────────────────
  { phrase: "дизайн человека", cluster: "Самопознание", landing: "/products/human-design", priority: "P1", intent: "информационный", verifiedDemand: 51_898 },
  { phrase: "дизайн человека рассчитать", cluster: "Самопознание", landing: "/products/human-design", priority: "P1", intent: "коммерческий", verifiedDemand: 10_732 },

  // ── Психология и поддержка: кластер на два порядка меньше эзотерики ─────
  { phrase: "психолог онлайн", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P1", intent: "коммерческий", verifiedDemand: 61_264 },
  { phrase: "вопрос психологу", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P2", intent: "смешанный", verifiedDemand: 30_365 },
  { phrase: "психолог онлайн бесплатно", cluster: "Ясность и поддержка", landing: "/checkin", priority: "P1", intent: "коммерческий", verifiedDemand: 20_321 },
  { phrase: "как пережить расставание", cluster: "Отношения", landing: "/library/on-perestayal-pisat-i-ya-ne-znayu-pochemu", priority: "P1", intent: "информационный", verifiedDemand: 14_199 },
  { phrase: "ии психолог", cluster: "Ясность и поддержка", landing: "/ai-psychologist", priority: "P1", intent: "коммерческий", verifiedDemand: 12_312 },
  { phrase: "как вернуть отношения", cluster: "Отношения", landing: "/products/reframe", priority: "P2", intent: "информационный", verifiedDemand: 9_643 },
  { phrase: "как перестать думать о человеке", cluster: "Отношения", landing: "/products/reframe", priority: "P2", intent: "информационный", verifiedDemand: 6_543 },
  { phrase: "признаки измены", cluster: "Отношения", landing: "/products/chat-analysis", priority: "P2", intent: "информационный", verifiedDemand: 3_271 },
  { phrase: "как понять что муж изменяет", cluster: "Отношения", landing: "/products/chat-analysis", priority: "P1", intent: "информационный", verifiedDemand: 1_597 },
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

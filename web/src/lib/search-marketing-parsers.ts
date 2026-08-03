export type WebmasterSummary = {
  searchablePages: number;
  downloadedPages: number;
  siteQualityIndex: number;
  fatalProblems: number;
};

export type SearchQueryMetric = {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  averagePosition: number | null;
  opportunity: "Сниппет" | "Быстрый рост" | "Усилить страницу" | "Удерживать";
};

export type MetrikaTotals = {
  visits: number;
  users: number;
  bounceRate: number;
  pageDepth: number;
};

export type TrafficSourceMetric = {
  label: string;
  visits: number;
  users: number;
};

export type WordstatMetric = {
  phrase: string;
  monthlyDemand: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  if (value.length === 1 && Array.isArray(value[0])) return value[0];
  return value;
}

export function classifySearchOpportunity(input: {
  impressions: number;
  ctr: number;
  averagePosition: number | null;
}): SearchQueryMetric["opportunity"] {
  const { impressions, ctr, averagePosition } = input;
  if (averagePosition === null) return "Усилить страницу";
  if (averagePosition <= 3 && impressions >= 20 && ctr < 8) return "Сниппет";
  if (averagePosition > 3 && averagePosition <= 20 && impressions >= 10) return "Быстрый рост";
  if (averagePosition > 20) return "Усилить страницу";
  return "Удерживать";
}

export function parseWebmasterSummary(payload: unknown): WebmasterSummary {
  const data = record(payload) ?? {};
  const siteProblems = record(data.site_problems) ?? {};
  return {
    searchablePages: numeric(data.searchable_pages_count),
    downloadedPages: numeric(data.downloaded_pages_count),
    siteQualityIndex: numeric(data.sqi),
    fatalProblems: numeric(siteProblems.FATAL),
  };
}

/**
 * B649: Вебмастер отвечает своим окном, а не запрошенным — `date_to` он
 * подрезает на задержку выгрузки. Панель обязана показывать то окно, за которое
 * действительно посчитаны числа.
 */
export function parseWebmasterWindow(payload: unknown): { from: string; to: string } | null {
  const data = record(payload) ?? {};
  const from = typeof data.date_from === "string" ? data.date_from.slice(0, 10) : "";
  const to = typeof data.date_to === "string" ? data.date_to.slice(0, 10) : "";
  return from && to ? { from, to } : null;
}

export function parseWebmasterQueries(payload: unknown): SearchQueryMetric[] {
  const data = record(payload) ?? {};
  const queries = Array.isArray(data.queries) ? data.queries : [];
  return queries.flatMap((value) => {
    const item = record(value);
    const indicators = record(item?.indicators);
    const query = typeof item?.query_text === "string" ? item.query_text.trim() : "";
    if (!query || !indicators) return [];
    const impressions = numeric(indicators.TOTAL_SHOWS);
    const clicks = numeric(indicators.TOTAL_CLICKS);
    const rawPosition = numeric(indicators.AVG_SHOW_POSITION);
    const averagePosition = rawPosition > 0 ? rawPosition : null;
    const ctr = impressions > 0 ? clicks / impressions * 100 : 0;
    return [{
      query,
      impressions,
      clicks,
      ctr,
      averagePosition,
      opportunity: classifySearchOpportunity({ impressions, ctr, averagePosition }),
    }];
  });
}

export function parseMetrikaTotals(payload: unknown): MetrikaTotals {
  const data = record(payload) ?? {};
  const totals = firstArray(data.totals);
  return {
    visits: numeric(totals[0]),
    users: numeric(totals[1]),
    bounceRate: numeric(totals[2]),
    pageDepth: numeric(totals[3]),
  };
}

export function parseMetrikaTrafficSources(payload: unknown): TrafficSourceMetric[] {
  const data = record(payload) ?? {};
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.flatMap((value) => {
    const row = record(value);
    const dimensions = Array.isArray(row?.dimensions) ? row.dimensions : [];
    const firstDimension = record(dimensions[0]);
    const label = typeof firstDimension?.name === "string" ? firstDimension.name.trim() : "";
    const metrics = firstArray(row?.metrics);
    if (!label) return [];
    return [{ label, visits: numeric(metrics[0]), users: numeric(metrics[1]) }];
  });
}

export function parseWordstatDemand(phrase: string, payload: unknown): WordstatMetric {
  const data = record(payload) ?? {};
  const rawResults = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data.topRequests)
      ? data.topRequests
      : [];
  const first = record(rawResults[0]);
  const count = first ? numeric(first.count) : numeric(data.totalCount);
  return { phrase, monthlyDemand: count > 0 ? count : null };
}

/**
 * B651 — семья запросов вокруг головной фразы.
 *
 * Границы слов регулярками здесь не берутся: `\b` в JS не видит кириллицу
 * вовсе, и паттерн молча не совпадает никогда. Поэтому обе строки режутся на
 * токены по не-буквам, а словоформы сводятся отбрасыванием одного окончания —
 * «матрица» и «матрицу» дают один стем, а «сон» и «сонник» разными и остаются.
 */
const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase("ru-RU").split(TOKEN_SEPARATOR).filter(Boolean);
}

function stem(token: string) {
  return token.length >= 5 ? token.slice(0, -1) : token;
}

function tokenMatches(queryToken: string, phraseToken: string) {
  const left = stem(queryToken);
  const right = stem(phraseToken);
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  // Короткий токен приставкой не считаем: иначе «дом» подтянет «домашний»,
  // а ядро наберёт чужие показы и соврёт в другую сторону.
  if (shorter.length < 4) return false;
  return longer.startsWith(shorter) && longer.length - shorter.length <= 2;
}

export function matchQueryFamily(phrase: string, queries: SearchQueryMetric[]): SearchQueryMetric[] {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0) return [];
  return queries.filter((item) => {
    const queryTokens = tokenize(item.query);
    return phraseTokens.every((token) => queryTokens.some((candidate) => tokenMatches(candidate, token)));
  });
}

export function weightedAveragePosition(queries: SearchQueryMetric[]) {
  const positioned = queries.filter((item) => item.averagePosition !== null && item.impressions > 0);
  const impressions = positioned.reduce((sum, item) => sum + item.impressions, 0);
  if (impressions === 0) return null;
  return positioned.reduce((sum, item) => sum + (item.averagePosition ?? 0) * item.impressions, 0) / impressions;
}

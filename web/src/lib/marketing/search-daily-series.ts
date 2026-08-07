/**
 * B697 — посуточные ряды поисковых показателей.
 *
 * ЧТО БЫЛО НЕ ТАК. Суточный срез (B626) спрашивал у источников окно в 28 дней и
 * клал итог окна как значение дня. Соседние столбцы перекрывались на 27 дней из
 * 28, поэтому график читался как нарастающий итог — ровно то, что заметил
 * владелец 2026-08-07: «суммируется на графике, а должна выглядеть как
 * показатель на таймлайне».
 *
 * Дефект был в том, что величины двух РАЗНЫХ природ писались одинаково:
 *
 *   поток   — показы, клики, визиты: сколько случилось ЗА ЭТОТ ДЕНЬ;
 *   уровень — страниц в поиске, запросов, позиция: сколько есть НА ЭТОТ ДЕНЬ.
 *
 * Уровень окном мерить правильно. Поток — нет, и здесь он берётся посуточно у
 * самого источника: и Вебмастер, и Метрика такие ряды отдают штатно.
 *
 * Оба источника уточняют данные задним числом несколько суток, поэтому ряд
 * берётся за всё окно, а не только за сегодня: история сама себя чинит, а не
 * застывает с первым ответом.
 */

export interface SearchDailyFlow {
  impressions: number;
  clicks: number;
  organicVisits: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Дата ряда Вебмастера приходит строкой `2026-07-24T00:00:00.000+03:00`, то есть
 * уже в московских сутках. Разбирать её через `new Date()` значило бы сдвинуть
 * день на часовой пояс раннера — берём префикс строкой.
 */
export function seriesDayKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(DAY_PREFIX);
  return match ? match[1] : null;
}

function readIndicator(indicators: Record<string, unknown>, name: string): Map<string, number> {
  const rows = Array.isArray(indicators[name]) ? (indicators[name] as unknown[]) : [];
  const result = new Map<string, number>();
  for (const value of rows) {
    const row = record(value);
    const day = seriesDayKey(row?.date);
    if (!day) continue;
    result.set(day, numeric(row?.value));
  }
  return result;
}

/**
 * `GET /v4/user/{id}/hosts/{host}/search-queries/all/history/`
 * → `{ indicators: { TOTAL_SHOWS: [{date, value}], TOTAL_CLICKS: [...] } }`.
 */
export function parseWebmasterDailySeries(payload: unknown): Map<string, { impressions: number; clicks: number }> {
  const indicators = record(record(payload)?.indicators) ?? {};
  const shows = readIndicator(indicators, "TOTAL_SHOWS");
  const clicks = readIndicator(indicators, "TOTAL_CLICKS");
  const days = new Set([...shows.keys(), ...clicks.keys()]);
  const result = new Map<string, { impressions: number; clicks: number }>();
  for (const day of days) {
    result.set(day, {
      impressions: Math.round(shows.get(day) ?? 0),
      clicks: Math.round(clicks.get(day) ?? 0),
    });
  }
  return result;
}

/**
 * `GET /stat/v1/data/bytime?group=day&dimensions=ym:s:lastSearchEngineRoot`
 * → `{ time_intervals: [["2026-07-24","2026-07-24"], …], totals: [[v, …]] }`.
 *
 * `totals` — итог по всем строкам среза, то есть ровно визиты с поисковым
 * источником: то же определение, что у `organicVisits` на панели. Порядок
 * значений совпадает с порядком `time_intervals`, длина — тоже.
 */
export function parseMetrikaDailyVisits(payload: unknown): Map<string, number> {
  const data = record(payload) ?? {};
  const intervals = Array.isArray(data.time_intervals) ? data.time_intervals : [];
  const totals = Array.isArray(data.totals) ? data.totals : [];
  const series = Array.isArray(totals[0]) ? (totals[0] as unknown[]) : [];
  const result = new Map<string, number>();
  intervals.forEach((interval, index) => {
    const day = seriesDayKey(Array.isArray(interval) ? interval[0] : interval);
    if (!day) return;
    result.set(day, Math.round(numeric(series[index])));
  });
  return result;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json() as unknown;
}

/**
 * Посуточный ряд показов и кликов Вебмастера. Ручка `search-queries/all/history`
 * — не та же, что `search-queries/popular`: popular отдаёт ИТОГ окна по каждому
 * запросу, history — ряд по дням в целом по хосту. Именно второе нужно графику.
 */
export async function fetchWebmasterDailySeries(input: {
  from: string;
  to: string;
}): Promise<Map<string, { impressions: number; clicks: number }>> {
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!token) throw new Error("YANDEX_OAUTH_TOKEN не задан");
  const userId = process.env.YANDEX_WEBMASTER_USER_ID ?? "253574184";
  const hostId = process.env.YANDEX_WEBMASTER_HOST_ID ?? "https:eterapy.com:443";
  const params = new URLSearchParams({ date_from: input.from, date_to: input.to });
  params.append("query_indicator", "TOTAL_SHOWS");
  params.append("query_indicator", "TOTAL_CLICKS");
  const url = `https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(userId)}`
    + `/hosts/${encodeURIComponent(hostId)}/search-queries/all/history/?${params}`;
  return parseWebmasterDailySeries(await fetchJson(url, { headers: { Authorization: `OAuth ${token}` } }));
}

/** Посуточный ряд визитов из поисковиков. */
export async function fetchMetrikaDailyVisits(input: {
  from: string;
  to: string;
}): Promise<Map<string, number>> {
  const token = process.env.YANDEX_OAUTH_TOKEN;
  if (!token) throw new Error("YANDEX_OAUTH_TOKEN не задан");
  const counterId = process.env.YANDEX_METRIKA_COUNTER_ID ?? "108502034";
  const params = new URLSearchParams({
    ids: counterId,
    metrics: "ym:s:visits",
    dimensions: "ym:s:lastSearchEngineRoot",
    date1: input.from,
    date2: input.to,
    group: "day",
    accuracy: "full",
    limit: "100",
  });
  const url = `https://api-metrika.yandex.net/stat/v1/data/bytime?${params}`;
  return parseMetrikaDailyVisits(await fetchJson(url, { headers: { Authorization: `OAuth ${token}` } }));
}

/** Список московских суток окна, от старых к свежим, включая обе границы. */
export function moscowDayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Свести два ряда в один по дням окна. День, которого нет ни в одном ряду, в
 * результат НЕ попадает: «источник промолчал» и «за день ноль» — разные факты,
 * и подменять первый вторым значит врать в истории (то же правило, что в B626).
 */
export function mergeDailyFlow(input: {
  days: string[];
  webmaster: Map<string, { impressions: number; clicks: number }>;
  metrika: Map<string, number>;
}): Map<string, SearchDailyFlow> {
  const result = new Map<string, SearchDailyFlow>();
  for (const day of input.days) {
    const search = input.webmaster.get(day);
    const visits = input.metrika.get(day);
    if (!search && visits === undefined) continue;
    result.set(day, {
      impressions: search?.impressions ?? 0,
      clicks: search?.clicks ?? 0,
      organicVisits: visits ?? 0,
    });
  }
  return result;
}

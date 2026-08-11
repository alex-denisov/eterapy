/**
 * B702 фаза 6 — тренд как РОСТ частотности запроса.
 *
 * Спрос (фаза 1) отвечает на вопрос «сколько людей ищут это вообще», и по нему
 * планировщик уже ранжирует темы. Динамика отвечает на другой вопрос — «стало
 * ли их больше ПРЯМО СЕЙЧАС». Головная фраза с 220 000 показов и ровным
 * графиком трендом не является: она давно в ядре и давно учтена.
 *
 * ФОРМА ЗАПРОСА ПРОВЕРЕНА ЖИВЬЁМ (прод, 2026-08-11), а не взята из документации:
 * `period` принимает ровно `PERIOD_WEEKLY` (не `WEEKLY` и не `weekly`), даты —
 * RFC3339 (`2026-08-09T00:00:00Z`, голая дата отвергается), а `count` в ответе
 * приходит СТРОКОЙ. Каждое из трёх мест давало 400 или тихий ноль.
 */

import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";
import type { TrendCandidate } from "@/lib/marketing/trend-scan";

/**
 * Головные фразы кластеров — те же 13, что берёт живой wordstat.
 *
 * Берём их из ядра напрямую, а не из `search-marketing-data`: тот модуль тянет
 * базу и кэш Next, а сканер трендов работает и в отдельном процессе воркера.
 */
const WATCHLIST = SEMANTIC_CORE
  .map((cluster) => cluster.phrases[0]?.phrase)
  .filter((phrase): phrase is string => Boolean(phrase));

const DYNAMICS_URL = "https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics";

/** На сколько должна вырасти частотность, чтобы это считалось трендом. */
export const WORDSTAT_TREND_MIN_GROWTH = 0.15;
/** Сколько последних недель считаем «сейчас». */
export const WORDSTAT_TREND_RECENT_WEEKS = 3;
/** Сколько недель запрашиваем. */
export const WORDSTAT_TREND_WINDOW_WEEKS = 10;
/** Сколько фраз проверяем за заход: один вызов API на фразу. */
export const WORDSTAT_TREND_PHRASE_LIMIT = 13;
/** Сколько держим ответ, чтобы проход конвейера не превращался в очередь к API. */
export const WORDSTAT_TREND_CACHE_MS = 6 * 60 * 60 * 1_000;

/** Ряд частотности из ответа. `count` приходит строкой — молча потерять легко. */
export function parseWordstatDynamics(payload: unknown): number[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .map((row) => Number((row as { count?: unknown })?.count))
    .filter((count) => Number.isFinite(count));
}

/**
 * Рост последних недель против предыдущих.
 *
 * Сравниваются средние, а не крайние точки: одна выпавшая неделя не обязана
 * объявлять тренд. Ряд короче двух окон роста не имеет вовсе — в нём не с чем
 * сравнивать.
 */
export function growthOf(series: number[], recentWeeks = WORDSTAT_TREND_RECENT_WEEKS): number | null {
  if (series.length < recentWeeks * 2) return null;
  const recent = series.slice(-recentWeeks);
  const before = series.slice(0, -recentWeeks);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const base = mean(before);
  if (base <= 0) return null;
  return mean(recent) / base - 1;
}

/** Границы окна: `toDate` для недельного периода обязан быть воскресеньем. */
function weeklyWindow(now: Date): { fromDate: string; toDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - end.getUTCDay());
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - WORDSTAT_TREND_WINDOW_WEEKS * 7);
  return { fromDate: start.toISOString(), toDate: end.toISOString() };
}

let cache: { at: number; candidates: TrendCandidate[] } | null = null;

/**
 * Растущие фразы ядра как кандидаты-тренды.
 *
 * Один вызов API на фразу, поэтому список ограничен головными фразами кластеров
 * (те же 13, что у живого wordstat), а ответ держится в памяти процесса шесть
 * часов: проход конвейера идёт раз в несколько минут и не должен превращаться в
 * очередь к API. Отказ по одной фразе не отменяет остальные.
 */
export async function wordstatDynamicsTrends(input: {
  fetchImpl?: typeof fetch;
  phrases?: string[];
  apiKey?: string;
  folderId?: string;
  now?: Date;
  useCache?: boolean;
} = {}): Promise<TrendCandidate[]> {
  const apiKey = input.apiKey ?? process.env.YANDEX_WORDSTAT_API_KEY ?? "";
  const folderId = input.folderId ?? process.env.YANDEX_CLOUD_FOLDER_ID ?? "";
  if (!apiKey || !folderId) return [];

  const useCache = input.useCache ?? true;
  const now = input.now ?? new Date();
  if (useCache && cache && now.getTime() - cache.at < WORDSTAT_TREND_CACHE_MS) return cache.candidates;

  const phrases = (input.phrases ?? WATCHLIST).slice(0, WORDSTAT_TREND_PHRASE_LIMIT);
  const call = input.fetchImpl ?? fetch;
  const window = weeklyWindow(now);

  const answers = await Promise.allSettled(phrases.map(async (phrase) => {
    const response = await call(DYNAMICS_URL, {
      method: "POST",
      headers: { Authorization: `Api-Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        phrase,
        period: "PERIOD_WEEKLY",
        fromDate: window.fromDate,
        toDate: window.toDate,
        regions: ["225"],
        folderId,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Wordstat dynamics ${phrase}: HTTP ${response.status}`);
    return { phrase, series: parseWordstatDynamics(await response.json()) };
  }));

  const candidates: TrendCandidate[] = [];
  for (const answer of answers) {
    if (answer.status !== "fulfilled") continue;
    const growth = growthOf(answer.value.series);
    if (growth === null || growth < WORDSTAT_TREND_MIN_GROWTH) continue;
    candidates.push({
      topic: answer.value.phrase,
      rationale: `Частотность выросла на ${Math.round(growth * 100)} % за последние недели.`,
      source: "wordstatDynamics",
      keywords: answer.value.phrase.split(/\s+/).filter(Boolean),
    });
  }
  candidates.sort((left, right) => left.topic.localeCompare(right.topic));
  if (useCache) cache = { at: now.getTime(), candidates };
  return candidates;
}

/** Сбросить память процесса — только для прогонов. */
export function resetWordstatTrendCache(): void {
  cache = null;
}

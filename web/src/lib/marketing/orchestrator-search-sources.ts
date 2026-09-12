/**
 * B741 — ОРКЕСТРАТОР СМОТРИТ В ОБА ПОИСКОВИКА, А НЕ В СВОЮ БАЗУ.
 *
 * Требование владельца 2026-09-12: «оркестратор обязательно проверял Yandex
 * Webmaster и Google Search Console».
 *
 * ⚠ ЗАЧЕМ ЭТО, ЕСЛИ ЕСТЬ СУТОЧНЫЙ СРЕЗ. `marketing_daily_snapshots` пишет
 * воркер, и он же — единственный, кто туда смотрит. Если срез перестанет
 * сниматься, оркестратор увидит вчерашние числа и скажет «всё стабильно»: у
 * него нет способа отличить «не изменилось» от «перестали спрашивать». Живой
 * вызов такой возможности не оставляет — он либо отвечает, либо честно
 * объявляет себя ненастроенным.
 *
 * ⚠ ДВА ИСТОЧНИКА ОТВЕЧАЮТ НА РАЗНЫЕ ВОПРОСЫ, И ПУТАТЬ ИХ НЕЛЬЗЯ.
 * Вебмастер знает, СКОЛЬКО СТРАНИЦ В ПОИСКЕ и сколько исключено, — это про
 * индексацию. Search Console знает, СКОЛЬКО ПОКАЗОВ И КЛИКОВ, — это про
 * спрос и позиции. Ноль в первом и ноль во втором означают разные болезни:
 * первый — нас не обошли, второй — обошли, но не показывают.
 *
 * ⚠ «НЕ НАСТРОЕН» — ЭТО НЕ НОЛЬ. Источник без ключей возвращает `null`, а не
 * пустые числа: на этой же ошибке панель маркетинга уже показывала ноль
 * показов вместо «мы не спрашивали» (B649).
 */

import { log, serializeError } from "@/lib/logger";
import { APP_URL } from "@/lib/env";
import {
  fetchSearchConsole,
  searchConsoleConfig,
  type SearchConsoleTotals,
} from "@/lib/search-console";

const WEBMASTER_BASE = "https://api.webmaster.yandex.net/v4";
const DEFAULT_USER_ID = "253574184";
const DEFAULT_HOST_ID = "https:eterapy.com:443";

export interface WebmasterIndexState {
  /** Страниц в поиске. */
  searchablePages: number;
  /** Исключённых страниц — это ДРУГАЯ проблема, чем «не обошли». */
  excludedPages: number;
  /** Сколько адресов в нашей карте сайта на момент замера. */
  sitemapUrls: number;
  /** Остаток суточной квоты переобхода. */
  recrawlRemaining: number | null;
}

export interface GscState {
  totals: SearchConsoleTotals;
  /** Сколько запросов вообще показали хоть один раз за окно. */
  queryCount: number;
  /** Лучшие запросы — по ним видно, ЧЕМ нас находят. */
  topQueries: Array<{ query: string; impressions: number; position: number }>;
}

export interface SearchSourcesState {
  /** `null` — источник не настроен или не ответил. Это не ноль. */
  webmaster: WebmasterIndexState | null;
  webmasterError: string | null;
  gsc: GscState | null;
  gscError: string | null;
}

function webmasterConfig() {
  const token = process.env.YANDEX_OAUTH_TOKEN?.trim();
  if (!token) return null;
  const userId = process.env.YANDEX_WEBMASTER_USER_ID?.trim() || DEFAULT_USER_ID;
  const hostId = process.env.YANDEX_WEBMASTER_HOST_ID?.trim() || DEFAULT_HOST_ID;
  return {
    token,
    base: `${WEBMASTER_BASE}/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}`,
  };
}

async function webmasterJson(url: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `OAuth ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error_message === "string"
      ? payload.error_message
      : `HTTP ${response.status}`;
    throw new Error(`Webmaster ${message}`);
  }
  return payload ?? {};
}

function numberField(source: Record<string, unknown>, ...names: string[]): number {
  for (const name of names) {
    const value = Number(source[name]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

/** Сколько адресов в нашей карте сайта. Нужно, чтобы «в поиске N» имело знаменатель. */
async function sitemapSize(origin: string): Promise<number> {
  const response = await fetch(new URL("/sitemap.xml", origin).toString(), {
    headers: { "User-Agent": "ETerapy-Orchestrator/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`);
  const xml = await response.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).length;
}

export async function readWebmasterIndexState(): Promise<{
  state: WebmasterIndexState | null;
  error: string | null;
}> {
  const config = webmasterConfig();
  if (!config) return { state: null, error: "YANDEX_OAUTH_TOKEN не задан" };
  try {
    const origin = new URL(APP_URL).origin;
    const [summary, quota, sitemapUrls] = await Promise.all([
      webmasterJson(`${config.base}/summary`, config.token),
      webmasterJson(`${config.base}/recrawl/quota`, config.token).catch(() => ({} as Record<string, unknown>)),
      sitemapSize(origin).catch(() => 0),
    ]);
    return {
      state: {
        // Вебмастер называет их `*_count`; короткая форма молча давала ноль и
        // одновременно поднимала ложную тревогу об индексации (B650).
        searchablePages: numberField(summary, "searchable_pages_count", "searchable_pages"),
        excludedPages: numberField(summary, "excluded_pages_count", "excluded_pages"),
        sitemapUrls,
        recrawlRemaining: Number.isFinite(Number(quota.quota_remainder))
          ? Number(quota.quota_remainder)
          : null,
      },
      error: null,
    };
  } catch (error) {
    log.warn("orchestrator.webmaster_failed", { error: serializeError(error) });
    return { state: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Окно замера GSC: данные там отстают на двое-трое суток, поэтому окно недельное. */
export function gscWindow(now: Date): { startDate: string; endDate: string } {
  const end = new Date(now.getTime() - 3 * 24 * 60 * 60_000);
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function readGscState(now: Date): Promise<{ state: GscState | null; error: string | null }> {
  const config = searchConsoleConfig();
  if (!config) return { state: null, error: "GOOGLE_OAUTH_* не заданы" };
  try {
    const { startDate, endDate } = gscWindow(now);
    const result = await fetchSearchConsole({ config, startDate, endDate, queryLimit: 25 });
    return {
      state: {
        totals: result.totals,
        queryCount: result.queries.length,
        topQueries: result.queries.slice(0, 5).map((row) => ({
          query: row.query,
          impressions: row.impressions,
          position: row.averagePosition,
        })),
      },
      error: null,
    };
  } catch (error) {
    log.warn("orchestrator.gsc_failed", { error: serializeError(error) });
    return { state: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Оба источника одним заходом.
 *
 * Никогда не бросает: оркестратор обязан поставить диагноз и по тому, что
 * ответило. Молчание источника само по себе находка — и именно поэтому оно
 * возвращается текстом ошибки, а не проглатывается.
 */
export async function readSearchSources(now: Date): Promise<SearchSourcesState> {
  const [webmaster, gsc] = await Promise.all([
    readWebmasterIndexState(),
    readGscState(now),
  ]);
  return {
    webmaster: webmaster.state,
    webmasterError: webmaster.error,
    gsc: gsc.state,
    gscError: gsc.error,
  };
}

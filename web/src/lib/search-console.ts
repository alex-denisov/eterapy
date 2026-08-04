/**
 * B650 · Google Search Console — пятый источник панели маркетинга.
 *
 * ⚠ ПОЧЕМУ ЭТОГО НЕ БЫЛО РАНЬШЕ. Все четыре источника панели яндексовые, и
 * владелец справедливо спросил, где Google. Доступ к Google у нас был, но в
 * другом месте: B639 положил агентский CLI (`scripts/seo/gsc_query.py`) со
 * scope `webmasters.readonly`. CLI живёт на машине агента и в админку не
 * отдаёт ничего.
 *
 * ⚠ ПОЧЕМУ REFRESH TOKEN, А НЕ СЕРВИСНЫЙ АККАУНТ. Свойство в Search Console
 * подтверждено владельцем как человеком; выдать сервисному аккаунту права
 * можно, но это лишний шаг руками в чужом интерфейсе. Refresh token
 * выпускается один раз, доезжает выкаткой (владелец не правит .env руками) и
 * не истекает, пока доступ не отозван.
 *
 * ⚠ GA4 И ЛЮБОЙ ЭКСПОРТ ПОВЕДЕНЧЕСКОЙ АНАЛИТИКИ В GOOGLE НЕ БЕРЁМ — решение
 * B639 остаётся в силе. Здесь только чтение того, что Google уже знает о нас.
 */

import { log } from "@/lib/logger";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
/** Токен живёт час; берём запас, чтобы не попасть в отказ на границе. */
const TOKEN_SAFETY_MS = 5 * 60_000;

export interface SearchConsoleConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  property: string;
}

export interface SearchConsoleTotals {
  clicks: number;
  impressions: number;
  /** Проценты, 0–100. Google отдаёт долю 0–1 — приводим здесь, один раз. */
  ctr: number;
  averagePosition: number;
}

export interface SearchConsoleQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  averagePosition: number;
}

export function searchConsoleConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): SearchConsoleConfig | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  // Свойство подтверждено и как префиксное, и как доменное; по умолчанию берём
  // доменное — оно покрывает все поддомены разом.
  const property = env.GSC_PROPERTY?.trim() || "sc-domain:eterapy.com";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, property };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Сбросить кэш токена. Нужен прогонам — иначе они видят чужое состояние. */
export function resetSearchConsoleTokenCache(): void {
  cachedToken = null;
}

async function accessToken(config: SearchConsoleConfig, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MS > now) return cachedToken.value;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // ⚠ Тело ответа НАРУЖУ не отдаём: в нём эхо запроса вместе с секретом.
    // Наружу уходит только код — тот же принцип, что у остальных источников.
    throw new Error(`Search Console token refresh failed: HTTP ${response.status}`);
  }
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Search Console token refresh returned no token");
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

interface AnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function searchAnalytics(
  config: SearchConsoleConfig,
  body: Record<string, unknown>,
): Promise<AnalyticsRow[]> {
  const token = await accessToken(config);
  const url = `${API_BASE}/sites/${encodeURIComponent(config.property)}/searchAnalytics/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    // Протухший или отозванный доступ — единственная причина, которую стоит
    // отличать: она чинится действием владельца, а не ожиданием.
    if (response.status === 401 || response.status === 403) {
      cachedToken = null;
      throw new Error(`Search Console access rejected: HTTP ${response.status}`);
    }
    throw new Error(`Search Console query failed: HTTP ${response.status}`);
  }
  const payload = await response.json() as { rows?: AnalyticsRow[] };
  return payload.rows ?? [];
}

function totalsFrom(row: AnalyticsRow | undefined): SearchConsoleTotals {
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: (row?.ctr ?? 0) * 100,
    averagePosition: row?.position ?? 0,
  };
}

export const EMPTY_SEARCH_CONSOLE_TOTALS: SearchConsoleTotals = {
  clicks: 0,
  impressions: 0,
  ctr: 0,
  averagePosition: 0,
};

/**
 * Замер за период.
 *
 * ⚠ ЛОВУШКА, КОТОРУЮ ОБЯЗАН ЗНАТЬ ЧИТАТЕЛЬ ПАНЕЛИ. Разбивка по запросам может
 * быть ПУСТОЙ при ненулевых показах: Google не раскрывает редкие запросы,
 * чтобы по ним нельзя было опознать конкретного человека — при трёх показах за
 * месяц под это правило попадает всё. Поэтому итоги и разбивка запрашиваются
 * отдельно, и
 * пустой список запросов при ненулевых показах — не сбой, а анонимизация.
 */
export async function fetchSearchConsole(input: {
  config: SearchConsoleConfig;
  startDate: string;
  endDate: string;
  queryLimit?: number;
}): Promise<{ totals: SearchConsoleTotals; queries: SearchConsoleQuery[] }> {
  const { config, startDate, endDate } = input;
  const [totalRows, queryRows] = await Promise.all([
    searchAnalytics(config, { startDate, endDate }),
    searchAnalytics(config, {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: input.queryLimit ?? 100,
    }),
  ]);

  return {
    totals: totalsFrom(totalRows[0]),
    queries: queryRows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({
        query: row.keys?.[0] ?? "",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: (row.ctr ?? 0) * 100,
        averagePosition: row.position ?? 0,
      })),
  };
}

/**
 * Почему разбивка по запросам пуста. Возвращает `null`, когда объяснять нечего
 * (запросы есть) — вызывающий код не должен додумывать формулировку сам.
 */
export function explainEmptyQueries(totals: SearchConsoleTotals, queryCount: number): string | null {
  if (queryCount > 0) return null;
  if (totals.impressions > 0) {
    return "Google не раскрывает редкие запросы: показы есть, но каждый отдельный запрос слишком редкий, чтобы попасть в отчёт.";
  }
  return "За период у сайта не было ни одного показа в Google.";
}

export function logSearchConsoleFailure(error: unknown): void {
  log.warn("search-console.request_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
}

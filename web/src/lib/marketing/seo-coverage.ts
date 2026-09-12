/**
 * B470 / B550 / B578 — unattended index-coverage cycle.
 *
 * The SEO epic was stuck on a human step: someone had to open Yandex Webmaster,
 * notice that the corpus was published but not crawled, and push URLs into the
 * recrawl queue by hand. Measured state on 2026-07-29 was one searchable page
 * against a sitemap of two hundred — the pages were not rejected, the crawler
 * simply had not reached them.
 *
 * This module closes that loop: every cycle it reads real coverage, spends the
 * daily recrawl quota on the URLs that are actually missing, and records the
 * result as a signal so the next content decision is made on evidence rather
 * than on intent.
 */

import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import { log, serializeError } from "@/lib/logger";
import { resolveMarketingSignal, upsertMarketingSignal } from "@/lib/marketing/agent";

const WEBMASTER_BASE = "https://api.webmaster.yandex.net/v4";
const DEFAULT_USER_ID = "253574184";
const DEFAULT_HOST_ID = "https:eterapy.com:443";

export interface SeoCoverageSnapshot {
  searchablePages: number;
  excludedPages: number;
  sitemapUrls: number;
  coverageRatio: number;
  recrawlQuota: number;
  recrawlRemaining: number;
  submitted: string[];
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

async function webmasterJson(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `OAuth ${token}`, ...(init?.headers ?? {}) },
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

/** Tolerant of both the documented `*_count` fields and the short aliases. */
export function parseCoverageSummary(summary: Record<string, unknown>) {
  return {
    searchablePages: numberField(summary, "searchable_pages_count", "searchable_pages"),
    excludedPages: numberField(summary, "excluded_pages_count", "excluded_pages"),
  };
}

async function sitemapUrls(origin: string): Promise<string[]> {
  const response = await fetch(new URL("/sitemap.xml", origin).toString(), {
    headers: { "User-Agent": "ETerapy-SEO-Coverage/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`);
  const xml = await response.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1].trim())
    .filter((url) => url.startsWith(origin));
}

/**
 * Which URLs to spend the quota on. Pages the registry already published are
 * pushed first — they are the ones a content decision depends on — then the
 * rest of the sitemap in its natural order. URLs recrawled recently are not
 * re-submitted: the quota is small and Yandex does not reward repetition.
 */
export function prioritiseRecrawl(input: {
  sitemap: readonly string[];
  registryUrls: readonly string[];
  recentlySubmitted: readonly string[];
  budget: number;
}): string[] {
  const recent = new Set(input.recentlySubmitted);
  const registry = new Set(input.registryUrls);
  const preferred = input.sitemap.filter((url) => registry.has(url) && !recent.has(url));
  const rest = input.sitemap.filter((url) => !registry.has(url) && !recent.has(url));
  return [...preferred, ...rest].slice(0, Math.max(0, input.budget));
}

const RECRAWL_MEMORY_KEY = "seo.recrawl.submitted";
const RECRAWL_MEMORY_DAYS = 21;

async function recentlySubmitted(now: Date): Promise<string[]> {
  const row = await db.platformSetting.findUnique({
    where: { key: RECRAWL_MEMORY_KEY },
    select: { value: true },
  }).catch(() => null);
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as Array<{ url: string; at: string }>;
    const cutoff = now.getTime() - RECRAWL_MEMORY_DAYS * 86_400_000;
    return parsed
      .filter((entry) => new Date(entry.at).getTime() >= cutoff)
      .map((entry) => entry.url);
  } catch {
    return [];
  }
}

async function rememberSubmitted(urls: string[], now: Date) {
  if (urls.length === 0) return;
  const previous = await db.platformSetting.findUnique({
    where: { key: RECRAWL_MEMORY_KEY },
    select: { value: true },
  }).catch(() => null);
  let history: Array<{ url: string; at: string }> = [];
  try {
    history = previous?.value ? JSON.parse(previous.value) : [];
  } catch {
    history = [];
  }
  const cutoff = now.getTime() - RECRAWL_MEMORY_DAYS * 86_400_000;
  const merged = [
    ...urls.map((url) => ({ url, at: now.toISOString() })),
    ...history.filter((entry) => new Date(entry.at).getTime() >= cutoff),
  ].slice(0, 4_000);
  const value = JSON.stringify(merged);
  await db.platformSetting.upsert({
    where: { key: RECRAWL_MEMORY_KEY },
    create: { key: RECRAWL_MEMORY_KEY, value, updatedBy: "service:marketing-agent" },
    update: { value, updatedBy: "service:marketing-agent" },
  });
}

/**
 * B740 — АДРЕСНЫЙ ПЕРЕОБХОД ТОЛЬКО ЧТО ВЫПУЩЕННОЙ СТРАНИЦЫ.
 *
 * Плановый цикл выше тратит квоту на карту сайта целиком и доходит до свежей
 * страницы в порядке очереди — то есть через несколько заходов. Для страницы,
 * выпущенной минуту назад, это разница между «в поиске завтра» и «в поиске
 * через неделю»: у Яндекса свежесть подачи и есть весь смысл переобхода.
 *
 * ⚠ КВОТА ОДНА НА ОБА ПУТИ. Адресная подача расходует тот же суточный лимит,
 * поэтому она берёт по одному адресу на выпуск, а не пачку: пачка съела бы
 * квоту, которой плановый цикл закрывает отставание корпуса.
 */
export async function submitUrlsForRecrawl(urls: readonly string[]): Promise<string[]> {
  const config = webmasterConfig();
  if (!config || urls.length === 0) return [];
  const submitted: string[] = [];
  for (const url of urls) {
    try {
      await webmasterJson(`${config.base}/recrawl/queue/`, config.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      submitted.push(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Исчерпанная квота — штатный конец суток, а не сбой подачи.
      if (/quota|429/i.test(message)) break;
      log.warn("seo-coverage.direct-recrawl-failed", { url, error: serializeError(error) });
    }
  }
  if (submitted.length > 0) await rememberSubmitted(submitted, new Date()).catch(() => undefined);
  return submitted;
}

export async function runSeoCoverageCycle(
  input: { now?: Date; maxSubmissions?: number } = {},
): Promise<SeoCoverageSnapshot | { skipped: "not_configured" }> {
  const config = webmasterConfig();
  if (!config) return { skipped: "not_configured" };
  const now = input.now ?? new Date();
  const origin = new URL(APP_URL).origin;

  const [summary, quota, sitemap, registry, alreadySubmitted] = await Promise.all([
    webmasterJson(`${config.base}/summary`, config.token),
    webmasterJson(`${config.base}/recrawl/quota`, config.token),
    sitemapUrls(origin),
    db.externalPublication.findMany({
      where: { destinationUrl: { startsWith: origin } },
      select: { destinationUrl: true },
    }).then((rows) => rows.map((row) => row.destinationUrl).filter(Boolean) as string[])
      .catch(() => [] as string[]),
    recentlySubmitted(now),
  ]);

  // Webmaster v4 names these `*_count`. Reading the short form silently
  // reported zero indexed pages, which both fired a false "coverage" alarm and
  // hid the genuinely different "pages were excluded" case.
  const { searchablePages, excludedPages } = parseCoverageSummary(summary);
  const quotaRemaining = Number(quota.quota_remainder ?? 0);
  const dailyQuota = Number(quota.daily_quota ?? 0);
  const budget = Math.max(0, Math.min(quotaRemaining, input.maxSubmissions ?? quotaRemaining));

  const targets = prioritiseRecrawl({
    sitemap,
    registryUrls: registry,
    recentlySubmitted: alreadySubmitted,
    budget,
  });

  const submitted: string[] = [];
  for (const url of targets) {
    try {
      await webmasterJson(`${config.base}/recrawl/queue/`, config.token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      submitted.push(url);
    } catch (error) {
      // A depleted quota is the normal end of the day's work, not a failure.
      // Yandex answers HTTP 429 once the daily allowance is gone.
      const message = error instanceof Error ? error.message : String(error);
      if (/quota|429/i.test(message)) break;
      log.warn("seo-coverage.recrawl-failed", { url, error: serializeError(error) });
    }
  }
  await rememberSubmitted(submitted, now).catch(() => undefined);

  const coverageRatio = sitemap.length > 0 ? searchablePages / sitemap.length : 0;
  if (sitemap.length > 0 && coverageRatio < 0.5) {
    await upsertMarketingSignal({
      key: "seo:coverage",
      kind: "SEO_AUDIT",
      severity: "WARNING",
      title: `Индексация отстаёт: ${searchablePages} из ${sitemap.length} страниц в поиске`,
      summary: excludedPages === 0
        ? `Исключённых страниц нет — обход просто не дошёл. За цикл отправлено на переобход: ${submitted.length}, остаток суточной квоты ${quotaRemaining - submitted.length}.`
        : `Исключено ${excludedPages} страниц — нужна причина исключения, а не только переобход.`,
      evidence: {
        searchablePages,
        excludedPages,
        sitemapUrls: sitemap.length,
        submitted: submitted.length,
        checkedAt: now.toISOString(),
      },
    }).catch(() => undefined);
  } else {
    await resolveMarketingSignal("seo:coverage").catch(() => undefined);
  }

  return {
    searchablePages,
    excludedPages,
    sitemapUrls: sitemap.length,
    coverageRatio,
    recrawlQuota: dailyQuota,
    recrawlRemaining: quotaRemaining - submitted.length,
    submitted,
  };
}

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";

export type MarketingResearchItem = {
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
};

export type MarketingResearchBrief = {
  generatedAt: string;
  query: string;
  platform: string;
  scheduledContext: {
    iso: string | null;
    weekdayMoscow: string | null;
    timeMoscow: string | null;
  };
  currentSignals: MarketingResearchItem[];
  competitorSignals: MarketingResearchItem[];
  recentOwnMaterials: Array<{
    platform: string;
    title: string;
    bodyExcerpt: string;
    publishedAt: string | null;
  }>;
  limitations: string[];
};

type ResearchPublication = {
  id: string;
  platform: string;
  title: string;
  targetQuery: string | null;
  cluster: string | null;
  scheduledFor: Date | null;
  engagementExcerpt: string | null;
  engagementTargetUrl: string | null;
};

const ALLOWED_COMPETITOR_HOSTS = new Set([
  "t.me",
  "vk.com",
  "www.reddit.com",
  "reddit.com",
  "dzen.ru",
  "www.instagram.com",
  "www.threads.net",
]);

function decodeEntities(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function plain(value: string, limit = 700) {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function rssItems(xml: string): MarketingResearchItem[] {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, 8)
    .map((match) => {
      const block = match[1];
      const field = (name: string) =>
        block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? "";
      return {
        source: plain(field("source"), 120) || "Google News",
        title: plain(field("title"), 260),
        url: plain(field("link"), 700),
        publishedAt: plain(field("pubDate"), 120) || null,
        excerpt: plain(field("description"), 700),
      };
    })
    .filter((item) => item.title && /^https:\/\//i.test(item.url));
}

function moscowSchedule(value: Date | null) {
  if (!value) return { iso: null, weekdayMoscow: null, timeMoscow: null };
  return {
    iso: value.toISOString(),
    weekdayMoscow: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      weekday: "long",
    }).format(value),
    timeMoscow: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      hour: "2-digit",
      minute: "2-digit",
    }).format(value),
  };
}

async function fetchText(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": "ETerapyMarketingResearch/1.0 (+https://eterapy.com)",
      Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.5",
    },
    signal: AbortSignal.timeout(8_000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.text()).slice(0, 500_000);
}

async function currentNews(query: string, fetchImpl: typeof fetch) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "ru");
  url.searchParams.set("gl", "RU");
  url.searchParams.set("ceid", "RU:ru");
  return rssItems(await fetchText(url.toString(), fetchImpl));
}

async function competitorPages(fetchImpl: typeof fetch) {
  const raw = await marketingPlatformValue("MARKETING_COMPETITOR_URLS");
  const urls = (raw ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
  const items: MarketingResearchItem[] = [];
  for (const rawUrl of urls) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || !ALLOWED_COMPETITOR_HOSTS.has(url.hostname)) continue;
      const body = await fetchText(url.toString(), fetchImpl);
      const title = plain(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname, 260);
      const description = plain(
        body.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]
          ?? body,
      );
      items.push({
        source: url.hostname,
        title,
        url: url.toString(),
        publishedAt: null,
        excerpt: description,
      });
    } catch (error) {
      log.warn("marketing-research.competitor-fetch-failed", {
        url: rawUrl.slice(0, 300),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return items;
}

export async function buildMarketingResearchBrief(
  publication: ResearchPublication,
  input: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<MarketingResearchBrief> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const query = publication.targetQuery?.trim()
    || publication.cluster?.trim()
    || publication.title.trim();
  const since = new Date(now.getTime() - 21 * 86_400_000);
  const [recentOwnMaterials, newsResult, competitorResult] = await Promise.all([
    db.externalPublication.findMany({
      where: {
        id: { not: publication.id },
        platform: publication.platform,
        OR: [
          { publishedAt: { gte: since } },
          { scheduledFor: { gte: since } },
        ],
      },
      select: { platform: true, title: true, body: true, publishedAt: true },
      orderBy: [{ publishedAt: "desc" }, { scheduledFor: "desc" }],
      take: 10,
    }).catch(() => []),
    currentNews(query, fetchImpl).catch((error) => {
      log.warn("marketing-research.news-fetch-failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [] as MarketingResearchItem[];
    }),
    competitorPages(fetchImpl).catch(() => [] as MarketingResearchItem[]),
  ]);

  const currentSignals = publication.engagementExcerpt
    ? [{
      source: publication.platform,
      title: "Публичный материал, на который готовится ответ",
      url: publication.engagementTargetUrl ?? "",
      publishedAt: null,
      excerpt: plain(publication.engagementExcerpt),
    }, ...newsResult]
    : newsResult;
  const limitations: string[] = [];
  if (newsResult.length === 0) limitations.push("Актуальная новостная RSS-выдача недоступна или пуста.");
  if (competitorResult.length === 0) limitations.push("Не настроены или недоступны публичные страницы-аналогии.");

  return {
    generatedAt: now.toISOString(),
    query,
    platform: publication.platform,
    scheduledContext: moscowSchedule(publication.scheduledFor),
    currentSignals: currentSignals.slice(0, 8),
    competitorSignals: competitorResult.slice(0, 8),
    recentOwnMaterials: recentOwnMaterials.map((row) => ({
      platform: row.platform,
      title: row.title,
      bodyExcerpt: plain(row.body ?? "", 400),
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
    limitations,
  };
}

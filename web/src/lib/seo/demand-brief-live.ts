/**
 * B750 — ЖИВЫЕ ИСТОЧНИКИ БРИФА СПРОСА (Wordstat, выдача Яндекса, публичные посты).
 *
 * Отделено от `demand-brief.ts`, чтобы чистая часть проверялась без сети. Ответ
 * держится в памяти процесса: проход зовётся несколько раз в сутки, а соседние
 * фразы и выдача за шесть часов не меняются. Посты — общий список на все
 * запросы, поэтому кэшируется отдельно и на меньший срок.
 */

import { log } from "@/lib/logger";
import { discoverCandidates, type Candidate } from "@/lib/marketing/discovery";
import { serpTextsFor } from "@/lib/marketing/trend-serp";
import { topRequestsFor } from "@/lib/seo/demand/wordstat-harvest";
import { buildDemandBrief, formatDemandBrief, type DemandBrief } from "@/lib/seo/demand-brief";

const BRIEF_CACHE_MS = 6 * 60 * 60_000;
const POSTS_CACHE_MS = 30 * 60_000;
const briefCache = new Map<string, { at: number; brief: DemandBrief }>();
let postsCache: { at: number; posts: Candidate[] } | null = null;

function credentials(): { apiKey: string; folderId: string } | null {
  const apiKey = process.env.YANDEX_WORDSTAT_API_KEY?.trim();
  const folderId = process.env.YANDEX_CLOUD_FOLDER_ID?.trim();
  return apiKey && folderId ? { apiKey, folderId } : null;
}

async function freshPosts(now: number): Promise<Candidate[]> {
  if (postsCache && now - postsCache.at < POSTS_CACHE_MS) return postsCache.posts;
  const posts = await discoverCandidates();
  postsCache = { at: now, posts };
  return posts;
}

export async function liveDemandBrief(query: string, now: Date = new Date()): Promise<DemandBrief> {
  const key = query.toLocaleLowerCase("ru-RU");
  const cached = briefCache.get(key);
  if (cached && now.getTime() - cached.at < BRIEF_CACHE_MS) return cached.brief;

  const keys = credentials();
  const brief = await buildDemandBrief(query, {
    related: async (phrase) => {
      if (!keys) return [];
      return topRequestsFor({ seed: phrase, ...keys, numPhrases: 40 });
    },
    serp: async (phrase) => {
      if (!keys) return [];
      return serpTextsFor({ queryText: phrase, ...keys });
    },
    posts: () => freshPosts(now.getTime()),
  });
  log.info("seo.demand_brief", {
    query,
    grounded: brief.grounded,
    related: brief.related.length,
    serp: brief.serpAngles.length,
    posts: brief.freshPosts.length,
  });
  // Пустой бриф не кэшируется: молчание источника — не свойство запроса.
  if (brief.grounded) briefCache.set(key, { at: now.getTime(), brief });
  return brief;
}

export async function liveDemandBriefText(query: string, now?: Date): Promise<string> {
  return formatDemandBrief(await liveDemandBrief(query, now));
}

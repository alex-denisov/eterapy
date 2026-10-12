/**
 * B772 — СОБСТВЕННЫЕ ПОСТЫ THREADS ИЗ API.
 *
 * Часть постов владелец публикует руками, и в нашей базе их нет: память хуков
 * (`threads-hooks.ts`) о них не знала, и автор мог повторить свой же зачин.
 * `GET /me/threads` отдаёт всё, что вышло с аккаунта. Ответ кэшируется в памяти
 * процесса на 30 минут: вызов нужен на каждый пост, а лента меняется редко.
 *
 * Сбой API — не ошибка воркера: пустой список и предупреждение в журнале (без
 * адреса запроса: токен лежит в нём).
 */

import { z } from "zod";
import { log, serializeError } from "@/lib/logger";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";
import { requiredMarketingPlatformValue } from "@/lib/marketing/platform-settings";
import { nicheShare } from "@/lib/marketing/threads-niche";
import type { RecentThreadsPost } from "@/lib/marketing/threads-hooks";

export const OWN_POSTS_CACHE_MS = 30 * 60_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FETCH_TIMEOUT_MS = 15_000;
/** Сколько первых букв и цифр текста считаются «тем же постом». */
const PREFIX_LENGTH = 24;

export interface OwnThreadsPost {
  id: string;
  text: string;
  permalink: string | null;
  timestamp: string;
}

const ResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    text: z.string().optional(),
    permalink: z.string().optional(),
    timestamp: z.string().optional(),
    media_type: z.string().optional(),
  })),
});

let cache: { at: number; limit: number; posts: OwnThreadsPost[] } | null = null;

/** Для тестов. */
export function resetOwnPostsCache(): void {
  cache = null;
}

async function requestPosts(limit: number, call: typeof fetch): Promise<OwnThreadsPost[]> {
  const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
  const url = `${metaEndpoint("threads")}/v1.0/me/threads?fields=id,text,permalink,timestamp,media_type&limit=${limit}`
    + `&access_token=${encodeURIComponent(token)}`;
  const response = await call(url, { headers: metaRequestHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const parsed = ResponseSchema.parse(await response.json());
  return parsed.data
    .filter((item) => Boolean(item.text?.trim()))
    .map((item) => ({ id: item.id, text: item.text!.trim(), permalink: item.permalink ?? null, timestamp: item.timestamp ?? "" }));
}

export async function fetchOwnThreadsPosts(input: {
  fetchImpl?: typeof fetch;
  limit?: number;
  now?: Date;
} = {}): Promise<OwnThreadsPost[]> {
  const now = (input.now ?? new Date()).getTime();
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  if (cache && cache.limit >= limit && now - cache.at < OWN_POSTS_CACHE_MS) return cache.posts.slice(0, limit);
  try {
    const posts = await requestPosts(limit, input.fetchImpl ?? fetch);
    cache = { at: now, limit, posts };
    return posts;
  } catch (error) {
    log.warn("marketing.threads_own_posts_failed", { error: serializeError(error) });
    return [];
  }
}

function prefixKey(text: string): string {
  return text.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, PREFIX_LENGTH);
}

/**
 * Память хуков + посты, опубликованные руками: дубль по началу текста с постом
 * из базы отбрасывается, посты старше окна не нужны. Чистая функция.
 */
export function mergeOwnPosts(
  known: readonly RecentThreadsPost[],
  own: readonly OwnThreadsPost[],
  now: Date,
  windowDays: number,
): RecentThreadsPost[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const seen = new Set(known.map((post) => prefixKey(post.text)).filter(Boolean));
  const extra = own.flatMap((post) => {
    const at = Date.parse(post.timestamp);
    const key = prefixKey(post.text);
    if (!key || seen.has(key) || !Number.isFinite(at) || at < since) return [];
    seen.add(key);
    return [{ text: post.text, at: new Date(at) }];
  });
  return [...known, ...extra];
}

/** Доля собственных постов, держащих тему ленты, для недельного отчёта; `null` — постов нет. */
export function ownPostsNicheShare(posts: readonly OwnThreadsPost[]): number | null {
  return nicheShare(posts.map((post) => post.text));
}

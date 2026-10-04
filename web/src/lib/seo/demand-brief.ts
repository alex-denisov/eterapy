/**
 * B750 — БРИФ СПРОСА ДЛЯ АВТОРА СТРАНИЦЫ.
 *
 * Владелец 2026-10-05: агенты пишут «как слепые котята» — автор получал число
 * частотности и больше ничего. Теперь перед написанием собираются три вида
 * живых данных по целевому запросу:
 *
 *  1. РЕАЛЬНЫЕ ФОРМУЛИРОВКИ — Wordstat topRequests: как люди на самом деле
 *     набирают соседние фразы и сколько их. Автор вплетает их в H2 и FAQ.
 *  2. КАК ОТВЕЧАЮТ ДРУГИЕ — заголовки и врезки выдачи Яндекса: какой угол и
 *     какие слова уже в топе (без витрин).
 *  3. ЧТО ПИШУТ СЕЙЧАС — свежие публичные посты (VK/Threads), пересекающиеся с
 *     запросом: живой язык боли, не из словаря.
 *
 * ⚠ ИСТОЧНИК МОЛЧИТ — БРИФ ПУСТ, А НЕ ВЫДУМАН. Любой отказ даёт пустой раздел и
 * `grounded=false`; конвейер не встаёт. Бриф — подсказка, а не условие выпуска.
 */

import { log, serializeError } from "@/lib/logger";
import type { Candidate } from "@/lib/marketing/discovery";

export interface RelatedPhrase {
  phrase: string;
  count: number;
}

export interface DemandBrief {
  query: string;
  related: RelatedPhrase[];
  serpAngles: string[];
  freshPosts: Array<{ platform: string; excerpt: string; url: string }>;
  /** Есть ли вообще хоть один живой источник. */
  grounded: boolean;
}

export interface DemandBriefSources {
  related: (query: string) => Promise<RelatedPhrase[]>;
  serp: (query: string) => Promise<string[]>;
  posts: () => Promise<Candidate[]>;
}

/** Фраза ниже порога — шум, не формулировка. */
export const BRIEF_MIN_RELATED_COUNT = 100;
export const BRIEF_RELATED_LIMIT = 10;
export const BRIEF_SERP_LIMIT = 6;
export const BRIEF_POSTS_LIMIT = 3;
const SERP_TEXT_MAX = 140;

function norm(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Служебные слова, которые делают пересечение случайным. */
const BRIEF_STOP = new Set(["что", "как", "это", "его", "она", "они", "для", "при", "или", "чему", "если"]);

function stems(value: string): string[] {
  return norm(value)
    .split(/[^a-zа-я0-9]+/)
    .filter((token) => token.length >= 3 && !BRIEF_STOP.has(token))
    .map((token) => token.slice(0, 5));
}

export function relatedPhrasesFrom(rows: readonly RelatedPhrase[], query: string): RelatedPhrase[] {
  const own = norm(query);
  const seen = new Set<string>([own]);
  const kept: RelatedPhrase[] = [];
  for (const row of [...rows].sort((a, b) => b.count - a.count)) {
    const key = norm(row.phrase);
    if (seen.has(key) || row.count < BRIEF_MIN_RELATED_COUNT) continue;
    seen.add(key);
    kept.push({ phrase: row.phrase.trim(), count: row.count });
  }
  return kept.slice(0, BRIEF_RELATED_LIMIT);
}

export function serpAnglesFrom(texts: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const text of texts) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || clean.length > SERP_TEXT_MAX) continue;
    const key = norm(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(clean);
  }
  return kept.slice(0, BRIEF_SERP_LIMIT);
}

/** Пост подходит, если делит с запросом хотя бы два значимых слова. */
export function freshPostsFor(posts: readonly Candidate[], query: string): Candidate[] {
  const wanted = new Set(stems(query));
  return posts
    .filter((post) => stems(post.excerpt).filter((stem) => wanted.has(stem)).length >= 2)
    .slice(0, BRIEF_POSTS_LIMIT);
}

export async function buildDemandBrief(query: string, sources: DemandBriefSources): Promise<DemandBrief> {
  const [related, serp, posts] = await Promise.allSettled([
    sources.related(query),
    sources.serp(query),
    sources.posts(),
  ]);
  const settle = <T>(result: PromiseSettledResult<T>, fallback: T, name: string): T => {
    if (result.status === "fulfilled") return result.value;
    log.warn("seo.demand_brief_source_failed", { source: name, error: serializeError(result.reason) });
    return fallback;
  };
  const brief: DemandBrief = {
    query,
    related: relatedPhrasesFrom(settle(related, [], "wordstat"), query),
    serpAngles: serpAnglesFrom(settle(serp, [], "serp")),
    freshPosts: freshPostsFor(settle(posts, [] as Candidate[], "posts"), query).map((post) => ({
      platform: post.platform,
      excerpt: post.excerpt.replace(/\s+/g, " ").trim().slice(0, 220),
      url: post.targetUrl,
    })),
    grounded: false,
  };
  brief.grounded = brief.related.length + brief.serpAngles.length + brief.freshPosts.length > 0;
  return brief;
}

/** Текст для промта автора. Пустая строка — данных нет, раздел не добавляется. */
export function formatDemandBrief(brief: DemandBrief): string {
  if (!brief.grounded) return "";
  const lines = ["ЖИВЫЕ ДАННЫЕ ПО ЗАПРОСУ (собраны только что; используй как язык и угол, не копируй дословно):"];
  if (brief.related.length > 0) {
    lines.push(
      "Как люди на самом деле набирают соседние фразы (показов в месяц) — вплети самые частые в подзаголовки и FAQ:",
      ...brief.related.map((row) => `— ${row.phrase} (${row.count} в месяц)`),
    );
  }
  if (brief.serpAngles.length > 0) {
    lines.push(
      "Что сейчас в топе выдачи по запросу — найди угол, которого там нет, а не пересказывай:",
      ...brief.serpAngles.map((text) => `— ${text}`),
    );
  }
  if (brief.freshPosts.length > 0) {
    lines.push(
      "Что люди пишут об этом прямо сейчас (живой язык боли; без цитирования и ссылок на авторов):",
      ...brief.freshPosts.map((post) => `— ${post.excerpt}`),
    );
  }
  return lines.join("\n");
}

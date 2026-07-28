import { createHash } from "crypto";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";
import { upsertMarketingSignal } from "@/lib/marketing/agent";

export type MarketingConnectorState = {
  platform: "VK" | "Reddit" | "Threads" | "Instagram" | "Telegram";
  ownedPublishing: boolean;
  discovery: boolean;
  comments: boolean;
  missing: string[];
  note: string;
};

function has(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function marketingConnectorStates(): MarketingConnectorState[] {
  return [
    {
      platform: "VK",
      ownedPublishing: has("VK_COMMUNITY_TOKEN") && has("VK_COMMUNITY_ID"),
      discovery: has("VK_COMMUNITY_TOKEN"),
      comments: has("VK_COMMUNITY_TOKEN") && has("VK_COMMUNITY_ID"),
      missing: ["VK_COMMUNITY_TOKEN", "VK_COMMUNITY_ID"].filter((key) => !has(key)),
      note: "Официальный VK API: wall.post, newsfeed.search, wall.createComment.",
    },
    {
      platform: "Reddit",
      ownedPublishing: has("REDDIT_ACCESS_TOKEN") && has("REDDIT_POST_SUBREDDIT"),
      discovery: has("REDDIT_ACCESS_TOKEN") && has("REDDIT_SUBREDDITS"),
      comments: has("REDDIT_ACCESS_TOKEN"),
      missing: ["REDDIT_ACCESS_TOKEN", "REDDIT_POST_SUBREDDIT", "REDDIT_SUBREDDITS", "REDDIT_USER_AGENT"].filter((key) => !has(key)),
      note: "Официальный OAuth Data API: собственные self-posts и поиск по разрешённым subreddit. Любой комментарий только после Telegram-премодерации и с раскрытием аффилированности.",
    },
    {
      platform: "Threads",
      ownedPublishing: has("THREADS_ACCESS_TOKEN") && has("THREADS_USER_ID"),
      discovery: false,
      comments: has("THREADS_ACCESS_TOKEN") && has("THREADS_USER_ID"),
      missing: ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID"].filter((key) => !has(key)),
      note: "Официальный Threads API публикует посты/ответы. Глобального поиска чужих постов по ключевым словам API не обещает — входящие кандидаты добавляются из разрешённых mentions/feeds.",
    },
    {
      platform: "Instagram",
      ownedPublishing: has("INSTAGRAM_ACCESS_TOKEN") && has("INSTAGRAM_USER_ID"),
      discovery: false,
      comments: false,
      missing: ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"].filter((key) => !has(key)),
      note: "Instagram API для Professional account: свои публикации и управление комментариями на своих медиа. Официальный API не даёт публиковать рекламные комментарии под произвольными чужими постами — этот путь не подменяется cookies-автоматизацией.",
    },
    {
      platform: "Telegram",
      ownedPublishing: has("TELEGRAM_BOT_TOKEN") && has("TELEGRAM_CHANNEL_ID"),
      discovery: false,
      comments: false,
      missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID"].filter((key) => !has(key)),
      note: "Bot API публикует в собственный канал; массового поиска и комментариев к чужим каналам нет.",
    },
  ];
}

type Candidate = {
  platform: "reddit" | "vk";
  targetId: string;
  targetUrl: string;
  targetLabel: string;
  excerpt: string;
  topic: string;
};

const TOPICS = [
  "как пережить расставание",
  "не могу забыть бывшего",
  "стоит ли увольняться",
  "выгорание",
  "мне одиноко",
  "не могу принять решение",
] as const;

export function redactExternalExcerpt(value: string) {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
    .replace(/(?:\+?\d[\s()-]*){9,}/g, "[телефон]")
    .replace(/@[a-z0-9_.-]+/gi, "[@профиль]")
    .replace(/https?:\/\/\S+/gi, "[ссылка]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function matchingTopic(value: string) {
  const text = value.toLocaleLowerCase("ru-RU");
  return TOPICS.find((topic) => text.includes(topic)) ?? null;
}

async function discoverReddit(): Promise<Candidate[]> {
  const token = process.env.REDDIT_ACCESS_TOKEN?.trim();
  const subreddits = process.env.REDDIT_SUBREDDITS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  if (!token || subreddits.length === 0) return [];
  const result: Candidate[] = [];
  for (const subreddit of subreddits.slice(0, 10)) {
    const response = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/new?limit=25`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": process.env.REDDIT_USER_AGENT?.trim() || "ETerapySMM/1.0",
      },
    });
    if (!response.ok) throw new Error(`Reddit discovery HTTP ${response.status}`);
    const payload = await response.json() as {
      data?: { children?: Array<{ data?: { name?: string; permalink?: string; title?: string; selftext?: string } }> };
    };
    for (const child of payload.data?.children ?? []) {
      const post = child.data;
      const combined = `${post?.title ?? ""} ${post?.selftext ?? ""}`;
      const topic = matchingTopic(combined);
      if (!post?.name || !post.permalink || !topic) continue;
      result.push({
        platform: "reddit",
        targetId: post.name,
        targetUrl: `https://www.reddit.com${post.permalink}`,
        targetLabel: `r/${subreddit}: ${redactExternalExcerpt(post.title ?? "публикация")}`,
        excerpt: redactExternalExcerpt(combined),
        topic,
      });
    }
  }
  return result;
}

async function discoverVk(): Promise<Candidate[]> {
  const token = process.env.VK_COMMUNITY_TOKEN?.trim();
  if (!token) return [];
  const result: Candidate[] = [];
  for (const topic of TOPICS) {
    const response = await fetch("https://api.vk.com/method/newsfeed.search", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: token,
        v: "5.199",
        q: topic,
        count: "10",
      }),
    });
    const payload = await response.json() as {
      response?: { items?: Array<{ owner_id?: number; id?: number; text?: string }> };
      error?: { error_msg?: string };
    };
    if (payload.error) throw new Error(`VK discovery: ${payload.error.error_msg ?? "unknown error"}`);
    const item = payload.response?.items?.find((row) => row.owner_id && row.id && row.text);
    if (!item?.owner_id || !item.id) continue;
    result.push({
      platform: "vk",
      targetId: `${item.owner_id}_${item.id}`,
      targetUrl: `https://vk.com/wall${item.owner_id}_${item.id}`,
      targetLabel: `VK wall${item.owner_id}_${item.id}`,
      excerpt: redactExternalExcerpt(item.text ?? ""),
      topic,
    });
  }
  return result;
}

export async function ingestEngagementCandidate(candidate: Candidate) {
  const digest = createHash("sha256")
    .update(`${candidate.platform}:${candidate.targetId}`)
    .digest("hex")
    .slice(0, 24);
  return db.externalPublication.upsert({
    where: { key: `smm-comment-${digest}` },
    create: {
      key: `smm-comment-${digest}`,
      platform: candidate.platform,
      title: `Комментарий: ${candidate.topic}`,
      contentType: "COMMENT",
      status: "DRAFT",
      cluster: candidate.topic,
      targetQuery: candidate.topic,
      body: null,
      source: "AGENT_DISCOVERY",
      engagementTargetId: candidate.targetId,
      engagementTargetUrl: candidate.targetUrl,
      engagementTargetLabel: candidate.targetLabel,
      engagementExcerpt: candidate.excerpt,
      scheduledFor: new Date(),
      autoPublish: false,
    },
    update: {
      engagementTargetLabel: candidate.targetLabel,
      engagementExcerpt: candidate.excerpt,
      engagementTargetUrl: candidate.targetUrl,
    },
  });
}

export async function runEngagementDiscovery() {
  const outcomes = [];
  for (const [platform, discover] of [["reddit", discoverReddit], ["vk", discoverVk]] as const) {
    try {
      const candidates = await discover();
      // Deliberately at most one candidate per platform/cycle. Relevance beats
      // volume, and the unique key makes repeat discovery idempotent.
      if (candidates[0]) await ingestEngagementCandidate(candidates[0]);
      outcomes.push({ platform, found: candidates.length, ingested: candidates[0] ? 1 : 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await upsertMarketingSignal({
        key: `discovery:${platform}`,
        kind: "CONNECTOR",
        severity: "WARNING",
        title: `Не работает поиск кандидатов: ${platform}`,
        summary: message,
        evidence: { platform },
      }).catch(() => undefined);
      log.error("marketing-discovery.failed", { platform, error: serializeError(error) });
      outcomes.push({ platform, found: 0, ingested: 0, error: message });
    }
  }
  return outcomes;
}

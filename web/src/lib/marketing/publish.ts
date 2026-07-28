/**
 * B589 · Фаза 2: выпуск утверждённых публикаций.
 *
 * Публикация проходит только через эту дверь. У неё четыре независимых гейта:
 * запись утверждена (`SCHEDULED`), время наступило, общий выключатель включён,
 * а канал полностью настроен. Отсутствующий токен — ошибка конфигурации, а не
 * «успешная» пустая публикация.
 */

import db from "@/lib/db";
import { log } from "@/lib/logger";
import { callTelegramApi } from "@/lib/telegram";
import { devvitBridgeEnabled } from "@/lib/marketing/devvit-bridge";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
  requiredMarketingPlatformValue,
} from "@/lib/marketing/platform-settings";

const DAY_MS = 86_400_000;
const VK_API_VERSION = "5.199";

export function marketingAutopublishEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return env.MARKETING_AUTOPUBLISH === "1"
    || env.MARKETING_AUTOPUBLISH === "true";
}

export interface PublishedPost {
  externalPostId: string;
  publicUrl: string;
}

export type PublicationAdapter = (
  publication: {
    id: string;
    title: string;
    body: string;
    platform: string;
    contentType: string;
    mediaUrl: string | null;
    engagementTargetId: string | null;
    engagementTargetUrl: string | null;
  },
) => Promise<PublishedPost>;

async function ensurePlatformEnabled(platform: "VK" | "Reddit" | "Threads" | "Instagram" | "Telegram") {
  if (!await marketingPlatformEnabled(platform)) {
    throw new Error(`${platform} connector is disabled`);
  }
}

export async function publishToVk(
  publication: { body: string },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("VK");
  const token = await requiredMarketingPlatformValue("VK_COMMUNITY_TOKEN");
  const communityId = (await requiredMarketingPlatformValue("VK_COMMUNITY_ID")).replace(/^-/, "");
  if (!/^\d+$/.test(communityId)) {
    throw new Error("VK_COMMUNITY_ID must be numeric");
  }

  const response = await fetch("https://api.vk.com/method/wall.post", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      owner_id: `-${communityId}`,
      from_group: "1",
      message: publication.body,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    response?: { post_id?: number };
    error?: { error_code?: number; error_msg?: string };
  } | null;
  const postId = payload?.response?.post_id;
  if (!response.ok || !postId) {
    const code = payload?.error?.error_code;
    const message = payload?.error?.error_msg ?? `HTTP ${response.status}`;
    throw new Error(`VK wall.post failed${code ? ` (${code})` : ""}: ${message}`);
  }

  return {
    externalPostId: String(postId),
    publicUrl: `https://vk.com/wall-${communityId}_${postId}`,
  };
}

export async function publishToTelegram(
  publication: { body: string },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Telegram");
  const channelId = await requiredMarketingPlatformValue("TELEGRAM_CHANNEL_ID");
  const response = await callTelegramApi<{
    message_id?: number;
    chat?: { username?: string };
  }>("sendMessage", {
    chat_id: channelId,
    text: publication.body,
    disable_web_page_preview: false,
  });
  const messageId = response.result?.message_id;
  if (!response.ok || !messageId) {
    throw new Error(`Telegram sendMessage failed: ${response.description ?? "unknown error"}`);
  }

  const username = response.result?.chat?.username ?? channelId.replace(/^@/, "");
  return {
    externalPostId: String(messageId),
    publicUrl: username
      ? `https://t.me/${username}/${messageId}`
      : `https://t.me/c/${String(channelId).replace(/^-100/, "")}/${messageId}`,
  };
}

export async function publishRedditComment(
  publication: { body: string; engagementTargetId: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Reddit");
  const token = await redditAccessToken();
  const thingId = publication.engagementTargetId;
  if (!thingId || !/^t[13]_[a-z0-9]+$/i.test(thingId)) {
    throw new Error("Reddit target id is missing or invalid");
  }
  const response = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
    },
    body: new URLSearchParams({ api_type: "json", thing_id: thingId, text: publication.body }),
  });
  const payload = await response.json().catch(() => null) as {
    json?: {
      errors?: unknown[];
      data?: { things?: Array<{ data?: { id?: string; permalink?: string } }> };
    };
  } | null;
  const errors = payload?.json?.errors ?? [];
  const data = payload?.json?.data?.things?.[0]?.data;
  if (!response.ok || errors.length > 0 || !data?.id) {
    throw new Error(`Reddit api/comment failed: HTTP ${response.status}${errors.length ? ` ${JSON.stringify(errors).slice(0, 300)}` : ""}`);
  }
  return {
    externalPostId: data.id,
    publicUrl: data.permalink ? `https://www.reddit.com${data.permalink}` : "https://www.reddit.com",
  };
}

export async function publishVkComment(
  publication: { body: string; engagementTargetId: string | null; engagementTargetUrl: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("VK");
  const token = await requiredMarketingPlatformValue("VK_COMMUNITY_TOKEN");
  const groupId = (await requiredMarketingPlatformValue("VK_COMMUNITY_ID")).replace(/^-/, "");
  const match = publication.engagementTargetId?.match(/^(-?\d+)_([0-9]+)$/)
    ?? publication.engagementTargetUrl?.match(/wall(-?\d+)_([0-9]+)/);
  if (!match) throw new Error("VK wall target id is missing or invalid");
  const [ownerId, postId] = [match[1], match[2]];
  const response = await fetch("https://api.vk.com/method/wall.createComment", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      owner_id: ownerId,
      post_id: postId,
      from_group: groupId,
      message: publication.body,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    response?: { comment_id?: number };
    error?: { error_code?: number; error_msg?: string };
  } | null;
  const commentId = payload?.response?.comment_id;
  if (!response.ok || !commentId) {
    throw new Error(`VK wall.createComment failed: ${payload?.error?.error_msg ?? `HTTP ${response.status}`}`);
  }
  return {
    externalPostId: String(commentId),
    publicUrl: `https://vk.com/wall${ownerId}_${postId}?reply=${commentId}`,
  };
}

export async function publishThreadsReply(
  publication: { body: string; engagementTargetId: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Threads");
  const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("THREADS_USER_ID");
  if (!publication.engagementTargetId) throw new Error("Threads target media id is missing");
  const create = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      media_type: "TEXT",
      text: publication.body,
      reply_to_id: publication.engagementTargetId,
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Threads reply creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Threads reply publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  return {
    externalPostId: published.id,
    publicUrl: `https://www.threads.net/post/${published.id}`,
  };
}

export async function publishToThreads(
  publication: { body: string },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Threads");
  const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("THREADS_USER_ID");
  const create = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      media_type: "TEXT",
      text: publication.body,
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Threads post creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Threads post publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  return {
    externalPostId: published.id,
    publicUrl: `https://www.threads.net/post/${published.id}`,
  };
}

export async function publishToReddit(
  publication: { title: string; body: string },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Reddit");
  const token = await redditAccessToken();
  const subreddit = (await requiredMarketingPlatformValue("REDDIT_POST_SUBREDDIT")).replace(/^r\//i, "");
  const response = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
    },
    body: new URLSearchParams({
      api_type: "json",
      kind: "self",
      sr: subreddit,
      title: publication.title.slice(0, 300),
      text: publication.body,
      resubmit: "false",
      sendreplies: "true",
    }),
  });
  const payload = await response.json().catch(() => null) as {
    json?: {
      errors?: unknown[];
      data?: { id?: string; name?: string; url?: string };
    };
  } | null;
  const errors = payload?.json?.errors ?? [];
  const data = payload?.json?.data;
  if (!response.ok || errors.length > 0 || (!data?.id && !data?.name)) {
    throw new Error(`Reddit api/submit failed: HTTP ${response.status}${errors.length ? ` ${JSON.stringify(errors).slice(0, 300)}` : ""}`);
  }
  const postId = data?.name ?? data?.id ?? "";
  return {
    externalPostId: postId.replace(/^t3_/, ""),
    publicUrl: data?.url ?? `https://www.reddit.com/r/${subreddit}/`,
  };
}

export async function publishToInstagram(
  publication: { body: string; mediaUrl: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Instagram");
  const token = await requiredMarketingPlatformValue("INSTAGRAM_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("INSTAGRAM_USER_ID");
  if (!publication.mediaUrl || !/^https:\/\//i.test(publication.mediaUrl)) {
    throw new Error("Instagram requires a public HTTPS mediaUrl");
  }
  const create = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(userId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      image_url: publication.mediaUrl,
      caption: publication.body,
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Instagram media creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(userId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Instagram media publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  const permalinkResponse = await fetch(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(published.id)}?fields=permalink&access_token=${encodeURIComponent(token)}`,
  );
  const permalink = await permalinkResponse.json().catch(() => null) as { permalink?: string } | null;
  return {
    externalPostId: published.id,
    publicUrl: permalink?.permalink ?? `https://www.instagram.com/`,
  };
}

function adapterFor(
  publication: { platform: string; contentType: string },
  adapters: Partial<Record<string, PublicationAdapter>>,
): PublicationAdapter {
  const normalized = publication.platform.toLowerCase();
  if (adapters[normalized]) return adapters[normalized]!;
  if (publication.contentType === "COMMENT") {
    if (normalized === "reddit") return publishRedditComment;
    if (normalized === "vk") return publishVkComment;
    if (normalized === "threads") return publishThreadsReply;
    throw new Error(`Unsupported comment platform: ${publication.platform}`);
  }
  if (normalized === "vk") return publishToVk;
  if (normalized === "telegram") return publishToTelegram;
  if (normalized === "threads") return publishToThreads;
  if (normalized === "reddit") return publishToReddit;
  if (normalized === "instagram") return publishToInstagram;
  throw new Error(`Unsupported publication platform: ${publication.platform}`);
}

export interface PublishScheduledResult {
  enabled: boolean;
  due: number;
  published: number;
  failed: number;
  outcomes: Array<{ id: string; status: "published" | "failed"; error?: string }>;
}

export async function publishScheduledMarketing(input: {
  now?: Date;
  enabled?: boolean;
  adapters?: Partial<Record<string, PublicationAdapter>>;
} = {}): Promise<PublishScheduledResult> {
  const now = input.now ?? new Date();
  const enabled = input.enabled ?? marketingAutopublishEnabled();
  const redditHandledByDevvit = devvitBridgeEnabled()
    && !input.adapters?.reddit;

  const publications = await db.externalPublication.findMany({
    where: {
      status: "SCHEDULED",
      ...(redditHandledByDevvit
        ? { platform: { notIn: ["reddit", "Reddit", "REDDIT"] } }
        : {}),
      ...(enabled ? {} : { contentType: "COMMENT" }),
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: 10,
    select: {
      id: true,
      title: true,
      body: true,
      platform: true,
      contentType: true,
      mediaUrl: true,
      engagementTargetId: true,
      engagementTargetUrl: true,
    },
  });

  const outcomes: PublishScheduledResult["outcomes"] = [];
  for (const publication of publications) {
    if (!publication.body?.trim()) {
      const error = "Publication body is empty";
      await db.externalPublication.updateMany({
        where: { id: publication.id, status: "SCHEDULED" },
        data: { status: "FAILED", lastError: error, attemptCount: { increment: 1 } },
      });
      outcomes.push({ id: publication.id, status: "failed", error });
      continue;
    }

    // Claim before the external call. A second worker cannot publish the same
    // row while the first one is waiting for the platform.
    const claimed = await db.externalPublication.updateMany({
      where: { id: publication.id, status: "SCHEDULED" },
      data: { status: "PUBLISHING", attemptCount: { increment: 1 }, lastError: null },
    });
    if (claimed.count === 0) continue;

    try {
      const adapter = adapterFor(publication, input.adapters ?? {});
      const published = await adapter({
        id: publication.id,
        title: publication.title,
        body: publication.body,
        platform: publication.platform,
        contentType: publication.contentType,
        mediaUrl: publication.mediaUrl,
        engagementTargetId: publication.engagementTargetId,
        engagementTargetUrl: publication.engagementTargetUrl,
      });
      await db.externalPublication.update({
        where: { id: publication.id },
        data: {
          status: "PUBLISHED",
          externalPostId: published.externalPostId,
          publicUrl: published.publicUrl,
          publishedAt: now,
          nextReviewAt: new Date(now.getTime() + 7 * DAY_MS),
          lastError: null,
        },
      });
      outcomes.push({ id: publication.id, status: "published" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.externalPublication.update({
        where: { id: publication.id },
        data: { status: "FAILED", lastError: message },
      });
      log.error("marketing.publish_failed", {
        publicationId: publication.id,
        platform: publication.platform,
        error: message,
      });
      outcomes.push({ id: publication.id, status: "failed", error: message });
    }
  }

  return {
    enabled,
    due: publications.length,
    published: outcomes.filter((item) => item.status === "published").length,
    failed: outcomes.filter((item) => item.status === "failed").length,
    outcomes,
  };
}

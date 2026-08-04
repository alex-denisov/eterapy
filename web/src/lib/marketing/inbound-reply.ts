/**
 * B618 — выпуск ответа на входящее.
 *
 * Все пять путей — официальные API площадок от имени бренд-аккаунта. Ответ
 * адресован тому, кто написал нам сам, поэтому он внутри законного периметра
 * B617 везде; чужой публикации здесь нет ни в одном вызове.
 *
 * Модуль отделён от `publish.ts` намеренно: у ответа другой набор адресов
 * (нужен и наш пост, и идентификатор комментария), и смешивать это с выпуском
 * собственных публикаций значит держать в одном файле две разные машины.
 */

import { callTelegramApi } from "@/lib/telegram";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
  requiredMarketingPlatformValue,
  type MarketingPlatform,
} from "@/lib/marketing/platform-settings";
import type { PublishedPost } from "@/lib/marketing/publish";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";

const VK_API_VERSION = "5.199";
const META_GRAPH_VERSION = "v25.0";

export interface InboundReplyTarget {
  platform: string;
  kind: string;
  /** Идентификатор входящего у площадки: комментарий, сообщение, упоминание. */
  externalId: string;
  /** Наш пост, медиа или чат, внутри которого пришло входящее. */
  threadId: string | null;
  permalink: string | null;
}

async function ensureEnabled(platform: MarketingPlatform) {
  if (!await marketingPlatformEnabled(platform)) {
    throw new Error(`${platform} connector is disabled`);
  }
}

async function replyOnVk(input: { body: string; target: InboundReplyTarget }): Promise<PublishedPost> {
  await ensureEnabled("VK");
  const token = await requiredMarketingPlatformValue("VK_COMMUNITY_TOKEN");
  const communityId = (await requiredMarketingPlatformValue("VK_COMMUNITY_ID")).replace(/^-/, "");

  if (input.target.kind === "DIRECT") {
    // Сообщение сообществу: отвечаем в тот же диалог. random_id обязателен —
    // это идемпотентность на стороне VK.
    const peerId = input.target.threadId ?? input.target.externalId;
    const response = await fetch("https://api.vk.com/method/messages.send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: token,
        v: VK_API_VERSION,
        peer_id: peerId,
        random_id: input.target.externalId.replace(/\D/g, "").slice(-9) || "0",
        message: input.body,
      }),
    });
    const payload = await response.json().catch(() => null) as {
      response?: number;
      error?: { error_msg?: string };
    } | null;
    if (!response.ok || typeof payload?.response !== "number") {
      throw new Error(`VK messages.send failed: ${payload?.error?.error_msg ?? `HTTP ${response.status}`}`);
    }
    return {
      externalPostId: String(payload.response),
      publicUrl: `https://vk.com/gim${communityId}?sel=${encodeURIComponent(peerId)}`,
    };
  }

  const match = input.target.threadId?.match(/^(-?\d+)_(\d+)$/)
    ?? input.target.permalink?.match(/wall(-?\d+)_(\d+)/);
  if (!match) throw new Error("VK inbound reply has no wall target");
  const [, ownerId, postId] = match;
  const replyToComment = /^\d+$/.test(input.target.externalId) ? input.target.externalId : null;
  const response = await fetch("https://api.vk.com/method/wall.createComment", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: token,
      v: VK_API_VERSION,
      owner_id: ownerId,
      post_id: postId,
      from_group: communityId,
      message: input.body,
      ...(replyToComment ? { reply_to_comment: replyToComment } : {}),
    }),
  });
  const payload = await response.json().catch(() => null) as {
    response?: { comment_id?: number };
    error?: { error_msg?: string };
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

async function replyOnThreads(input: { body: string; target: InboundReplyTarget }): Promise<PublishedPost> {
  await ensureEnabled("Threads");
  const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("THREADS_USER_ID");
  const create = await fetch(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({
      access_token: token,
      media_type: "TEXT",
      text: input.body,
      reply_to_id: input.target.externalId,
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Threads reply creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Threads reply publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  return {
    externalPostId: published.id,
    publicUrl: `https://www.threads.com/post/${published.id}`,
  };
}

async function replyOnInstagram(input: { body: string; target: InboundReplyTarget }): Promise<PublishedPost> {
  await ensureEnabled("Instagram");
  const token = await requiredMarketingPlatformValue("INSTAGRAM_ACCESS_TOKEN");
  // Официальный путь: ответ на комментарий к СВОЕМУ медиа. Комментировать
  // произвольные чужие публикации этот эндпоинт не умеет, и это правильно.
  const response = await fetch(
    `${metaEndpoint("instagram")}/${META_GRAPH_VERSION}/${encodeURIComponent(input.target.externalId)}/replies`,
    {
      method: "POST",
      headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: new URLSearchParams({ access_token: token, message: input.body }),
    },
  );
  const payload = await response.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(`Instagram comment reply failed: ${payload?.error?.message ?? `HTTP ${response.status}`}`);
  }
  return {
    externalPostId: payload.id,
    publicUrl: input.target.permalink ?? "https://www.instagram.com/",
  };
}

async function replyOnTelegram(input: { body: string; target: InboundReplyTarget }): Promise<PublishedPost> {
  await ensureEnabled("Telegram");
  const chatId = input.target.threadId
    ?? await requiredMarketingPlatformValue("TELEGRAM_DISCUSSION_CHAT_ID");
  const replyToMessageId = Number(input.target.externalId.split(":").at(-1));
  const response = await callTelegramApi<{ message_id?: number; chat?: { username?: string } }>(
    "sendMessage",
    {
      chat_id: chatId,
      text: input.body,
      ...(Number.isFinite(replyToMessageId) ? { reply_to_message_id: replyToMessageId } : {}),
    },
  );
  const messageId = response.result?.message_id;
  if (!response.ok || !messageId) {
    throw new Error(`Telegram discussion reply failed: ${response.description ?? "unknown error"}`);
  }
  const username = response.result?.chat?.username;
  return {
    externalPostId: String(messageId),
    publicUrl: username
      ? `https://t.me/${username}/${messageId}`
      : input.target.permalink ?? `https://t.me/c/${String(chatId).replace(/^-100/, "")}/${messageId}`,
  };
}

async function replyOnReddit(input: { body: string; target: InboundReplyTarget }): Promise<PublishedPost> {
  await ensureEnabled("Reddit");
  const token = await redditAccessToken();
  const thingId = input.target.externalId;
  if (!/^t[13]_[a-z0-9]+$/i.test(thingId)) {
    throw new Error("Reddit inbound reply target is not a comment or post fullname");
  }
  const response = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "ETerapySMM/1.0",
    },
    body: new URLSearchParams({ api_type: "json", thing_id: thingId, text: input.body }),
  });
  const payload = await response.json().catch(() => null) as {
    json?: { errors?: unknown[]; data?: { things?: Array<{ data?: { id?: string; permalink?: string } }> } };
  } | null;
  const errors = payload?.json?.errors ?? [];
  const data = payload?.json?.data?.things?.[0]?.data;
  if (!response.ok || errors.length > 0 || !data?.id) {
    throw new Error(`Reddit api/comment failed: HTTP ${response.status}${errors.length ? ` ${JSON.stringify(errors).slice(0, 300)}` : ""}`);
  }
  return {
    externalPostId: data.id,
    publicUrl: data.permalink
      ? `https://www.reddit.com${data.permalink}`
      : input.target.permalink ?? "https://www.reddit.com",
  };
}

const REPLY_ADAPTERS: Record<string, (input: { body: string; target: InboundReplyTarget }) => Promise<PublishedPost>> = {
  vk: replyOnVk,
  threads: replyOnThreads,
  instagram: replyOnInstagram,
  telegram: replyOnTelegram,
  reddit: replyOnReddit,
};

export function inboundReplySupported(platform: string) {
  return Boolean(REPLY_ADAPTERS[platform.toLowerCase()]);
}

export async function publishInboundReply(input: {
  body: string;
  target: InboundReplyTarget;
}): Promise<PublishedPost> {
  const adapter = REPLY_ADAPTERS[input.target.platform.toLowerCase()];
  if (!adapter) {
    throw new Error(`Unsupported inbound reply platform: ${input.target.platform}`);
  }
  return adapter(input);
}

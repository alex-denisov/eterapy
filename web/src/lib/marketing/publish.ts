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
import { callTelegramApi, callTelegramApiWithPhoto } from "@/lib/telegram";
import { devvitBridgeEnabled } from "@/lib/marketing/devvit-bridge";
import { redditAccessToken } from "@/lib/marketing/reddit-oauth";
import {
  actionForPublication,
  CONVERSATIONAL_CONTENT_TYPES,
  INBOUND_REPLY_CONTENT_TYPE,
  isWithinPerimeter,
} from "@/lib/marketing/perimeter";
import { markInboundAnswered } from "@/lib/marketing/inbound";
import {
  holdChannel,
  holdDecision,
  isChannelLevelPublicationError,
  listChannelHolds,
  releaseChannel,
} from "@/lib/marketing/publish-hold";
import { publishInboundReply, type InboundReplyTarget } from "@/lib/marketing/inbound-reply";
import { notifyPublished } from "@/lib/marketing/publish-notification";
import { publishToMax } from "@/lib/max/client";
import { deferPublicationToNextSlot, isSlotWindowOpen, slotToleranceMs } from "@/lib/marketing/slot-window";
import {
  browserFallbackConfigured,
  publishToDzenBrowser,
} from "@/lib/marketing/browser-publisher";
import { dzenFeedGuid, dzenFeedPublishingEnabled } from "@/lib/marketing/dzen-feed";
import {
  metaEndpoint,
  metaFetchableMediaUrl,
  metaRequestHeaders,
} from "@/lib/marketing/meta-endpoints";
import { assertMetaBrandAccount } from "@/lib/marketing/meta-brand-account";
import {
  marketingPlatformEnabled,
  marketingPlatformValue,
  requiredMarketingPlatformValue,
} from "@/lib/marketing/platform-settings";
import { rejectNonPostWriterOutput } from "@/lib/marketing/writer-output-guard";
import { platformPlaybook } from "@/lib/marketing/platform-playbook";
import {
  DEFAULT_LINK_LABEL,
  compactOwnLinkInBody,
  linkLabelFromBody,
  toPlatformMarkup,
} from "@/lib/marketing/link-presentation";
import { stripHiddenMarkers } from "@/lib/marketing/text-hygiene";

const DAY_MS = 86_400_000;
const VK_API_VERSION = "5.199";
const META_GRAPH_VERSION = "v25.0";

/**
 * B693 — хост Instagram зависит от РОДА маркера, а не от площадки.
 *
 * Маркер Страницы (Facebook Login или системный пользователь бизнес-портфеля)
 * обслуживается `graph.facebook.com`; маркер Instagram Login —
 * `graph.instagram.com`. Это два разных механизма Meta с разными хостами, и
 * перепутать их нельзя: чужой хост отвечает «неверный маркер», а разбор такого
 * отказа уводит к ключам вместо адреса.
 *
 * Умолчание — прежний хост: пока не разобран маркер Страницы, поведение ровно
 * такое, каким было.
 */
async function instagramGraphHost(): Promise<string> {
  const kind = await marketingPlatformValue("INSTAGRAM_TOKEN_KIND").catch(() => null);
  return metaEndpoint(kind?.trim().toLowerCase() === "page" ? "facebook" : "instagram");
}

export function marketingAutopublishEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return env.MARKETING_AUTOPUBLISH === "1"
    || env.MARKETING_AUTOPUBLISH === "true";
}

export interface PublishedPost {
  externalPostId: string;
  /**
   * Публичный адрес материала. Пусто там, где площадка забирает материал сама
   * (лента Дзена, B620): адрес появится после импорта, и придумывать его нельзя.
   */
  publicUrl: string | null;
  /**
   * B642. Материал ушёл, но не целиком тем, чем задумывался — например, без
   * обложки. Это не ошибка (`lastError` остаётся пустым, иначе в кокпите
   * появится ложное «упало»), но и не то, о чём можно промолчать: молчаливая
   * деградация выглядит как норма ровно до дня, когда её замечают со стороны.
   */
  note?: string;
}

export type PublicationAdapter = (
  publication: {
    id: string;
    key: string;
    title: string;
    body: string;
    platform: string;
    contentType: string;
    mediaUrl: string | null;
    engagementTargetId: string | null;
    engagementTargetUrl: string | null;
    /** B618: адрес входящего, если строка — ответ на него. */
    inbound: InboundReplyTarget | null;
    /**
     * B719 — в какой разметке пришло тело.
     *
     * `null` или отсутствие значит «обычный текст», и площадка отправляет его
     * как раньше. Значение появляется только там, где площадка разметку
     * действительно понимает: у Telegram это `parse_mode`, у Reddit — родной
     * формат `selftext`.
     */
    parseMode?: "HTML" | "Markdown" | null;
  },
) => Promise<PublishedPost>;

async function ensurePlatformEnabled(platform: "VK" | "Reddit" | "Threads" | "Instagram" | "Telegram" | "Dzen" | "Max") {
  if (!await marketingPlatformEnabled(platform)) {
    throw new Error(`${platform} connector is disabled`);
  }
}

/** Предел загрузки, общий и для VK, и для Telegram: у обеих площадок он выше. */
const MEDIA_UPLOAD_LIMIT_BYTES = 15 * 1024 * 1024;

/**
 * Обложка публикации, взятая нашим же процессом. Площадкам мы отдаём байты, а
 * не ссылку: у Telegram ссылка на РФ-ноду не работает вовсе (B643), у VK
 * загрузка по ссылке недоступна токену сообщества (B642).
 */
async function downloadPublicationMedia(mediaUrl: string): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
}> {
  const source = await fetch(mediaUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "image/*" },
  });
  const contentType = source.headers.get("content-type") ?? "";
  if (!source.ok || !contentType.startsWith("image/")) {
    throw new Error(`media download failed: HTTP ${source.status}`);
  }
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > MEDIA_UPLOAD_LIMIT_BYTES) {
    throw new Error("media exceeds the 15 MB upload limit");
  }
  return { bytes, contentType, filename: "eterapy-publication.png" };
}

/**
 * B660 — обложка поста VK токеном сообщества. Путь найден живой пробой прода.
 *
 * Стеновой путь (`photos.getWallUploadServer` → `photos.saveWallPhoto`)
 * токену сообщества недоступен: VK отвечает `error_code 27, Group
 * authorization failed: method is unavailable with group auth` — проверено на
 * боевом токене 2026-08-05. Недоступны там же `photos.getUploadServer`
 * (альбом, тот же 27) и `docs.getWallUploadServer` (15). Ссылка вместо
 * картинки тоже закрыта: `wall.post` с `attachments=<url>` отвечает
 * `link_photo_sizing_rule. No photo given` — и для нашей страницы, и для
 * постороннего habr.com, то есть это правило VK для сообществ, а не дефект
 * нашей OG-разметки.
 *
 * А вот путь через диалоговое хранилище токену сообщества ОТКРЫТ:
 * `photos.getMessagesUploadServer(peer_id=0)` → загрузка → `photos.saveMessagesPhoto`
 * возвращает фотографию, владелец которой — само сообщество
 * (`owner_id = -<communityId>`, с `access_key`). Такая фотография принимается
 * в `attachments` у `wall.post`: проба отложенным постом прошла и пост был
 * удалён.
 */
async function vkWallPhotoAttachment(input: {
  token: string;
  communityId: string;
  mediaUrl: string;
}) {
  const { bytes, contentType, filename } = await downloadPublicationMedia(input.mediaUrl);

  const serverResponse = await fetch("https://api.vk.com/method/photos.getMessagesUploadServer", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: input.token,
      v: VK_API_VERSION,
      // Диалог не указываем: хранилище сообщества общее, а сообщение мы не
      // отправляем — берём только сохранённую фотографию.
      peer_id: "0",
    }),
  });
  const serverPayload = await serverResponse.json().catch(() => null) as {
    response?: { upload_url?: string };
    error?: { error_msg?: string };
  } | null;
  const uploadUrl = serverPayload?.response?.upload_url;
  if (!serverResponse.ok || !uploadUrl) {
    throw new Error(`VK photos.getMessagesUploadServer failed: ${serverPayload?.error?.error_msg ?? `HTTP ${serverResponse.status}`}`);
  }

  const form = new FormData();
  form.set("photo", new Blob([bytes], { type: contentType }), filename);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const uploadPayload = await uploadResponse.json().catch(() => null) as {
    server?: number;
    photo?: string;
    hash?: string;
  } | null;
  if (!uploadResponse.ok || !uploadPayload?.server || !uploadPayload.photo || !uploadPayload.hash) {
    throw new Error(`VK photo upload failed: HTTP ${uploadResponse.status}`);
  }

  const saveResponse = await fetch("https://api.vk.com/method/photos.saveMessagesPhoto", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: input.token,
      v: VK_API_VERSION,
      server: String(uploadPayload.server),
      photo: uploadPayload.photo,
      hash: uploadPayload.hash,
    }),
  });
  const savePayload = await saveResponse.json().catch(() => null) as {
    response?: Array<{ owner_id?: number; id?: number; access_key?: string }>;
    error?: { error_msg?: string };
  } | null;
  const photo = savePayload?.response?.[0];
  if (!saveResponse.ok || !photo?.owner_id || !photo.id) {
    throw new Error(`VK photos.saveMessagesPhoto failed: ${savePayload?.error?.error_msg ?? `HTTP ${saveResponse.status}`}`);
  }
  return `photo${photo.owner_id}_${photo.id}${photo.access_key ? `_${photo.access_key}` : ""}`;
}

export async function publishToVk(
  publication: { body: string; mediaUrl?: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("VK");
  const token = await requiredMarketingPlatformValue("VK_COMMUNITY_TOKEN");
  const communityId = (await requiredMarketingPlatformValue("VK_COMMUNITY_ID")).replace(/^-/, "");
  if (!/^\d+$/.test(communityId)) {
    throw new Error("VK_COMMUNITY_ID must be numeric");
  }

  // B660 вернул обложку (путь через диалоговое хранилище — см. комментарий у
  // `vkWallPhotoAttachment`). Мягкая деградация из B642 остаётся: если VK
  // однажды закроет и этот путь, пост уходит текстом с причиной в реестре, а
  // не теряется целиком — 03.08 так были потеряны два материала.
  let attachment: string | null = null;
  let note: string | undefined;
  if (publication.mediaUrl) {
    try {
      attachment = await vkWallPhotoAttachment({ token, communityId, mediaUrl: publication.mediaUrl });
    } catch (error) {
      note = `VK: обложка не приложена (${error instanceof Error ? error.message : String(error)}). Пост ушёл текстом.`;
      console.warn(note);
    }
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
      ...(attachment ? { attachments: attachment } : {}),
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
    note,
  };
}

export async function publishToTelegram(
  publication: { body: string; mediaUrl?: string | null; parseMode?: "HTML" | "Markdown" | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Telegram");
  const channelId = await requiredMarketingPlatformValue("TELEGRAM_CHANNEL_ID");
  if (publication.mediaUrl && publication.body.length > 1_024) {
    throw new Error("Telegram media caption exceeds 1024 characters");
  }

  // B643 — обложку доносим байтами. Ссылку на нашу ноду Telegram не забирает:
  // подробности и доказательство — в `callTelegramApiWithPhoto`.
  //
  // Разъехаться картинке и посту здесь нельзя: если своя же картинка почему-то
  // не отдалась, материал уходит текстом, а причина едет в реестр. Тот же
  // размен, что у VK в B642: пост важнее обложки.
  let photo: { bytes: ArrayBuffer; filename: string; contentType: string } | null = null;
  let note: string | undefined;
  if (publication.mediaUrl) {
    try {
      photo = await downloadPublicationMedia(publication.mediaUrl);
    } catch (error) {
      note = `Telegram: обложка не приложена (${error instanceof Error ? error.message : String(error)}). Пост ушёл текстом.`;
      console.warn(note);
    }
  }

  const method = photo ? "sendPhoto" : "sendMessage";
  const response = photo
    ? await callTelegramApiWithPhoto<{
      message_id?: number;
      chat?: { username?: string };
    }>("sendPhoto", {
      chat_id: channelId,
      caption: publication.body,
      show_caption_above_media: "false",
      ...(publication.parseMode ? { parse_mode: publication.parseMode } : {}),
    }, photo)
    : await callTelegramApi<{
      message_id?: number;
      chat?: { username?: string };
    }>("sendMessage", {
      chat_id: channelId,
      text: publication.body,
      disable_web_page_preview: false,
      ...(publication.parseMode ? { parse_mode: publication.parseMode } : {}),
    });
  const messageId = response.result?.message_id;
  if (!response.ok || !messageId) {
    throw new Error(`Telegram ${method} failed: ${response.description ?? "unknown error"}`);
  }

  const username = response.result?.chat?.username ?? channelId.replace(/^@/, "");
  return {
    externalPostId: String(messageId),
    publicUrl: username
      ? `https://t.me/${username}/${messageId}`
      : `https://t.me/c/${String(channelId).replace(/^-100/, "")}/${messageId}`,
    note,
  };
}

async function publishRedditCommentApi(
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

export async function publishRedditComment(
  publication: {
    title?: string;
    body: string;
    mediaUrl?: string | null;
    engagementTargetId: string | null;
    engagementTargetUrl?: string | null;
  },
): Promise<PublishedPost> {
  // B617: только официальный API. Браузерная сессия убрана вместе с режимом
  // комментирования чужих постов; ответы на входящее (B618) пойдут тем же
  // API-путём.
  return publishRedditCommentApi(publication);
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
  // B682: публикуем только от брендовой страницы, см. meta-brand-account.ts
  await assertMetaBrandAccount({ platform: "threads", token, userId });
  if (!publication.engagementTargetId) throw new Error("Threads target media id is missing");
  const create = await fetch(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
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

export async function publishToThreads(
  publication: { body: string; mediaUrl?: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Threads");
  const token = await requiredMarketingPlatformValue("THREADS_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("THREADS_USER_ID");
  // B682: публикуем только от брендовой страницы, см. meta-brand-account.ts
  await assertMetaBrandAccount({ platform: "threads", token, userId });
  const create = await fetch(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({
      access_token: token,
      media_type: publication.mediaUrl ? "IMAGE" : "TEXT",
      text: publication.body,
      // B704: за обложкой приходит сама площадка, а до российского адреса её
      // скачиватель не доходит — называем имя за Cloudflare.
      ...(publication.mediaUrl ? { image_url: metaFetchableMediaUrl(publication.mediaUrl) } : {}),
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Threads post creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`${metaEndpoint("threads")}/v1.0/${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Threads post publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  return {
    externalPostId: published.id,
    publicUrl: `https://www.threads.com/post/${published.id}`,
  };
}

async function publishToRedditApi(
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

// B617: браузерный запасной путь у Reddit убран. Вход по сохранённой сессии —
// ровно то, что правила площадок называют нарушением, а у Reddit есть OAuth:
// обходить нечего. Нет доступа по API — публикация честно не выходит.
export async function publishToReddit(
  publication: { title: string; body: string; mediaUrl?: string | null },
): Promise<PublishedPost> {
  return publishToRedditApi(publication);
}

/**
 * B620: у Дзена два пути — размеченная лента и браузерная сессия.
 *
 * Лента — это pull: адрес публикации появляется, когда Дзен импортирует
 * материал, а не в момент передачи. Поэтому `publicUrl` здесь пустой, а не
 * выдуманный: сочинённая ссылка на несуществующую страницу — это ложь в
 * реестре, и по ней потом считали бы переходы.
 *
 * ⚠ B642 — ПОЧЕМУ ЛЕНТА ТЕПЕРЬ ПУТЬ ПО УМОЛЧАНИЮ, А НЕ НАГРАДА ЗА ПОДТВЕРЖДЕНИЕ.
 *
 * Прежний порядок был замкнутым кругом. Материал попадал в ленту только при
 * `DZEN_FEED_CONFIRMED = true`. Этот признак владелец ставит после того, как
 * Дзен принял ленту. А Дзен принимает ленту только при десяти материалах в
 * ней. То есть лента не могла наполниться никогда: на 03.08 в ней было ноль
 * материалов, три висели в SCHEDULED, двенадцать в FAILED, а браузерный путь
 * падал на «DZEN_BROWSER_STORAGE_STATE is not configured».
 *
 * Правильный порядок обратный: лента наполняется всегда, а признак
 * подтверждения означает ровно одно — «браузерный путь больше не нужен».
 *
 * ⚠ B698 — И ЭТО ТОЖЕ ОКАЗАЛОСЬ НЕВЕРНО. Владелец 2026-08-07: порог площадки —
 * не десять материалов В ЛЕНТЕ, а десять ПОДПИСЧИКОВ канала. Их нет, и до тех
 * пор лента не доставляет читателю ничего: всё, что через неё «выпущено», не
 * увидел никто. Замер прода это подтвердил — у строк, ушедших лентой, нет
 * публичного адреса вообще.
 *
 * Поэтому порядок теперь простой и без развилок по подтверждению:
 *
 *   браузерная сессия настроена → выпускаем ею;
 *   иначе включён выпуск лентой → отдаём в ленту;
 *   иначе — отказ, и это ТЕХНИЧЕСКИЙ отказ конфигурации, а не брак материала:
 *   слот такая строка не жжёт (B695).
 *
 * Лента из кода не удалена: к ней возвращаются, когда подписчиков станет 10 —
 * тогда владелец ставит `DZEN_FEED_PUBLISHING_ENABLED`.
 */
export async function publishToDzen(
  publication: { key?: string; title: string; body: string; mediaUrl: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Dzen");
  if (await browserFallbackConfigured("Dzen")) {
    return publishToDzenBrowser(publication);
  }
  if (await dzenFeedPublishingEnabled()) {
    if (!publication.key) throw new Error("Dzen feed publication has no registry key");
    return { externalPostId: dzenFeedGuid(publication.key), publicUrl: null };
  }
  // Формулировка не косметическая: по маркеру `is not configured` этот отказ
  // распознаётся как ОТКАЗ КАНАЛА (B636) — площадка встаёт на паузу, а строки
  // остаются `SCHEDULED` и слот не жгут. Без него настроечная проблема
  // архивировала бы годный материал (класс B695).
  throw new Error(
    "Dzen connector is not configured: браузерная сессия не настроена, а выпуск "
    + "лентой выключен (порог площадки — 10 подписчиков канала). "
    + "Пройдите подключение в «Площадки и возможности».",
  );
}

export async function publishToInstagram(
  publication: { body: string; mediaUrl: string | null },
): Promise<PublishedPost> {
  await ensurePlatformEnabled("Instagram");
  const token = await requiredMarketingPlatformValue("INSTAGRAM_ACCESS_TOKEN");
  const userId = await requiredMarketingPlatformValue("INSTAGRAM_USER_ID");
  // B693: род маркера решает ХОСТ. Маркер Страницы (Facebook Login или
  // системный пользователь) работает через graph.facebook.com; маркер Instagram
  // Login — через graph.instagram.com. Перепутать их нельзя: чужой хост
  // отвечает «неверный маркер», и разбор уходит не туда.
  const host = await instagramGraphHost();
  // B682: публикуем только от брендовой страницы, см. meta-brand-account.ts
  await assertMetaBrandAccount({ platform: "instagram", token, userId });
  if (!publication.mediaUrl || !/^https:\/\//i.test(publication.mediaUrl)) {
    throw new Error("Instagram requires a public HTTPS mediaUrl");
  }
  const create = await fetch(`${host}/${META_GRAPH_VERSION}/${encodeURIComponent(userId)}/media`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({
      access_token: token,
      // B704: см. пояснение к `metaFetchableMediaUrl`. Для Instagram это не
      // улучшение, а условие работы: без `image_url` площадка не публикуется
      // вовсе, а российское имя её скачиватель не берёт.
      image_url: metaFetchableMediaUrl(publication.mediaUrl),
      caption: stripHiddenMarkers(publication.body),
    }),
  });
  const created = await create.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!create.ok || !created?.id) {
    throw new Error(`Instagram media creation failed: ${created?.error?.message ?? `HTTP ${create.status}`}`);
  }
  const publish = await fetch(`${host}/${META_GRAPH_VERSION}/${encodeURIComponent(userId)}/media_publish`, {
    method: "POST",
    headers: metaRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ access_token: token, creation_id: created.id }),
  });
  const published = await publish.json().catch(() => null) as { id?: string; error?: { message?: string } } | null;
  if (!publish.ok || !published?.id) {
    throw new Error(`Instagram media publish failed: ${published?.error?.message ?? `HTTP ${publish.status}`}`);
  }
  const permalinkResponse = await fetch(
    `${host}/${META_GRAPH_VERSION}/${encodeURIComponent(published.id)}?fields=permalink&access_token=${encodeURIComponent(token)}`,
    { headers: metaRequestHeaders() },
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
  // B618: ответ на входящее адресован не площадке вообще, а конкретному
  // комментарию/сообщению, поэтому у него свой набор адаптеров.
  if (publication.contentType === INBOUND_REPLY_CONTENT_TYPE) {
    return async (row) => {
      if (!row.inbound) throw new Error("Inbound reply lost its target");
      return publishInboundReply({ body: row.body, target: row.inbound });
    };
  }
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
  if (normalized === "dzen") return publishToDzen;
  if (normalized === "max") return publishToMax;
  throw new Error(`Unsupported publication platform: ${publication.platform}`);
}

export interface PublishScheduledResult {
  enabled: boolean;
  due: number;
  published: number;
  failed: number;
  /** B636: строки, которых не коснулись, потому что их канал на паузе. */
  held: number;
  heldPlatforms: string[];
  /** B645: строки, переехавшие в следующий слот вместо выпуска задним числом. */
  deferred: number;
  /**
   * B713: строки, которые рубеж выпуска вернул на склад. Считаются отдельно от
   * `failed` намеренно — это не брак материала, а брак ответа модели, и в
   * сводке эти два числа отвечают на разные вопросы.
   */
  returned: number;
  outcomes: Array<{
    id: string;
    status: "published" | "failed" | "held" | "deferred" | "returned";
    error?: string;
    slot?: string;
  }>;
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
      // Мост Devvit забирает у нас ТОЛЬКО собственные посты Reddit. Ответы на
      // входящее он не умеет, и исключать их вместе с постами значило бы
      // оставить человека без ответа молча — ровно тот класс тишины, из-за
      // которого появился сторож очереди (B618).
      ...(redditHandledByDevvit
        ? { NOT: { platform: { in: ["reddit", "Reddit", "REDDIT"] }, contentType: "POST" } }
        : {}),
      // Премодерированный разговорный материал (комментарий и ответ на
      // входящее) выпускается независимо от общего выключателя автопубликации:
      // человек уже нажал «Принять» по конкретному тексту.
      ...(enabled ? {} : { contentType: { in: [...CONVERSATIONAL_CONTENT_TYPES] } }),
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: 10,
    select: {
      id: true,
      key: true,
      title: true,
      body: true,
      platform: true,
      contentType: true,
      mediaUrl: true,
      // B642: заметка о неполном выпуске дописывается к существующей, поэтому
      // её надо прочитать до записи.
      notes: true,
      // B645: окно слота и счётчик переносов — по ним решается, выходит
      // материал сейчас или переезжает в следующий слот своего канала.
      planSlot: true,
      scheduledFor: true,
      deferralCount: true,
      engagementTargetId: true,
      engagementTargetUrl: true,
      // B653: поля карточки «опубликовано». Читаются здесь, а не отдельным
      // запросом после выпуска: карточка не должна ходить в базу за тем, что
      // уже было в руках.
      channelName: true,
      destinationUrl: true,
      cluster: true,
      targetQuery: true,
      engagementTargetLabel: true,
      engagementExcerpt: true,
      engagementTone: true,
      inboundReplyToId: true,
      inboundReplyTo: {
        select: {
          platform: true,
          kind: true,
          externalId: true,
          threadId: true,
          permalink: true,
        },
      },
    },
  });

  // B636: пауза канала читается ОДИН раз на проход. Перечитывать её внутри
  // цикла значило бы дать второму разведчику уйти в тот же проход, пока первый
  // ещё висит на сетевом таймауте.
  const holds = new Map(
    (await listChannelHolds().catch(() => [])).map((hold) => [hold.platform, hold]),
  );
  const probeSpent = new Set<string>();
  const outcomes: PublishScheduledResult["outcomes"] = [];
  for (const publication of publications) {
    const platformKey = publication.platform.toLowerCase();

    // B645 — ОКНО СЛОТА. Плановый материал, чьё окно закрылось, наружу задним
    // числом не идёт: «утренняя символическая карточка» в 23:40 обесценивает
    // сам формат, заданный временем суток. Материал не отменяется и не
    // архивируется — он переезжает в следующий слот своего канала.
    //
    // Проверка стоит ПЕРЕД паузой канала намеренно. Причина, по которой слот
    // пропущен, роли не играет: замер прода 2026-08-03 показал материал
    // Instagram, простоявший двое суток на паузе канала и обречённый выйти в
    // произвольную минуту возврата доступа. Перенос ничего не отменяет (B636
    // цел: строка остаётся в очереди), он лишь возвращает материалу
    // осмысленное время.
    //
    // Если переносить некуда или право на перенос исчерпано, материал всё
    // равно выходит: правило B636 «поздно честнее, чем никогда» сильнее
    // аккуратности расписания.
    if (publication.planSlot && !isSlotWindowOpen({
      scheduledFor: publication.scheduledFor,
      now,
      // B700 фаза 4: ширину окна назначил класс материала, а не общая константа.
      toleranceMs: slotToleranceMs(publication.notes),
    })) {
      const deferral = await deferPublicationToNextSlot({
        publication,
        now,
        reason: `Окно слота ${publication.planSlot} закрылось до выпуска.`,
        nextStatus: "SCHEDULED",
      }).catch(() => ({ deferred: false } as const));
      if (deferral.deferred) {
        outcomes.push({ id: publication.id, status: "deferred", slot: deferral.slot });
        continue;
      }
    }

    const decision = holdDecision({
      hold: holds.get(platformKey) ?? null,
      now,
      probeSpent: probeSpent.has(platformKey),
    });
    if (decision === "hold") {
      // Строка НЕ трогается вовсе: остаётся `SCHEDULED` со своим временем и
      // выйдет сама, как только канал вернётся. Ни отмены, ни архива.
      outcomes.push({ id: publication.id, status: "held" });
      continue;
    }
    if (decision === "probe") probeSpent.add(platformKey);

    if (!publication.body?.trim()) {
      const error = "Publication body is empty";
      await db.externalPublication.updateMany({
        where: { id: publication.id, status: "SCHEDULED" },
        data: { status: "FAILED", lastError: error, attemptCount: { increment: 1 } },
      });
      outcomes.push({ id: publication.id, status: "failed", error });
      continue;
    }

    const connectorPlatform = ({
      vk: "VK",
      reddit: "Reddit",
      threads: "Threads",
      instagram: "Instagram",
      telegram: "Telegram",
      dzen: "Dzen",
      max: "Max",
    } as const)[publication.platform.toLowerCase() as "vk" | "reddit" | "threads" | "instagram" | "telegram" | "dzen" | "max"];
    const normalizedPlatform = publication.platform.toLowerCase();
    if (
      connectorPlatform
      && !input.adapters?.[normalizedPlatform]
      && !await marketingPlatformEnabled(connectorPlatform)
    ) {
      // Keep the row scheduled. Saving and enabling connector settings makes
      // the next worker tick pick it up without a deploy or a false incident.
      continue;
    }

    // B617: строка, адресованная чужой публикации, наружу не идёт никогда — ни
    // из старой очереди, ни по ошибке разработчика. Архивируем с причиной,
    // вместо того чтобы удалять: след решения должен остаться.
    const action = actionForPublication({
      contentType: publication.contentType,
      engagementTargetId: publication.engagementTargetId,
      inboundReplyToId: publication.inboundReplyToId,
    });
    if (!isWithinPerimeter(action)) {
      await db.externalPublication.updateMany({
        where: { id: publication.id, status: "SCHEDULED" },
        data: {
          status: "ARCHIVED",
          autoPublish: false,
          lastError: "OUT_OF_PERIMETER_B617",
        },
      });
      outcomes.push({ id: publication.id, status: "failed", error: "OUT_OF_PERIMETER_B617" });
      continue;
    }

    /**
     * B713 §1 — РУБЕЖ ПЕРЕД ОТПРАВКОЙ НАРУЖУ.
     *
     * Страж B705 стоит на разборе ответа автора и проверяет то, что вернула
     * модель. Здесь проверяется то, что РЕАЛЬНО УЙДЁТ на площадку, и разница
     * между этими двумя точками стоила бренду поста `t.me/eterapy/19`:
     * материал одобрили 16.08 в 01:04 UTC, страж поднялся в 12:43 UTC, лог
     * рассуждений ушёл в канал 17.08. Правило, появившееся позже одобрения,
     * не действует на склад одобренного — и так будет с КАЖДЫМ следующим
     * правилом, пока рубеж не стоит на самой границе.
     *
     * ⚠ ОТКАЗ ЗДЕСЬ — НЕ БРАК МАТЕРИАЛА, а брак текста, который написала
     * модель. Строка возвращается на склад (`DRAFT`), попытка ей не
     * засчитывается: тема и план ни при чём, судить их не за что (B695).
     * Проверка идёт ДО claim именно поэтому — claim увеличивает `attemptCount`.
     */
    const sanitizedBody = stripHiddenMarkers(publication.body ?? "");
    const notAPost = rejectNonPostWriterOutput(sanitizedBody);
    if (notAPost) {
      await db.externalPublication.updateMany({
        where: { id: publication.id, status: "SCHEDULED" },
        data: {
          status: "DRAFT",
          lastError: `Рубеж выпуска не пропустил текст (${notAPost.rule}): ${notAPost.reason}. `
            + "Материал возвращён на склад — виноват ответ модели, а не тема.",
        },
      });
      log.warn("marketing.publish_gate_rejected_body", {
        publicationId: publication.id,
        platform: publication.platform,
        rule: notAPost.rule,
      });
      outcomes.push({ id: publication.id, status: "returned", error: notAPost.rule });
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
      /**
       * B719 — АДРЕС ПРЯЧЕТСЯ ПОД ТЕКСТ ЗДЕСЬ, А НЕ В ТЕЛЕ МАТЕРИАЛА.
       *
       * В реестре материал живёт ПЛОСКИМ текстом, и это не случайность:
       * плоский текст читают премодерация в Telegram, карточка «опубликовано»
       * и сводки, а разметка нужна ровно одной площадке в момент отправки.
       * Хранить размеченный текст значило бы показывать человеку на
       * премодерации `<a href="…">` вместо поста.
       *
       * Перевод — за один шаг перед отправкой, и он безопасно возвращает
       * `null`, если переводить нечего: тогда уходит ровно то, что уходило
       * раньше.
       */
      const compacted = compactOwnLinkInBody(sanitizedBody, publication.destinationUrl);
      const markup = toPlatformMarkup({
        markup: platformPlaybook(publication.platform).contract.inlineLinkMarkup,
        body: compacted,
        url: publication.destinationUrl,
        label: publication.destinationUrl
          ? linkLabelFromBody(compacted, publication.destinationUrl)
          : DEFAULT_LINK_LABEL,
      });
      const published = await adapter({
        id: publication.id,
        key: publication.key,
        title: publication.title,
        body: stripHiddenMarkers(markup?.text ?? compacted),
        parseMode: markup?.parseMode ?? null,
        platform: publication.platform,
        contentType: publication.contentType,
        mediaUrl: publication.mediaUrl,
        engagementTargetId: publication.engagementTargetId,
        engagementTargetUrl: publication.engagementTargetUrl,
        inbound: publication.inboundReplyTo ?? null,
      });
      /**
       * ⚠ ОТПРАВКА УЖЕ СОСТОЯЛАСЬ — ОТМЕНИТЬ ЕЁ НЕЛЬЗЯ. Всё, что падает ниже,
       * это учёт, и он не имеет права превратить доставленное в «неудачу».
       *
       * Живой случай 2026-08-08: второй ответ одному и тому же человеку в VK
       * ушёл, а запись упала на `Unique constraint failed on the fields:
       * (public_url)` — адрес диалога у всех ответов один. Материал ушёл в
       * архив, входящее осталось «требует ответа», а человек ответ УЖЕ получил.
       * Тот же класс, что B694: побочное действие не должно решать судьбу
       * основной операции.
       */
      const publishedData = {
        status: "PUBLISHED" as const,
        externalPostId: published.externalPostId,
        publishedAt: now,
        nextReviewAt: new Date(now.getTime() + 7 * DAY_MS),
        lastError: null,
        // `undefined` в Prisma означает «не трогать поле»: заметка
        // дописывается к существующей, а не затирает её.
        notes: published.note
          ? [publication.notes, published.note].filter(Boolean).join("\n")
          : undefined,
      };
      try {
        await db.externalPublication.update({
          where: { id: publication.id },
          data: { ...publishedData, publicUrl: published.publicUrl },
        });
      } catch (error) {
        const collision = typeof error === "object" && error !== null
          && (error as { code?: string }).code === "P2002";
        if (!collision) throw error;
        // Адрес занят другой строкой — записываем выпуск без него. Потерять
        // адрес не страшно, потерять факт доставки — страшно.
        log.warn("marketing.publish_url_collision", {
          publicationId: publication.id,
          platform: publication.platform,
          publicUrl: published.publicUrl,
        });
        await db.externalPublication.update({
          where: { id: publication.id },
          data: {
            ...publishedData,
            publicUrl: null,
            notes: [publishedData.notes ?? publication.notes, `Адрес ${published.publicUrl} уже занят другой строкой реестра`]
              .filter(Boolean).join("\n"),
          },
        });
      }

      // B722: Автоматическое зеркалирование Telegram-постов в MAX канал (platform-api2.max.ru)
      if (normalizedPlatform === "telegram" && (await marketingPlatformEnabled("Max"))) {
        try {
          const maxAdapter = input.adapters?.max ?? publishToMax;
          const maxPublished = await maxAdapter({
            id: publication.id,
            key: publication.key,
            title: publication.title,
            body: markup?.text ?? compacted,
            platform: "max",
            contentType: publication.contentType,
            mediaUrl: publication.mediaUrl,
            engagementTargetId: publication.engagementTargetId,
            engagementTargetUrl: publication.engagementTargetUrl,
            inbound: publication.inboundReplyTo ?? null,
            parseMode: markup?.parseMode ?? null,
          });
          if (maxPublished.publicUrl) {
            await db.externalPublication.update({
              where: { id: publication.id },
              data: {
                notes: [publishedData.notes ?? publication.notes, `MAX: ${maxPublished.publicUrl}`]
                  .filter(Boolean)
                  .join("\n"),
              },
            }).catch(() => null);
          }
          log.info("marketing.telegram_mirrored_to_max", {
            publicationId: publication.id,
            maxPostId: maxPublished.externalPostId,
            maxUrl: maxPublished.publicUrl,
          });
        } catch (maxErr) {
          log.warn("marketing.telegram_mirror_to_max_failed", {
            publicationId: publication.id,
            error: maxErr instanceof Error ? maxErr.message : String(maxErr),
          });
        }
      }

      // B653: владелец узнаёт о выпуске в тот же момент, что и площадка.
      //
      // ⚠ Место выбрано не случайно: сюда попадает ровно один воркер и ровно
      // один раз — строку в `PUBLISHING` уже забрал claim выше, поэтому
      // повторный проход по опубликованной записи карточку не продублирует.
      // Отдельная колонка «уведомили» для этого не нужна.
      //
      // ⚠ СОБСТВЕННЫЙ try/catch, и он обязателен. Материал в этой точке УЖЕ на
      // площадке. Всё, что здесь бросит, поймает внешний catch и запишет
      // строку `FAILED` — то есть вышедшая публикация числилась бы несостоявшейся,
      // а очередь попыталась бы выпустить её повторно. Ровно этот класс ошибки
      // ловил B636: сбой доставки уведомления не имеет права выглядеть как отказ
      // публикации.
      //
      // ⚠ И данные берём из `publication` + уже известного результата адаптера,
      // а НЕ из возвращаемого значения `update`. Уведомление не должно зависеть
      // от того, что именно вернул слой доступа к данным.
      try {
        await notifyPublished({
          platform: publication.platform,
          channelName: publication.channelName,
          contentType: publication.contentType,
          title: publication.title,
          body: publication.body,
          publicUrl: published.publicUrl,
          destinationUrl: publication.destinationUrl,
          cluster: publication.cluster,
          targetQuery: publication.targetQuery,
          engagementTargetLabel: publication.engagementTargetLabel,
          engagementTargetUrl: publication.engagementTargetUrl,
          engagementExcerpt: publication.engagementExcerpt,
          engagementTone: publication.engagementTone,
          publishedAt: now,
        });
      } catch (error) {
        log.error("marketing.publish_notify_crashed", {
          publicationId: publication.id,
          platform: publication.platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      // Входящее закрывается только фактом ушедшего ответа: пока ответ не
      // отправлен, человек ждёт, и сторож должен это видеть.
      if (publication.inboundReplyToId) {
        await markInboundAnswered(publication.inboundReplyToId, now).catch(() => undefined);
      }
      // Прошедшая публикация — единственное честное доказательство, что доступ
      // к каналу вернулся. Снимаем паузу здесь, а не по отдельной пробе.
      if (holds.has(platformKey)) {
        await releaseChannel(platformKey).catch(() => undefined);
        holds.delete(platformKey);
        probeSpent.delete(platformKey);
      }
      outcomes.push({ id: publication.id, status: "published" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isChannelLevelPublicationError(message)) {
        // Упал канал, а не материал. Строка возвращается ровно туда, где была:
        // `SCHEDULED`, со своим временем, без отмены и без архива. Счётчик
        // попыток откатывается вместе с ней — иначе пауза канала съедала бы
        // лимит попыток материала, который ни в чём не виноват.
        await db.externalPublication.updateMany({
          where: { id: publication.id, status: "PUBLISHING" },
          data: {
            status: "SCHEDULED",
            attemptCount: { decrement: 1 },
            lastError: `Канал недоступен, публикация отложена: ${message}`,
          },
        });
        const hold = await holdChannel({
          platform: publication.platform,
          reason: message,
          now,
          previous: holds.get(platformKey) ?? null,
        }).catch(() => null);
        if (hold) holds.set(platformKey, hold);
        probeSpent.add(platformKey);
        log.warn("marketing.publish_channel_error", {
          publicationId: publication.id,
          platform: publication.platform,
          error: message,
        });
        outcomes.push({ id: publication.id, status: "held", error: message });
        continue;
      }
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
    held: outcomes.filter((item) => item.status === "held").length,
    heldPlatforms: [...holds.keys()],
    deferred: outcomes.filter((item) => item.status === "deferred").length,
    returned: outcomes.filter((item) => item.status === "returned").length,
    outcomes,
  };
}

export { publishToMax } from "@/lib/max/client";

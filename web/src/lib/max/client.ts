import https from "node:https";
import { getMaxHttpsAgent } from "./certificates";
import {
  marketingPlatformEnabled,
  requiredMarketingPlatformValue,
} from "@/lib/marketing/platform-settings";
import { log } from "@/lib/logger";

async function downloadMedia(mediaUrl: string): Promise<{
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
  if (bytes.byteLength > 15 * 1024 * 1024) {
    throw new Error("media exceeds 15 MB upload limit");
  }
  return { bytes, contentType, filename: "eterapy-publication.png" };
}

export interface PublishedPost {
  externalPostId: string;
  publicUrl: string;
  note?: string;
}

const MAX_API_HOST = "platform-api2.max.ru";

let cachedResolvedChatId: number | null = null;

interface MaxChat {
  chat_id: number;
  type: string;
  title: string;
  link?: string;
}

interface MaxUploadInitResponse {
  url: string;
  token?: string;
}

interface MaxSendMessageResponse {
  message?: {
    recipient?: { chat_type?: string; chat_id?: number };
    body?: { mid?: string; seq?: number; text?: string };
    url?: string;
  };
  code?: string;
  message_text?: string;
}

function requestMaxApi<T>(options: {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  token: string;
  body?: unknown;
  contentType?: string;
  rawBody?: Buffer;
}): Promise<{ status: number; data: T }> {
  const agent = getMaxHttpsAgent();
  const method = options.method ?? (options.body || options.rawBody ? "POST" : "GET");
  const headers: Record<string, string | number> = {
    Authorization: options.token,
  };

  let payload: Buffer | null = null;
  if (options.rawBody) {
    payload = options.rawBody;
    if (options.contentType) headers["Content-Type"] = options.contentType;
    headers["Content-Length"] = payload.length;
  } else if (options.body !== undefined) {
    const jsonStr = JSON.stringify(options.body);
    payload = Buffer.from(jsonStr, "utf-8");
    headers["Content-Type"] = options.contentType ?? "application/json";
    headers["Content-Length"] = payload.length;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: MAX_API_HOST,
        path: options.path,
        method,
        agent,
        headers,
      },
      (res) => {
        let responseData = "";
        res.on("data", (chunk) => {
          responseData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : ({} as T);
            resolve({ status: res.statusCode ?? 500, data: parsed });
          } catch {
            resolve({
              status: res.statusCode ?? 500,
              data: { raw: responseData } as unknown as T,
            });
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Разрешает канал/чат MAX в числовой идентификатор.
 * MAX Bot API строго требует числовой chat_id для отправки сообщений.
 */
export async function resolveMaxNumericChatId(
  chatIdOrUsername: string,
  token: string,
): Promise<number> {
  const clean = chatIdOrUsername.trim();
  if (/^-?\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }

  if (cachedResolvedChatId !== null) {
    return cachedResolvedChatId;
  }

  try {
    const { status, data } = await requestMaxApi<{ chats?: MaxChat[] }>({
      path: "/chats",
      token,
    });

    if (status === 200 && Array.isArray(data.chats)) {
      const match = data.chats.find((chat) => {
        if (chat.link && (chat.link.includes(clean) || clean.includes(chat.link))) {
          return true;
        }
        return false;
      });

      if (match) {
        cachedResolvedChatId = match.chat_id;
        return match.chat_id;
      }
    }
  } catch (err) {
    log.warn("max.resolve_chat_id_failed", {
      chatIdOrUsername,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const num = parseInt(clean, 10);
  if (!isNaN(num)) return num;
  throw new Error(`Cannot resolve MAX numeric chat_id for "${chatIdOrUsername}"`);
}

/**
 * Загрузка изображения на сервер MAX для прикрепления к сообщению.
 */
async function uploadMaxImage(
  mediaUrl: string,
  token: string,
): Promise<string | null> {
  try {
    const photo = await downloadMedia(mediaUrl);
    const { status, data } = await requestMaxApi<MaxUploadInitResponse>({
      path: "/uploads?type=image",
      method: "POST",
      token,
    });

    if (status !== 200 || !data.url) {
      return null;
    }

    const uploadUrl = new URL(data.url);
    const boundary = `----MaxFormBoundary${Date.now()}`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="${photo.filename}"\r\nContent-Type: ${photo.contentType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const multipartBody = Buffer.concat([
      header,
      Buffer.from(photo.bytes),
      footer,
    ]);

    const uploadResult = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
      const req = https.request(
        {
          hostname: uploadUrl.hostname,
          path: `${uploadUrl.pathname}${uploadUrl.search}`,
          method: "POST",
          agent: getMaxHttpsAgent(),
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": multipartBody.length,
          },
        },
        (res) => {
          let resData = "";
          res.on("data", (chunk) => {
            resData += chunk;
          });
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode ?? 500,
                data: resData ? JSON.parse(resData) : {},
              });
            } catch {
              resolve({ status: res.statusCode ?? 500, data: resData });
            }
          });
        },
      );
      req.on("error", reject);
      req.write(multipartBody);
      req.end();
    });

    if (uploadResult.status === 200) {
      const resp = uploadResult.data as { token?: string; photos?: Record<string, { token?: string }> };
      if (resp.token) return resp.token;
      if (resp.photos) {
        const first = Object.values(resp.photos)[0];
        if (first?.token) return first.token;
      }
      if (data.token) return data.token;
    }
  } catch (err) {
    log.warn("max.upload_image_failed", {
      mediaUrl,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}

export interface SendMaxMessageOptions {
  text: string;
  format?: "html" | "markdown";
  mediaUrl?: string | null;
  chatId?: string | number;
  token?: string;
}

/**
 * Отправка сообщения в MAX мессенджер через официальный Bot API.
 */
export async function sendMaxMessage(
  options: SendMaxMessageOptions,
): Promise<PublishedPost> {
  const token = options.token ?? (await requiredMarketingPlatformValue("MAX_BOT_TOKEN"));
  const configuredChatId =
    options.chatId !== undefined
      ? String(options.chatId)
      : await requiredMarketingPlatformValue("MAX_CHANNEL_ID");

  const numericChatId = await resolveMaxNumericChatId(configuredChatId, token);

  let note: string | undefined;
  const attachments: Array<{ type: "image"; payload: { token: string } }> = [];

  if (options.mediaUrl) {
    try {
      const imageToken = await uploadMaxImage(options.mediaUrl, token);
      if (imageToken) {
        attachments.push({ type: "image", payload: { token: imageToken } });
      } else {
        note = "MAX: обложка не приложена к посту. Пост отправлен текстом.";
      }
    } catch (err) {
      note = `MAX: обложка не приложена (${err instanceof Error ? err.message : String(err)}). Пост отправлен текстом.`;
      log.warn("max.media_attachment_failed", { error: note });
    }
  }

  const payload: {
    text: string;
    format: "html" | "markdown";
    attachments?: typeof attachments;
  } = {
    text: options.text,
    format: options.format ?? "html",
  };

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  const { status, data } = await requestMaxApi<MaxSendMessageResponse>({
    path: `/messages?chat_id=${encodeURIComponent(numericChatId)}`,
    method: "POST",
    token,
    body: payload,
  });

  if (status !== 200 || !data.message) {
    const errorDetail = data.message_text ?? data.code ?? `HTTP ${status}`;
    throw new Error(`MAX API sendMessage failed: ${errorDetail}`);
  }

  const mid = data.message.body?.mid ?? String(Date.now());
  const publicUrl =
    data.message.url ??
    (configuredChatId.startsWith("id")
      ? `https://max.ru/${configuredChatId}`
      : `https://max.ru/chat/${numericChatId}`);

  return {
    externalPostId: mid,
    publicUrl,
    note,
  };
}

async function ensureMaxEnabled(): Promise<void> {
  const enabled = await marketingPlatformEnabled("Max");
  if (!enabled) throw new Error("Marketing platform Max is disabled");
}

/**
 * Публикатор для маркетингового конвейера eTerapy.
 */
export async function publishToMax(publication: {
  body: string;
  mediaUrl?: string | null;
  parseMode?: "HTML" | "Markdown" | null;
  [key: string]: unknown;
}): Promise<PublishedPost> {
  await ensureMaxEnabled();
  const format = publication.parseMode?.toLowerCase() === "markdown" ? "markdown" : "html";
  return sendMaxMessage({
    text: publication.body,
    format,
    mediaUrl: publication.mediaUrl,
  });
}

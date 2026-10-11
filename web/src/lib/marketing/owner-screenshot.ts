/**
 * Скриншот владельца в канале → текст (Yandex Vision OCR через шлюз ИИ).
 * Файл Telegram берётся через наш зарубежный релей: релей Cloudflare умеет
 * только методы Bot API, а прямой api.telegram.org с РФ-ноды закрыт.
 */

import { aiComplete } from "@/lib/ai";
import { callTelegramApi } from "@/lib/telegram";
import { log, serializeError } from "@/lib/logger";
import { metaEndpoint, metaRequestHeaders } from "@/lib/marketing/meta-endpoints";

export const SCREENSHOT_OCR_FEATURE = "marketing-screenshot-ocr";
const MAX_BYTES = 5 * 1024 * 1024;

async function telegramPhotoDataUrl(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  const file = await callTelegramApi<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  const path = file.result?.file_path;
  if (!file.ok || !path || (file.result?.file_size ?? 0) > MAX_BYTES) return null;
  const response = await fetch(`${metaEndpoint("telegram")}/file/bot${token}/${path}`, {
    headers: metaRequestHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return null;
  const mime = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** `null` — не вышло прочитать; причина в журнале, владельцу скажут просьбой вставить текст. */
export async function readOwnerScreenshot(fileId: string): Promise<string | null> {
  try {
    const dataUrl = await telegramPhotoDataUrl(fileId);
    if (!dataUrl) return null;
    const response = await aiComplete({
      feature: SCREENSHOT_OCR_FEATURE,
      maxTokens: 2000,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Распознай весь текст на скриншоте поста." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    });
    const text = response.text.trim();
    return text.length >= 3 ? text.slice(0, 3000) : null;
  } catch (error) {
    log.warn("orchestrator.screenshot_ocr_failed", { error: serializeError(error) });
    return null;
  }
}

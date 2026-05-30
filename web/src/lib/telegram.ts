/**
 * Telegram Bot API helper
 * Требует: TELEGRAM_BOT_TOKEN в env
 *
 * Для привязки аккаунта пользователь отправляет боту /start <token>
 * Бот записывает telegramId в User.
 *
 * Если сервер находится в регионе с блокировкой api.telegram.org (напр., РФ),
 * установите `TELEGRAM_API_BASE` в URL relay/прокси вида
 *   https://tg-relay.example.com/bot<TOKEN>
 * или
 *   https://<worker>.workers.dev/bot<TOKEN>
 * тогда все обращения пойдут через этот host. По умолчанию используется
 * `https://api.telegram.org/bot<TOKEN>`.
 */

import { log } from "./logger";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API_BASE = process.env.TELEGRAM_API_BASE?.trim()
  || `https://api.telegram.org/bot${BOT_TOKEN}`;

export function getTelegramRuntimeConfig() {
  let apiBaseHost = "invalid";
  try {
    apiBaseHost = new URL(API_BASE).host;
  } catch {
    apiBaseHost = "invalid";
  }

  return {
    configured: Boolean(BOT_TOKEN),
    apiBaseHost,
    usingRelay: Boolean(process.env.TELEGRAM_API_BASE?.trim()),
  };
}

/** Отправляет сообщение в Telegram-чат. chatId — строка (telegramId пользователя) */
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    log.warn("telegram.bot_token_missing");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API error: ${err}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Генерирует одноразовый токен для привязки аккаунта */
export function generateLinkToken(userId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  // Не секретный — не используем для auth, только для связки
  return `${ts}${rand}${userId.slice(-4)}`;
}

/** Формирует ссылку для привязки Telegram */
export function getTelegramLinkUrl(token: string): string {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "eterapy_bot";
  return `https://t.me/${botUsername}?start=${token}`;
}

/** Отправляет Telegram через getUpdates (polling-based) — только для webhook endpoint */
export async function getBotUpdates(offset?: number) {
  if (!BOT_TOKEN) return [];
  const url = `${API_BASE}/getUpdates${offset !== undefined ? `?offset=${offset}` : ""}`;
  const res = await fetch(url);
  const d = await res.json();
  return d.result ?? [];
}

/** Регистрирует webhook URL в Telegram */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    log.warn("telegram.bot_token_missing_webhook");
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined }),
    });
    const d = await res.json();
    if (d.ok) {
      log.info("telegram.set_webhook_ok", { webhookUrl });
    } else {
      log.error("telegram.set_webhook_failed", { response: d });
    }
    return d.ok;
  } catch (err) {
    log.error("telegram.set_webhook_error", { err });
    return false;
  }
}

// ── B7: dedicated support bot (@eterapy_support_bot) ──────────────────────
// The notification bot must not run the support group, or it spams "/start"
// linking replies on every staff message. A separate bot handles the support
// supergroup exclusively.
const SUPPORT_BOT_TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN ?? "";
const SUPPORT_API_BASE = process.env.TELEGRAM_SUPPORT_API_BASE?.trim()
  || (SUPPORT_BOT_TOKEN ? `https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}` : "");

/** True when a dedicated support bot is configured. */
export function hasSupportBot(): boolean {
  return Boolean(SUPPORT_BOT_TOKEN);
}

/**
 * Sends a message via the dedicated support bot. Falls back to the main bot
 * if the support bot is not configured, so the thread keeps working while the
 * env var is being rolled out.
 */
export async function sendTelegramSupport(chatId: string, text: string, replyToMessageId?: number): Promise<void> {
  const base = SUPPORT_BOT_TOKEN ? SUPPORT_API_BASE : API_BASE;
  if ((!SUPPORT_BOT_TOKEN && !BOT_TOKEN) || !base) {
    log.warn("telegram.support_bot_token_missing");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Telegram API error: ${await res.text()}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Registers the support bot's webhook (superadmin action). */
export async function setSupportTelegramWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string; username?: string }> {
  if (!SUPPORT_BOT_TOKEN) return { ok: false, error: "TELEGRAM_SUPPORT_BOT_TOKEN not set" };
  try {
    const me = await fetch(`${SUPPORT_API_BASE}/getMe`).then((r) => r.json()).catch(() => ({}));
    const res = await fetch(`${SUPPORT_API_BASE}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: (process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET) || undefined,
        allowed_updates: ["message"],
      }),
    });
    const d = await res.json();
    if (!d.ok) {
      log.error("telegram.support_set_webhook_failed", { response: d });
      return { ok: false, error: d.description };
    }
    log.info("telegram.support_set_webhook_ok", { webhookUrl });
    return { ok: true, username: me?.result?.username };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Возвращает текущий WebhookInfo от Telegram — для диагностики */
export async function getTelegramWebhookInfo(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/getWebhookInfo`, { signal: controller.signal });
      const d = await res.json();
      return d;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

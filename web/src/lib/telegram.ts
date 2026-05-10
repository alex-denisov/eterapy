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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const DEFAULT_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const API_BASE = process.env.TELEGRAM_API_BASE?.trim() || DEFAULT_API_BASE;

// Fallback relay if api.telegram.org is blocked
const PUBLIC_RELAY = `https://tgproxy.eterapy.com/bot${BOT_TOKEN}`;

async function fetchWithFallback(path: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const url = `${API_BASE}/${path}`;
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (res.ok) {
      clearTimeout(timeoutId);
      return res;
    }
    // If it's a 4xx/5xx from Telegram, don't fallback, just return it
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Only fallback if we failed to reach the primary API base and haven't tried the relay yet
    if (API_BASE === DEFAULT_API_BASE) {
      console.log(`[Telegram] Primary API blocked, trying fallback relay for ${path}`);
      return fetch(`${PUBLIC_RELAY}/${path}`, options);
    }
    throw err;
  }
}

/** Отправляет сообщение в Telegram-чат. chatId — строка (telegramId пользователя) */
export async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set, skipping");
    return;
  }
  try {
    const res = await fetchWithFallback("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API error: ${err}`);
    }
  } catch (err) {
    console.error("[Telegram] sendMessage failed:", err);
    throw err;
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

/** Регистрирует webhook URL в Telegram */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN not set, skipping webhook setup");
    return false;
  }
  try {
    const res = await fetchWithFallback("setWebhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined }),
    });
    const d = await res.json();
    if (d.ok) {
      console.log("[Telegram] Webhook registered:", webhookUrl);
    } else {
      console.error("[Telegram] setWebhook failed:", d);
    }
    return d.ok;
  } catch (err) {
    console.error("[Telegram] setWebhook error:", err);
    return false;
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

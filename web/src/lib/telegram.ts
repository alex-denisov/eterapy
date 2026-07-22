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
import { telegramBotUsername } from "@/lib/env";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API_BASE = process.env.TELEGRAM_API_BASE?.trim()
  || `https://api.telegram.org/bot${BOT_TOKEN}`;

type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{
    text: string;
    url?: string;
    web_app?: { url: string };
  }>>;
};

type TelegramApiResponse<T = unknown> = { ok?: boolean; description?: string; result?: T };

async function telegramApi<T = unknown>(method: string, body: Record<string, unknown>, timeoutMs = 10000): Promise<TelegramApiResponse<T>> {
  if (!BOT_TOKEN) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` })) as TelegramApiResponse<T>;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * B529: тот же вызов Bot API для платёжных методов (`createInvoiceLink`,
 * `answerPreCheckoutQuery`, `refundStarPayment`). Экспортируется, чтобы
 * платёжный модуль не заводил второй клиент с собственным токеном и своим
 * пониманием релея `TELEGRAM_API_BASE` — в РФ прямой api.telegram.org
 * недоступен, и разъехавшийся базовый адрес означал бы неоплаченные счета.
 *
 * `timeoutMs` короче дефолта у pre_checkout: Telegram ждёт ответ 10 секунд,
 * после чего платёж падает у покупателя.
 */
export async function callTelegramApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs?: number,
): Promise<TelegramApiResponse<T>> {
  return telegramApi<T>(method, body, timeoutMs);
}

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
export async function sendTelegram(
  chatId: string,
  text: string,
  options?: { replyMarkup?: TelegramInlineKeyboard },
): Promise<void> {
  if (!BOT_TOKEN) {
    log.warn("telegram.bot_token_missing");
    return;
  }
  const result = await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
  if (!result.ok) throw new Error(`Telegram API error: ${result.description ?? "unknown error"}`);
}

/** Configures product-facing bot copy, commands and the persistent Mini App menu button. */
export async function configureTelegramBot({ miniAppUrl, staging }: { miniAppUrl: string; staging: boolean }) {
  // B533 (owner 2026-07-22: «оставляем твою рекомендацию как за мой выбор»).
  // Имя обязано называть ПОЛКУ: в каталоге Telegram его читают вместе с одной
  // строкой описания, и «ETerapy — Что дальше?» там не отвечает «что это».
  // «Разбор» — уже собственное слово продукта (первичный разбор, подробный
  // разбор, разбор переписки), различительность несёт ETerapy.
  const name = staging ? "ETerapy · Разбор (Stage)" : "ETerapy · Разбор";
  const suffix = staging ? " Тестовая версия." : "";
  const requests: Array<[string, Record<string, unknown>]> = [
    ["setMyName", { name }],
    // B554 (owner): описание обязано называть результат, а не цель платформы.
    // B533: текст утверждён владельцем. Последнее предложение — про запись к
    // специалистам — сохранено из редакции B554: это отдельная продуктовая
    // поверхность, и молча убирать её из каталожного описания неправильно.
    ["setMyDescription", { description: `Опишите ситуацию своими словами. Несколько уточняющих вопросов — и вы получите разбор: что я слышу в вашем вопросе, главная развилка и следующий безопасный шаг. Первый разбор бесплатный, без регистрации. Дальше — подробные разборы и запись к специалистам.${suffix}` }],
    ["setMyShortDescription", { short_description: `Вопрос своими словами → короткий диалог → разбор: что происходит и какой шаг безопасен.${suffix}` }],
    ["setMyCommands", { commands: [
      { command: "start", description: "Разобрать вопрос" },
      { command: "status", description: "Проверить связь с аккаунтом" },
      { command: "stop", description: "Отключить уведомления Telegram" },
    ] }],
    ["setChatMenuButton", { menu_button: { type: "web_app", text: "Разобрать вопрос", web_app: { url: miniAppUrl } } }],
  ];
  const results = [];
  for (const [method, body] of requests) {
    const result = await telegramApi(method, body);
    results.push({ method, ok: Boolean(result.ok), error: result.ok ? undefined : result.description });
    if (!result.ok) log.error("telegram.configure_failed", { method, error: result.description });
  }
  return { ok: results.every((result) => result.ok), results };
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
  return `https://t.me/${telegramBotUsername()}?start=${token}`;
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

/**
 * Sends a message via the dedicated support bot. Falls back to the main bot
 * if the support bot is not configured, so the thread keeps working while the
 * env var is being rolled out.
 */
export async function sendTelegramSupport(
  chatId: string,
  text: string,
  options?: { replyToMessageId?: number; messageThreadId?: number },
): Promise<void> {
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
        ...(options?.messageThreadId ? { message_thread_id: options.messageThreadId } : {}),
        ...(options?.replyToMessageId ? { reply_to_message_id: options.replyToMessageId } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Telegram API error: ${await res.text()}`);
  } finally {
    clearTimeout(timeout);
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

/**
 * Bot liveness via getMe — relay-aware (uses API_BASE, which on the prod VPS is
 * the Cloudflare Worker proxy because api.telegram.org is geo-blocked). B4.
 */
export async function getTelegramBotHealth(): Promise<{ ok: boolean; username?: string; status?: number; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${API_BASE}/getMe`, { signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { username?: string } };
    return {
      ok: Boolean(data?.ok),
      username: data?.result?.username,
      status: res.status,
      error: data?.ok ? undefined : data?.description,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

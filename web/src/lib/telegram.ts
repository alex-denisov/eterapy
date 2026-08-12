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
    callback_data?: string;
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

/**
 * B643 — тот же Bot API, но файлом, а не ссылкой.
 *
 * `sendPhoto` умеет принять URL и забрать картинку сам, и до этого мы так и
 * делали. Замер прода 2026-08-03 показал, что серверы Telegram нашу ссылку не
 * забирают вовсе: за всё время существования эндпоинта картинки в журнале
 * nginx нет ни одного их обращения, зато три материала умерли с «Bad Request:
 * failed to get HTTP URL content». Это зеркало INC-098 — там api.telegram.org
 * недоступен с РФ-ноды, здесь РФ-нода недоступна для Telegram.
 *
 * Отказ снаружи периметра не оставляет следов и не поддаётся отладке, поэтому
 * байты доносим сами: свою картинку нода берёт, до релея дотягивается.
 * Таймаут по умолчанию больше обычного — здесь передаётся файл, а не строка.
 */
export async function callTelegramApiWithPhoto<T = unknown>(
  method: string,
  fields: Record<string, string>,
  photo: { bytes: ArrayBuffer; filename: string; contentType: string },
  timeoutMs = 30000,
): Promise<TelegramApiResponse<T>> {
  if (!BOT_TOKEN) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("photo", new Blob([photo.bytes], { type: photo.contentType }), photo.filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Content-Type не задаётся руками: границу multipart проставляет fetch.
    const response = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    return await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` })) as TelegramApiResponse<T>;
  } finally {
    clearTimeout(timeout);
  }
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
): Promise<number | null> {
  if (!BOT_TOKEN) {
    log.warn("telegram.bot_token_missing");
    return null;
  }
  const result = await telegramApi<{ message_id?: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
  if (!result.ok) throw new Error(`Telegram API error: ${result.description ?? "unknown error"}`);
  return result.result?.message_id ?? null;
}

/**
 * B678 — то же личное сообщение, но картинкой с подписью.
 *
 * Байты доносим сами по той же причине, что и в B643: серверы Telegram за
 * ссылкой на РФ-ноду не приходят вовсе (`reference_telegram_wont_fetch_ru_node_urls`),
 * и отказ выглядит как «failed to get HTTP URL content» без единой записи в
 * нашем access-логе.
 *
 * Предел подписи у `sendPhoto` — 1024 символа против 4096 у сообщения;
 * обрезку делает вызывающая сторона, здесь она бы молча съела ссылку.
 */
export async function sendTelegramPhoto(
  chatId: string,
  caption: string,
  photo: { bytes: ArrayBuffer; filename: string; contentType: string },
  options?: { replyMarkup?: TelegramInlineKeyboard },
): Promise<number | null> {
  if (!BOT_TOKEN) {
    log.warn("telegram.bot_token_missing");
    return null;
  }
  const result = await callTelegramApiWithPhoto<{ message_id?: number }>(
    "sendPhoto",
    {
      chat_id: chatId,
      caption,
      parse_mode: "HTML",
      ...(options?.replyMarkup ? { reply_markup: JSON.stringify(options.replyMarkup) } : {}),
    },
    photo,
  );
  if (!result.ok) throw new Error(`Telegram API error: ${result.description ?? "unknown error"}`);
  return result.result?.message_id ?? null;
}

/** Configures product-facing bot copy, commands and the persistent Mini App menu button. */
export async function configureTelegramBot({ miniAppUrl, staging }: { miniAppUrl: string; staging: boolean }) {
  // B576: name carries both the distinctive product word and the discovery
  // category. It names AI honestly without presenting the bot as a clinician.
  //
  // B708 — ЗДЕСЬ ЖИВЁТ ЕДИНСТВЕННЫЙ ИСТОЧНИК ЭТИХ ТЕКСТОВ, и это не педантизм.
  // Профиль бота правится двумя путями: руками у @BotFather и этой функцией из
  // `/api/telegram/setup-webhook`. Пути расходятся МОЛЧА, и побеждает тот, кто
  // сработал последним: 2026-08-13 владелец переименовал бота вручную, а в коде
  // оставалось «ETerapy · ИИ-разбор» — первый же вызов setup-webhook откатил бы
  // правку без единой ошибки. Та же ловушка, что с промтами (B705 §12, B706).
  // Значения ниже сведены с живым состоянием бота на 2026-08-13.
  const name = staging ? "Таро и матрица судьбы (Stage) · eTerapy" : "Таро и матрица судьбы — разборы · eTerapy";
  const suffix = staging ? " Тестовая версия." : "";
  const requests: Array<[string, Record<string, unknown>]> = [
    ["setMyName", { name }],
    ["setMyDescription", { description: `Таро, матрица судьбы и натальная карта — с расчётом и разбором, а не с приговором. Опишите вопрос своими словами: бот задаст 2–3 уточнения и соберёт разбор — что стоит за вопросом, главная развилка и один следующий шаг.\n\nБесплатно, без карты и регистрации, около трёх минут.\n\nОтвечает нейросеть, не специалист. Не заменяет психолога и врача; при риске для жизни — 112. 18+\n\nСюда же приходят уведомления ETerapy: /status — проверить связь, /stop — отключить.${suffix}` }],
    ["setMyShortDescription", { short_description: `Таро, матрица судьбы, натальная карта: расчёт и разбор. Бесплатно. Отвечает нейросеть, не специалист.${suffix}` }],
    ["setMyCommands", { commands: [
      { command: "start", description: "Понять, что дальше — бесплатно" },
      { command: "status", description: "Проверить связь с аккаунтом" },
      { command: "stop", description: "Отключить уведомления Telegram" },
    ] }],
    ["setChatMenuButton", { menu_button: { type: "web_app", text: "Понять, что дальше", web_app: { url: miniAppUrl } } }],
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

/**
 * Типы обновлений, которые наш webhook действительно разбирает.
 *
 * ⚠ ЭТО БЕЛЫЙ СПИСОК, А НЕ ПОДСКАЗКА. Telegram доставляет ТОЛЬКО перечисленное
 * в `allowed_updates`; всё остальное отбрасывается на его стороне — молча, без
 * ошибки, без записи в журнале у нас. Отладить это по нашим логам нельзя: там
 * просто ничего нет, как будто кнопку не нажимали.
 *
 * ⚠ И ЭТО ЗНАЧЕНИЕ ЛИПКОЕ. Когда `setWebhook` вызывают БЕЗ `allowed_updates`,
 * Telegram сохраняет ПРЕДЫДУЩИЙ список, а не умолчание. Поэтому один давний
 * вызов с `["message"]` (deploy/setup-telegram-proxy.sh) пережил все
 * последующие перерегистрации вебхука.
 *
 * ЧТО ЭТО СЛОМАЛО (INC-097, обнаружено 2026-08-03):
 *  • `callback_query` — все инлайн-кнопки премодерации SMM были мертвы: нажатие
 *    «Принять» не доходило до приложения вовсе. В `webhook_events` за всё время
 *    нет ни одной записи типа callback_query;
 *  • `pre_checkout_query` — Telegram ждёт ответ 10 секунд, и без него оплата
 *    звёздами (B529) не могла завершиться в принципе.
 *
 * Список ведётся рядом с разбором в `app/api/telegram/webhook/route.ts`:
 * добавили ветку разбора — добавьте тип сюда, иначе она никогда не сработает.
 */
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "pre_checkout_query",
] as const;

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
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
        // Передаётся ВСЕГДА и явно: пропуск поля означает «оставить как было»,
        // а «как было» — это и есть дефект, который мы чиним.
        allowed_updates: TELEGRAM_ALLOWED_UPDATES,
      }),
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

import { randomBytes } from "node:crypto";
import db from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/ai-gateway/credentials-crypto";

export const MARKETING_PLATFORM_FIELDS = [
  { platform: "VK", key: "VK_COMMUNITY_TOKEN", label: "Токен сообщества", secret: true, multiline: false },
  { platform: "VK", key: "VK_COMMUNITY_ID", label: "ID сообщества", secret: false, multiline: false },
  // B618: Callback API сообщества. `confirmation` — строка, которую VK ждёт в
  // ответ при подключении сервера, `secret` — поле, по которому мы отличаем VK
  // от постороннего запроса.
  { platform: "VK", key: "VK_CALLBACK_CONFIRMATION", label: "Строка подтверждения Callback API", secret: false, multiline: false },
  { platform: "VK", key: "VK_CALLBACK_SECRET", label: "Секретный ключ Callback API", secret: true, multiline: false },
  { platform: "Reddit", key: "REDDIT_CLIENT_ID", label: "Client ID", secret: false, multiline: false },
  { platform: "Reddit", key: "REDDIT_CLIENT_SECRET", label: "Client secret", secret: true, multiline: false },
  { platform: "Reddit", key: "REDDIT_USER_AGENT", label: "User-Agent", secret: false, multiline: false },
  { platform: "Reddit", key: "REDDIT_POST_SUBREDDIT", label: "Subreddit для своих постов", secret: false, multiline: false },
  { platform: "Reddit", key: "REDDIT_SUBREDDITS", label: "Subreddit для поиска, через запятую", secret: false, multiline: false },
  // B617: браузерная сессия Reddit убрана. Вход по сохранённой сессии — ровно
  // то, что правила площадок называют нарушением, и для Reddit он не нужен:
  // там есть OAuth. Браузерный публикатор остаётся только у Дзена, где API
  // не существует, и только для собственных публикаций.
  { platform: "Threads", key: "THREADS_APP_ID", label: "Threads App ID", secret: false, multiline: false },
  { platform: "Threads", key: "THREADS_APP_SECRET", label: "Threads App Secret", secret: true, multiline: false },
  { platform: "Threads", key: "THREADS_ACCESS_TOKEN", label: "Access token (заполняется OAuth автоматически)", secret: true, multiline: false },
  { platform: "Threads", key: "THREADS_USER_ID", label: "Threads User ID", secret: false, multiline: false },
  { platform: "Threads", key: "THREADS_TOKEN_EXPIRES_AT", label: "Срок токена (ISO, обновляется автоматически)", secret: false, multiline: false },
  // B637: поле остаётся — webhook у Threads работает и на `mentions`. Но это
  // уже НЕ условие для «отвечаем на входящее»: ответы под своими публикациями
  // забирает обход каждые 15 минут, а поля `replies` площадка в подписке не
  // предлагает вовсе.
  { platform: "Threads", key: "THREADS_WEBHOOK_VERIFY_TOKEN", label: "Маркер подтверждения webhook (необязательно, для mentions) · адрес: https://hooks.eterapy.com/api/integrations/meta/threads/webhook", secret: false, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_APP_ID", label: "Instagram App ID", secret: false, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_APP_SECRET", label: "Instagram App Secret", secret: true, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_ACCESS_TOKEN", label: "Access token (заполняется OAuth автоматически)", secret: true, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_USER_ID", label: "Instagram-scoped User ID", secret: false, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_TOKEN_EXPIRES_AT", label: "Срок токена (ISO, обновляется автоматически)", secret: false, multiline: false },
  { platform: "Instagram", key: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", label: "Маркер подтверждения webhook (необязательно) · адрес: https://hooks.eterapy.com/api/integrations/meta/instagram/webhook", secret: false, multiline: false },
  { platform: "Telegram", key: "TELEGRAM_BOT_TOKEN", label: "Bot token", secret: true, multiline: false },
  { platform: "Telegram", key: "TELEGRAM_CHANNEL_ID", label: "Маркетинговый канал", secret: false, multiline: false },
  // B618: комментарии к постам канала физически живут в связанной группе
  // обсуждений — у самого канала комментариев нет. Без её id бот не увидит ни
  // одного комментария, поэтому это отдельное поле, а не догадка по каналу.
  { platform: "Telegram", key: "TELEGRAM_DISCUSSION_CHAT_ID", label: "Группа обсуждений канала (для ответов на комментарии)", secret: false, multiline: false },
  { platform: "Dzen", key: "DZEN_CHANNEL_URL", label: "Адрес канала", secret: false, multiline: false },
  { platform: "Dzen", key: "DZEN_BROWSER_STORAGE_STATE", label: "Браузерная сессия (Playwright storageState JSON)", secret: true, multiline: true },
  // B620: пока лента не подтверждена площадкой, действующий путь выпуска не
  // отключается. `true` здесь означает «канал принял RSS» — после этого
  // браузерная сессия выходит из периметра и больше не используется.
  { platform: "Dzen", key: "DZEN_FEED_CONFIRMED", label: "Лента подключена в Дзене (true / пусто)", secret: false, multiline: false },
  { platform: "Research", key: "MARKETING_COMPETITOR_URLS", label: "Публичные страницы конкурентов, по одной URL в строке", secret: false, multiline: true },
] as const;

export type MarketingPlatform = typeof MARKETING_PLATFORM_FIELDS[number]["platform"];
export type MarketingPlatformFieldKey = typeof MARKETING_PLATFORM_FIELDS[number]["key"];

const FIELD_BY_KEY = new Map<string, typeof MARKETING_PLATFORM_FIELDS[number]>(
  MARKETING_PLATFORM_FIELDS.map((field) => [field.key, field]),
);

const ENV_ALIASES: Partial<Record<MarketingPlatformFieldKey, readonly string[]>> = {
  TELEGRAM_CHANNEL_ID: ["TELEGRAM_ETERAPY_CHANNEL_ID"],
  // Владелец 2026-07-30 создал группу обсуждений канала и передал её id. Он
  // приезжает выкаткой, а не вводом руками: механизм с ручным шагом — это
  // невыполненный механизм (урок стенда, открытого в интернет полторы недели).
  TELEGRAM_DISCUSSION_CHAT_ID: ["TELEGRAM_ETERAPY_CHAT_ID"],
  REDDIT_CLIENT_ID: ["REDDIT_OAUTH_APP_CLIENT_ID"],
  REDDIT_CLIENT_SECRET: ["REDDIT_OAUTH_APP_CLIENT_SECRET"],
};

function settingKey(key: string) {
  return `marketing.connector.${key}`;
}

function enabledSettingKey(platform: MarketingPlatform) {
  return `marketing.connector.${platform.toLowerCase()}.enabled`;
}

function decodeStored(value: string, secret: boolean) {
  if (!secret) return value;
  return decryptSecret(value);
}

export async function marketingPlatformValue(key: MarketingPlatformFieldKey): Promise<string | null> {
  const field = FIELD_BY_KEY.get(key);
  if (!field) return null;
  const row = await db.platformSetting.findUnique({
    where: { key: settingKey(key) },
    select: { value: true },
  }).catch(() => null);
  if (row?.value) {
    try {
      return decodeStored(row.value, field.secret).trim() || null;
    } catch {
      return null;
    }
  }
  const names = [key, ...(ENV_ALIASES[key] ?? [])];
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export async function requiredMarketingPlatformValue(key: MarketingPlatformFieldKey): Promise<string> {
  const value = await marketingPlatformValue(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export async function marketingPlatformEnabled(platform: MarketingPlatform): Promise<boolean> {
  const row = await db.platformSetting.findUnique({
    where: { key: enabledSettingKey(platform) },
    select: { value: true },
  }).catch(() => null);
  if (row) return row.value === "true";
  const fields = MARKETING_PLATFORM_FIELDS.filter((field) => field.platform === platform);
  return (await Promise.all(fields.map((field) => marketingPlatformValue(field.key))))
    .some(Boolean);
}

export type MarketingPlatformAdminField = {
  key: MarketingPlatformFieldKey;
  label: string;
  secret: boolean;
  multiline: boolean;
  configured: boolean;
  value: string;
};

export type MarketingPlatformAdminConfig = {
  platform: MarketingPlatform;
  enabled: boolean;
  fields: MarketingPlatformAdminField[];
};

/**
 * B627 — маркер webhook, выведенный из секрета приложения.
 *
 * Импорт ленивый: `meta-webhook-handlers` тянет разбор входящего, и статическая
 * связь сделала бы модуль настроек зависимым от половины маркетингового
 * контура. Нужен здесь только для двух полей из тридцати.
 */
async function derivedWebhookTokenFor(key: string): Promise<string | null> {
  const platform = key === "THREADS_WEBHOOK_VERIFY_TOKEN"
    ? "Threads" as const
    : key === "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"
      ? "Instagram" as const
      : null;
  if (!platform) return null;
  const appSecret = await marketingPlatformValue(
    platform === "Threads" ? "THREADS_APP_SECRET" : "INSTAGRAM_APP_SECRET",
  );
  if (!appSecret) return null;
  const { derivedWebhookVerifyToken } = await import("@/lib/marketing/meta-webhook-handlers");
  return derivedWebhookVerifyToken(platform, appSecret);
}

export async function listMarketingPlatformAdminConfigs(): Promise<MarketingPlatformAdminConfig[]> {
  const platforms = [...new Set(MARKETING_PLATFORM_FIELDS.map((field) => field.platform))];
  return Promise.all(platforms.map(async (platform) => {
    const fields = MARKETING_PLATFORM_FIELDS.filter((field) => field.platform === platform);
    const values = await Promise.all(fields.map(async (field) => ({
      ...field,
      // B627: маркер подтверждения webhook показывается, даже если он ещё не
      // сохранён — он выводится из секрета приложения. Владельцу нужно
      // скопировать его в Meta ДО того, как он что-либо сохранит у нас, иначе
      // подтверждение адреса падает с «Callback verification failed».
      value: await marketingPlatformValue(field.key)
        ?? await derivedWebhookTokenFor(field.key),
    })));
    return {
      platform,
      enabled: await marketingPlatformEnabled(platform),
      fields: values.map((field) => ({
        key: field.key,
        label: field.label,
        secret: field.secret,
        multiline: field.multiline,
        configured: Boolean(field.value),
        value: field.secret ? "" : field.value ?? "",
      })),
    };
  }));
}

export async function saveMarketingPlatformConfig(input: {
  actorId: string;
  platform: MarketingPlatform;
  enabled: boolean;
  values: Partial<Record<MarketingPlatformFieldKey, string | null>>;
}) {
  const allowed = MARKETING_PLATFORM_FIELDS.filter((field) => field.platform === input.platform);
  if (allowed.length === 0) throw new Error("Unknown marketing platform");

  await db.$transaction(async (tx) => {
    await tx.platformSetting.upsert({
      where: { key: enabledSettingKey(input.platform) },
      create: {
        key: enabledSettingKey(input.platform),
        value: String(input.enabled),
        updatedBy: input.actorId,
      },
      update: { value: String(input.enabled), updatedBy: input.actorId },
    });
    for (const field of allowed) {
      // Маркер подтверждения webhook придумывать владельцу незачем: он нужен
      // только чтобы площадка и мы сошлись на одной случайной строке.
      const generatedWebhookToken = (
        field.key === "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"
        || field.key === "THREADS_WEBHOOK_VERIFY_TOKEN"
      )
        && !(await tx.platformSetting.findUnique({ where: { key: settingKey(field.key) }, select: { key: true } }))
        ? `eterapy_${randomBytes(24).toString("base64url")}`
        : undefined;
      const raw = input.values[field.key] || generatedWebhookToken;
      if (raw === undefined || raw === null) continue;
      const value = raw.trim();
      // Empty secret means “keep the existing secret”; this prevents an
      // ordinary form save from silently disconnecting a platform.
      if (!value && field.secret) continue;
      if (!value) {
        await tx.platformSetting.deleteMany({ where: { key: settingKey(field.key) } });
        continue;
      }
      const stored = field.secret ? encryptSecret(value) : value;
      await tx.platformSetting.upsert({
        where: { key: settingKey(field.key) },
        create: { key: settingKey(field.key), value: stored, updatedBy: input.actorId },
        update: { value: stored, updatedBy: input.actorId },
      });
    }
  });
}

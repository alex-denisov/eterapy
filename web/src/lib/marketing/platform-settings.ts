import db from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/ai-gateway/credentials-crypto";

export const MARKETING_PLATFORM_FIELDS = [
  { platform: "VK", key: "VK_COMMUNITY_TOKEN", label: "Токен сообщества", secret: true },
  { platform: "VK", key: "VK_COMMUNITY_ID", label: "ID сообщества", secret: false },
  { platform: "VK", key: "VK_USER_TOKEN", label: "Пользовательский токен для поиска публичных постов", secret: true },
  { platform: "Reddit", key: "REDDIT_CLIENT_ID", label: "Client ID", secret: false },
  { platform: "Reddit", key: "REDDIT_CLIENT_SECRET", label: "Client secret", secret: true },
  { platform: "Reddit", key: "REDDIT_USER_AGENT", label: "User-Agent", secret: false },
  { platform: "Reddit", key: "REDDIT_POST_SUBREDDIT", label: "Subreddit для своих постов", secret: false },
  { platform: "Reddit", key: "REDDIT_SUBREDDITS", label: "Subreddit для поиска, через запятую", secret: false },
  { platform: "Threads", key: "THREADS_ACCESS_TOKEN", label: "Access token", secret: true },
  { platform: "Threads", key: "THREADS_USER_ID", label: "User ID", secret: false },
  { platform: "Instagram", key: "INSTAGRAM_ACCESS_TOKEN", label: "Access token", secret: true },
  { platform: "Instagram", key: "INSTAGRAM_USER_ID", label: "Professional account ID", secret: false },
  { platform: "Telegram", key: "TELEGRAM_BOT_TOKEN", label: "Bot token", secret: true },
  { platform: "Telegram", key: "TELEGRAM_CHANNEL_ID", label: "Маркетинговый канал", secret: false },
  { platform: "Dzen", key: "DZEN_CHANNEL_URL", label: "Адрес канала", secret: false },
] as const;

export type MarketingPlatform = typeof MARKETING_PLATFORM_FIELDS[number]["platform"];
export type MarketingPlatformFieldKey = typeof MARKETING_PLATFORM_FIELDS[number]["key"];

const FIELD_BY_KEY = new Map<string, typeof MARKETING_PLATFORM_FIELDS[number]>(
  MARKETING_PLATFORM_FIELDS.map((field) => [field.key, field]),
);

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
  return process.env[key]?.trim() || null;
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
  configured: boolean;
  value: string;
};

export type MarketingPlatformAdminConfig = {
  platform: MarketingPlatform;
  enabled: boolean;
  fields: MarketingPlatformAdminField[];
};

export async function listMarketingPlatformAdminConfigs(): Promise<MarketingPlatformAdminConfig[]> {
  const platforms = [...new Set(MARKETING_PLATFORM_FIELDS.map((field) => field.platform))];
  return Promise.all(platforms.map(async (platform) => {
    const fields = MARKETING_PLATFORM_FIELDS.filter((field) => field.platform === platform);
    const values = await Promise.all(fields.map(async (field) => ({
      ...field,
      value: await marketingPlatformValue(field.key),
    })));
    return {
      platform,
      enabled: await marketingPlatformEnabled(platform),
      fields: values.map((field) => ({
        key: field.key,
        label: field.label,
        secret: field.secret,
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
      const raw = input.values[field.key];
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

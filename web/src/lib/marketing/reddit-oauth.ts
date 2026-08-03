import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import db from "@/lib/db";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/ai-gateway/credentials-crypto";
import {
  marketingPlatformValue,
  requiredMarketingPlatformValue,
} from "@/lib/marketing/platform-settings";

const REDDIT_REFRESH_TOKEN_SETTING = "marketing.reddit.refresh_token";
/**
 * Адрес возврата OAuth. В отличие от прочих ссылок кокпита, он НЕ должен
 * следовать за контуром: Reddit принимает только тот адрес, который зарегистрирован
 * в приложении. Смена контура делается переменной `REDDIT_REDIRECT_URI` и
 * регистрацией второго адреса на стороне Reddit, а не догадкой по заголовкам.
 */
const DEFAULT_REDIRECT_URI = "https://app.eterapy.com/api/integrations/reddit/callback";

/**
 * B624 — «не подключено» это состояние настройки, а не отказ.
 *
 * Опрос входящего поднимал `WARNING «Не читается входящее: reddit»` на
 * неподключённом коннекторе, и владелец шёл чинить то, чего никто не включал.
 * Платформа сознательно не поднимает инцидентов на ненастроенное (B610/B617).
 */
export const REDDIT_NOT_CONNECTED = "Reddit OAuth is not connected";
const TOKEN_EARLY_REFRESH_MS = 60_000;

let tokenCache: { value: string; expiresAt: number } | null = null;

export function redditRedirectUri(): string {
  return process.env.REDDIT_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

function oauthStateKey(): string {
  const value = process.env.AUTH_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.AI_CREDENTIAL_KEY?.trim();
  if (!value) throw new Error("OAuth state signing key is not configured");
  return value;
}

function signState(payload: string): string {
  return createHmac("sha256", oauthStateKey()).update(payload).digest("base64url");
}

export function createRedditOAuthState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: now + 10 * 60_000,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function verifyRedditOAuthState(
  state: string,
  userId: string,
  now = Date.now(),
): boolean {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(signState(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      expiresAt?: unknown;
    };
    return parsed.userId === userId
      && typeof parsed.expiresAt === "number"
      && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

export async function redditAuthorizationUrl(input: {
  state: string;
  clientId?: string;
}): Promise<string> {
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", input.clientId ?? await requiredMarketingPlatformValue("REDDIT_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", redditRedirectUri());
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", "identity read submit edit history");
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const clientId = await requiredMarketingPlatformValue("REDDIT_CLIENT_ID");
  const clientSecret = await requiredMarketingPlatformValue("REDDIT_CLIENT_SECRET");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": await marketingPlatformValue("REDDIT_USER_AGENT") || "web:com.eterapy.smm:v1.0 (by /u/eterapy)",
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Reddit OAuth failed: ${payload?.error ?? `HTTP ${response.status}`}`);
  }
  return payload;
}

export async function exchangeRedditAuthorizationCode(code: string): Promise<{
  refreshTokenStored: boolean;
}> {
  const payload = await tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redditRedirectUri(),
  }));
  if (!payload.refresh_token) throw new Error("Reddit did not return a refresh token");
  await db.platformSetting.upsert({
    where: { key: REDDIT_REFRESH_TOKEN_SETTING },
    create: {
      key: REDDIT_REFRESH_TOKEN_SETTING,
      value: encryptSecret(payload.refresh_token),
    },
    update: {
      value: encryptSecret(payload.refresh_token),
    },
  });
  tokenCache = {
    value: payload.access_token!,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return { refreshTokenStored: true };
}

async function storedRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.REDDIT_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const setting = await db.platformSetting.findUnique({
    where: { key: REDDIT_REFRESH_TOKEN_SETTING },
    select: { value: true },
  });
  if (!setting) return null;
  return decryptSecret(setting.value);
}

export async function redditAccessToken(now = Date.now()): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - TOKEN_EARLY_REFRESH_MS > now) {
    return tokenCache.value;
  }
  const refreshToken = await storedRefreshToken();
  if (!refreshToken) {
    const legacy = process.env.REDDIT_ACCESS_TOKEN?.trim();
    if (legacy) return legacy;
    throw new Error(REDDIT_NOT_CONNECTED);
  }
  const payload = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
  tokenCache = {
    value: payload.access_token!,
    expiresAt: now + (payload.expires_in ?? 3600) * 1000,
  };
  return tokenCache.value;
}

export async function redditOAuthConnected(): Promise<boolean> {
  if (process.env.REDDIT_REFRESH_TOKEN?.trim() || process.env.REDDIT_ACCESS_TOKEN?.trim()) return true;
  return Boolean(await db.platformSetting.findUnique({
    where: { key: REDDIT_REFRESH_TOKEN_SETTING },
    select: { key: true },
  }));
}

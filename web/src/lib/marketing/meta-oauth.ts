import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  marketingPlatformValue,
  requiredMarketingPlatformValue,
  saveMarketingPlatformConfig,
} from "@/lib/marketing/platform-settings";

export type MetaMarketingPlatform = "Threads" | "Instagram";

const CALLBACKS: Record<MetaMarketingPlatform, string> = {
  Threads: "https://eterapy.com/api/integrations/meta/threads/oauth/callback",
  Instagram: "https://eterapy.com/api/integrations/meta/instagram/oauth/callback",
};

const APP_KEYS = {
  Threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  Instagram: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
} as const;

function stateSigningKey() {
  const value = process.env.AUTH_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.AI_CREDENTIAL_KEY?.trim();
  if (!value) throw new Error("OAuth state signing key is not configured");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", stateSigningKey()).update(payload).digest("base64url");
}

export function createMetaOAuthState(
  platform: MetaMarketingPlatform,
  userId: string,
  now = Date.now(),
) {
  const payload = Buffer.from(JSON.stringify({
    platform,
    userId,
    expiresAt: now + 10 * 60_000,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyMetaOAuthState(
  state: string,
  platform: MetaMarketingPlatform,
  userId: string,
  now = Date.now(),
) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      platform?: unknown;
      userId?: unknown;
      expiresAt?: unknown;
    };
    return value.platform === platform
      && value.userId === userId
      && typeof value.expiresAt === "number"
      && value.expiresAt > now;
  } catch {
    return false;
  }
}

export function metaOAuthRedirectUri(platform: MetaMarketingPlatform) {
  const env = platform === "Threads"
    ? process.env.THREADS_REDIRECT_URI
    : process.env.INSTAGRAM_REDIRECT_URI;
  return env?.trim() || CALLBACKS[platform];
}

export async function metaAuthorizationUrl(input: {
  platform: MetaMarketingPlatform;
  state: string;
}) {
  const appId = await requiredMarketingPlatformValue(APP_KEYS[input.platform].id);
  const url = new URL(input.platform === "Threads"
    ? "https://threads.net/oauth/authorize"
    : "https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", metaOAuthRedirectUri(input.platform));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.platform === "Threads"
    ? "threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights"
    : "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights");
  return url.toString();
}

async function jsonRequest(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    const error = payload?.error;
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : typeof error === "string"
        ? error
        : `HTTP ${response.status}`;
    throw new Error(`Meta OAuth failed: ${message}`);
  }
  return payload;
}

function tokenPayload(payload: Record<string, unknown>) {
  const nested = Array.isArray(payload.data) && payload.data[0] && typeof payload.data[0] === "object"
    ? payload.data[0] as Record<string, unknown>
    : payload;
  const accessToken = typeof nested.access_token === "string" ? nested.access_token : null;
  const userId = typeof nested.user_id === "string" || typeof nested.user_id === "number"
    ? String(nested.user_id)
    : null;
  const expiresIn = typeof nested.expires_in === "number" ? nested.expires_in : null;
  if (!accessToken) throw new Error("Meta OAuth response did not contain an access token");
  return { accessToken, userId, expiresIn };
}

async function resolveUserId(platform: MetaMarketingPlatform, accessToken: string) {
  const host = platform === "Threads" ? "https://graph.threads.net/v1.0" : "https://graph.instagram.com/v25.0";
  const url = new URL(`${host}/me`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", accessToken);
  const payload = await jsonRequest(url.toString());
  if (typeof payload.id !== "string" && typeof payload.id !== "number") {
    throw new Error("Meta profile response did not contain a user id");
  }
  return String(payload.id);
}

export async function exchangeMetaAuthorizationCode(input: {
  platform: MetaMarketingPlatform;
  code: string;
  actorId: string;
}) {
  const appId = await requiredMarketingPlatformValue(APP_KEYS[input.platform].id);
  const appSecret = await requiredMarketingPlatformValue(APP_KEYS[input.platform].secret);
  const shortPayload = await jsonRequest(
    input.platform === "Threads"
      ? "https://graph.threads.net/oauth/access_token"
      : "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: metaOAuthRedirectUri(input.platform),
        code: input.code,
      }),
    },
  );
  const short = tokenPayload(shortPayload);

  const exchangeUrl = new URL(input.platform === "Threads"
    ? "https://graph.threads.net/access_token"
    : "https://graph.instagram.com/access_token");
  exchangeUrl.searchParams.set(
    "grant_type",
    input.platform === "Threads" ? "th_exchange_token" : "ig_exchange_token",
  );
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("access_token", short.accessToken);
  const long = tokenPayload(await jsonRequest(exchangeUrl.toString()));
  const userId = short.userId || await resolveUserId(input.platform, long.accessToken);
  const expiresAt = new Date(Date.now() + (long.expiresIn ?? 5_183_944) * 1_000).toISOString();

  await saveMarketingPlatformConfig({
    actorId: input.actorId,
    platform: input.platform,
    enabled: true,
    values: input.platform === "Threads"
      ? {
        THREADS_ACCESS_TOKEN: long.accessToken,
        THREADS_USER_ID: userId,
        THREADS_TOKEN_EXPIRES_AT: expiresAt,
      }
      : {
        INSTAGRAM_ACCESS_TOKEN: long.accessToken,
        INSTAGRAM_USER_ID: userId,
        INSTAGRAM_TOKEN_EXPIRES_AT: expiresAt,
      },
  });
  return { userId, expiresAt };
}

async function refreshPlatformToken(platform: MetaMarketingPlatform, now: Date) {
  const tokenKey = platform === "Threads" ? "THREADS_ACCESS_TOKEN" : "INSTAGRAM_ACCESS_TOKEN";
  const expiryKey = platform === "Threads" ? "THREADS_TOKEN_EXPIRES_AT" : "INSTAGRAM_TOKEN_EXPIRES_AT";
  const [token, expiry] = await Promise.all([
    marketingPlatformValue(tokenKey),
    marketingPlatformValue(expiryKey),
  ]);
  if (!token) return { platform, status: "not_connected" as const };
  const expiryTime = expiry ? new Date(expiry).getTime() : 0;
  if (Number.isFinite(expiryTime) && expiryTime > now.getTime() + 14 * 86_400_000) {
    return { platform, status: "fresh" as const };
  }
  const url = new URL(platform === "Threads"
    ? "https://graph.threads.net/refresh_access_token"
    : "https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", platform === "Threads" ? "th_refresh_token" : "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const refreshed = tokenPayload(await jsonRequest(url.toString()));
  const expiresAt = new Date(now.getTime() + (refreshed.expiresIn ?? 5_183_944) * 1_000).toISOString();
  await saveMarketingPlatformConfig({
    actorId: "marketing-agent",
    platform,
    enabled: true,
    values: platform === "Threads"
      ? { THREADS_ACCESS_TOKEN: refreshed.accessToken, THREADS_TOKEN_EXPIRES_AT: expiresAt }
      : { INSTAGRAM_ACCESS_TOKEN: refreshed.accessToken, INSTAGRAM_TOKEN_EXPIRES_AT: expiresAt },
  });
  return { platform, status: "refreshed" as const, expiresAt };
}

export async function refreshMetaMarketingTokens(now = new Date()) {
  return Promise.all([
    refreshPlatformToken("Threads", now),
    refreshPlatformToken("Instagram", now),
  ]);
}

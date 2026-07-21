import crypto from "node:crypto";
import db from "@/lib/db";

const TELEGRAM_PROVIDER = "telegram";
const INIT_DATA_MAX_BYTES = 16_384;
const INIT_DATA_MAX_AGE_SECONDS = 5 * 60;
const INIT_DATA_FUTURE_SKEW_SECONDS = 30;
const AUTH_GRANT_TTL_MS = 2 * 60_000;

export type VerifiedTelegramLaunch = {
  provider: typeof TELEGRAM_PROVIDER;
  subjectId: string;
  authDate: Date;
  launchHash: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
};

type TelegramInitUser = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  is_bot?: unknown;
};

export class TelegramLaunchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TelegramLaunchError";
  }
}

export function telegramMiniAppSsoEnabled() {
  return process.env.TELEGRAM_MINIAPP_SSO_ENABLED?.trim().toLowerCase() === "true";
}

function telegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new TelegramLaunchError("CONFIG_MISSING", "Telegram Mini App пока недоступен");
  return token;
}

function parseTelegramUser(raw: string): TelegramInitUser {
  try {
    const value = JSON.parse(raw) as TelegramInitUser;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
    return value;
  } catch {
    throw new TelegramLaunchError("INVALID_USER", "Не удалось проверить пользователя Telegram");
  }
}

function normalizeSubjectId(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TelegramLaunchError("INVALID_USER", "Telegram не передал идентификатор пользователя");
  }
  const asString = String(value);
  if (!/^\d{1,20}$/.test(asString)) {
    throw new TelegramLaunchError("INVALID_USER", "Telegram передал некорректный идентификатор");
  }
  const asNumber = Number(asString);
  if (!Number.isSafeInteger(asNumber) || asNumber <= 0) {
    throw new TelegramLaunchError("INVALID_USER", "Telegram передал некорректный идентификатор");
  }
  return asString;
}

function safeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  return text ? text.slice(0, maxLength) : null;
}

export function verifyTelegramInitData(rawInitData: string, now = new Date()): VerifiedTelegramLaunch {
  if (!rawInitData || Buffer.byteLength(rawInitData, "utf8") > INIT_DATA_MAX_BYTES) {
    throw new TelegramLaunchError("INVALID_INIT_DATA", "Telegram не передал данные запуска");
  }

  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get("hash")?.toLowerCase();
  const authDateRaw = params.get("auth_date");
  const userRaw = params.get("user");
  if (!receivedHash || !/^[a-f0-9]{64}$/.test(receivedHash) || !authDateRaw || !userRaw) {
    throw new TelegramLaunchError("INVALID_INIT_DATA", "Данные запуска Telegram неполные");
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(telegramBotToken()).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const expectedBytes = Buffer.from(expectedHash, "hex");
  const receivedBytes = Buffer.from(receivedHash, "hex");
  if (expectedBytes.length !== receivedBytes.length || !crypto.timingSafeEqual(expectedBytes, receivedBytes)) {
    throw new TelegramLaunchError("INVALID_SIGNATURE", "Подпись Telegram не прошла проверку");
  }

  if (!/^\d{1,12}$/.test(authDateRaw)) {
    throw new TelegramLaunchError("INVALID_AUTH_DATE", "Время запуска Telegram некорректно");
  }
  const authDateSeconds = Number(authDateRaw);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (authDateSeconds > nowSeconds + INIT_DATA_FUTURE_SKEW_SECONDS || nowSeconds - authDateSeconds > INIT_DATA_MAX_AGE_SECONDS) {
    throw new TelegramLaunchError("STALE_INIT_DATA", "Сессия Telegram устарела. Откройте Mini App ещё раз");
  }

  const user = parseTelegramUser(userRaw);
  if (user.is_bot === true) throw new TelegramLaunchError("BOT_USER", "Бот не может войти как клиент");
  const firstName = safeText(user.first_name, 64) ?? "Гость";

  return {
    provider: TELEGRAM_PROVIDER,
    subjectId: normalizeSubjectId(user.id),
    authDate: new Date(authDateSeconds * 1000),
    launchHash: crypto.createHash("sha256").update(rawInitData).digest("hex"),
    username: safeText(user.username, 64),
    firstName,
    lastName: safeText(user.last_name, 64),
  };
}

function hashGrant(rawGrant: string) {
  return crypto.createHash("sha256").update(rawGrant).digest("hex");
}

export async function findLinkedTelegramUser(launch: VerifiedTelegramLaunch) {
  return db.platformIdentity.findUnique({
    where: { provider_subjectId: { provider: launch.provider, subjectId: launch.subjectId } },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, email: true, name: true, role: true, emailVerified: true, blockedAt: true, deletedAt: true } },
    },
  });
}

export async function issueTelegramAuthGrant(launch: VerifiedTelegramLaunch, userId: string) {
  const rawGrant = crypto.randomBytes(32).toString("base64url");
  await db.miniAppAuthGrant.create({
    data: {
      tokenHash: hashGrant(rawGrant),
      launchHash: launch.launchHash,
      provider: launch.provider,
      subjectId: launch.subjectId,
      userId,
      expiresAt: new Date(Date.now() + AUTH_GRANT_TTL_MS),
    },
  });
  await db.platformIdentity.update({
    where: { provider_subjectId: { provider: launch.provider, subjectId: launch.subjectId } },
    data: { lastSeenAt: new Date(), username: launch.username, displayName: [launch.firstName, launch.lastName].filter(Boolean).join(" ") },
  });
  return rawGrant;
}

export async function consumeMiniAppAuthGrant(rawGrant: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawGrant)) return null;
  const tokenHash = hashGrant(rawGrant);
  return db.$transaction(async (tx) => {
    const grant = await tx.miniAppAuthGrant.findUnique({ where: { tokenHash } });
    if (!grant || grant.consumedAt || grant.expiresAt <= new Date() || grant.provider !== TELEGRAM_PROVIDER) return null;
    const consumed = await tx.miniAppAuthGrant.updateMany({ where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) return null;
    const user = await tx.user.findUnique({ where: { id: grant.userId }, select: { id: true, email: true, name: true, role: true, emailVerified: true, blockedAt: true, deletedAt: true } });
    if (!user || user.blockedAt || user.deletedAt || user.role !== "CLIENT") return null;
    return user;
  });
}

export async function cleanupExpiredMiniAppAuthGrants(now = new Date()) {
  return db.miniAppAuthGrant.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { consumedAt: { not: null } },
      ],
    },
  });
}

export async function linkTelegramIdentity(userId: string, launch: VerifiedTelegramLaunch) {
  return db.$transaction(async (tx) => {
    const [bySubject, byUser] = await Promise.all([
      tx.platformIdentity.findUnique({ where: { provider_subjectId: { provider: launch.provider, subjectId: launch.subjectId } } }),
      tx.platformIdentity.findUnique({ where: { provider_userId: { provider: launch.provider, userId } } }),
    ]);
    if (bySubject && bySubject.userId !== userId) return { ok: false as const, code: "IDENTITY_IN_USE" as const };
    if (byUser && byUser.subjectId !== launch.subjectId) return { ok: false as const, code: "USER_HAS_IDENTITY" as const };
    const identity = await tx.platformIdentity.upsert({
      where: { provider_subjectId: { provider: launch.provider, subjectId: launch.subjectId } },
      create: {
        provider: launch.provider,
        subjectId: launch.subjectId,
        userId,
        username: launch.username,
        displayName: [launch.firstName, launch.lastName].filter(Boolean).join(" "),
      },
      update: {
        username: launch.username,
        displayName: [launch.firstName, launch.lastName].filter(Boolean).join(" "),
        verifiedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    return { ok: true as const, identity };
  });
}

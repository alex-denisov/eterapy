import type { NextRequest } from "next/server";
import { authRateLimitKeyFromRequest, checkRequestAuthRateLimit } from "@/lib/auth-rate-limit";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { startOfDialogueLimitMonth } from "@/lib/guest-fingerprint";

export type DialogueAudience = "guest" | "free" | "plus" | "premium";

// B372 (M26): гость — 1 разбор в КАЛЕНДАРНЫЙ МЕСЯЦ (окно и подсчёт по
// guestSessionId + клиентскому отпечатку); зарегистрированные аудитории
// остаются на дневных лимитах.
const DAILY_NEW_DIALOGUE_LIMIT: Record<DialogueAudience, number | null> = {
  guest: 1,
  free: 3,
  plus: null,
  premium: null,
};
export const GUEST_MONTHLY_DIALOGUE_LIMIT = 1;

export const ABUSE_CAP_NEW_DIALOGUES_PER_DAY = 20;
export const DIALOGUE_LIMIT_TIMEZONE = "UTC";

export function getDialogueDailyLimit(audience: DialogueAudience): number | null {
  return DAILY_NEW_DIALOGUE_LIMIT[audience];
}

export function startOfDialogueLimitDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function resolveDialogueAudience(userId: string | null): Promise<DialogueAudience> {
  if (!userId) return "guest";

  const plan = await getUserActivePlan(userId);
  if (plan?.key === "premium") return "premium";
  if (plan?.key === "plus") return "plus";
  return "free";
}

export async function countStandaloneDialoguesToday(input: {
  userId: string | null;
  guestSessionId: string | null;
  fingerprint?: string | null;
  now?: Date;
}) {
  if (input.userId) {
    return db.dialogue.count({
      where: {
        userId: input.userId,
        intakeProductKey: null,
        createdAt: { gte: startOfDialogueLimitDay(input.now) },
      },
    });
  }

  // B372: гостевое окно — календарный месяц; совпадение по cookie-сессии ИЛИ
  // отпечатку устройства (новая cookie не обнуляет лимит).
  const owners: Array<{ guestSessionId: string } | { guestFingerprint: string }> = [];
  if (input.guestSessionId) owners.push({ guestSessionId: input.guestSessionId });
  if (input.fingerprint) owners.push({ guestFingerprint: input.fingerprint });
  if (owners.length === 0) return 0;

  return db.dialogue.count({
    where: {
      OR: owners,
      intakeProductKey: null,
      createdAt: { gte: startOfDialogueLimitMonth(input.now) },
    },
  });
}

export type DialogueDailyLimitResult =
  | { allowed: true; audience: DialogueAudience; used: number; limit: number | null }
  | {
    allowed: false;
    code: "DIALOGUE_DAILY_LIMIT" | "RATE_LIMITED";
    audience: DialogueAudience;
    used: number;
    limit: number | null;
    cta?: "register" | "upgrade";
    retryAfterSeconds?: number;
  };

export async function checkStandaloneDialogueDailyLimit(input: {
  request: NextRequest;
  userId: string | null;
  guestSessionId: string | null;
  fingerprint?: string | null;
  now?: Date;
}): Promise<DialogueDailyLimitResult> {
  const audience = await resolveDialogueAudience(input.userId);
  const used = await countStandaloneDialoguesToday(input);

  if (used >= ABUSE_CAP_NEW_DIALOGUES_PER_DAY) {
    return {
      allowed: false,
      code: "RATE_LIMITED",
      audience,
      used,
      limit: ABUSE_CAP_NEW_DIALOGUES_PER_DAY,
    };
  }

  if (!input.userId) {
    // IP-страховка остаётся суточной (in-memory) — месячное окно держит БД.
    const ipLimit = checkRequestAuthRateLimit(input.request, "dialogue:daily:guest:ip", 1, 24 * 60 * 60_000);
    if (!ipLimit.allowed) {
      return {
        allowed: false,
        code: "DIALOGUE_DAILY_LIMIT",
        audience,
        used: Math.max(used, 1),
        limit: 1,
        cta: "register",
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      };
    }
  }

  const limit = getDialogueDailyLimit(audience);
  if (limit !== null && used >= limit) {
    return {
      allowed: false,
      code: "DIALOGUE_DAILY_LIMIT",
      audience,
      used,
      limit,
      cta: audience === "guest" ? "register" : "upgrade",
    };
  }

  return { allowed: true, audience, used, limit };
}

export function dialogueDailyLimitKeyForRequest(request: NextRequest) {
  return authRateLimitKeyFromRequest(request, "dialogue:daily:guest:ip");
}

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { CLIENT_FINGERPRINT_COOKIE } from "@/lib/guest-fingerprint";

const REFERRAL_DAILY_REWARD_LIMIT = 5;
const HIGH_RISK_SCORE = 70;

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanHeader(value: string | null) {
  return value?.trim().slice(0, 500) || "unknown";
}

export function requestFingerprint(request: NextRequest) {
  const ip = cleanHeader(
    request.headers.get("x-forwarded-for")?.split(",")[0]
      ?? request.headers.get("x-real-ip")
      ?? request.headers.get("cf-connecting-ip"),
  );
  const ua = cleanHeader(request.headers.get("user-agent"));
  // B464 round-6 #4: the fingerprint beacon writes `eterapy_fp`
  // (CLIENT_FINGERPRINT_COOKIE) — the old `eterapy_device` cookie never existed
  // in the wild, so deviceHash was always null and every device-based referral
  // risk check was dead. Read the real cookie, keep the legacy names as
  // fallbacks for older clients/tests.
  const device = cleanHeader(
    request.headers.get("x-eterapy-device-id")
      ?? request.cookies.get(CLIENT_FINGERPRINT_COOKIE)?.value
      ?? request.cookies.get("eterapy_device")?.value
      ?? null,
  );
  return {
    ipHash: sha(`ip:${ip}`),
    userAgentHash: sha(`ua:${ua}`),
    deviceHash: device === "unknown" ? null : sha(`device:${device}`),
  };
}

export async function logFraudEvent(
  tx: Prisma.TransactionClient,
  input: {
    subjectType: string;
    subjectId?: string | null;
    actorUserId?: string | null;
    riskScore?: number;
    riskFlags?: string[];
    action: string;
    status?: "logged" | "blocked" | "review" | "clawback" | "resolved";
    ipHash?: string | null;
    userAgentHash?: string | null;
    deviceHash?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.fraudEvent.create({
    data: {
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      actorUserId: input.actorUserId ?? null,
      riskScore: input.riskScore ?? 0,
      riskFlags: input.riskFlags ?? [],
      action: input.action,
      status: input.status ?? "logged",
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      deviceHash: input.deviceHash ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}

export async function assessReferralRisk(input: {
  tx: Prisma.TransactionClient;
  referrerUserId: string | null;
  referredUserId: string | null;
  visitorHash: string;
  fingerprint: ReturnType<typeof requestFingerprint>;
  /**
   * Round-6 #4: при повторной оценке риска по УЖЕ существующей атрибуции (этап
   * «первая покупка») её собственный rewarded-статус не должен читаться как
   * «дубликат» — исключаем эту атрибуцию из duplicate-проверки.
   */
  excludeAttributionId?: string | null;
}) {
  const flags = new Set<string>();
  let score = 0;
  const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (input.referrerUserId && input.referrerUserId === input.referredUserId) {
    flags.add("self_referral");
    score += 100;
  }

  const [sameIpDay, sameDeviceDay, rewardsToday, rewardsMonth, duplicateUser] = await Promise.all([
    input.tx.referralAttribution.count({
      where: { ipHash: input.fingerprint.ipHash, createdAt: { gte: sinceDay } },
    }),
    input.fingerprint.deviceHash
      ? input.tx.referralAttribution.count({
          where: { deviceHash: input.fingerprint.deviceHash, createdAt: { gte: sinceDay } },
        })
      : Promise.resolve(0),
    input.referrerUserId
      ? input.tx.clarityCreditLedgerEntry.count({
          where: {
            userId: input.referrerUserId,
            source: "referral",
            type: "grant",
            createdAt: { gte: sinceDay },
            status: { in: ["pending", "confirmed"] },
          },
        })
      : Promise.resolve(0),
    input.referrerUserId
      ? input.tx.clarityCreditLedgerEntry.count({
          where: {
            userId: input.referrerUserId,
            source: "referral",
            type: "grant",
            createdAt: { gte: sinceMonth },
            status: { in: ["pending", "confirmed"] },
          },
        })
      : Promise.resolve(0),
    input.referredUserId
      ? input.tx.referralAttribution.count({
          where: {
            referredUserId: input.referredUserId,
            status: { in: ["REWARD_PENDING", "REWARDED", "REWARD_CONFIRMED"] },
            ...(input.excludeAttributionId ? { id: { not: input.excludeAttributionId } } : {}),
          },
        })
      : Promise.resolve(0),
  ]);

  if (sameIpDay >= 5) {
    flags.add("many_referrals_same_ip_day");
    score += 35;
  }
  if (sameDeviceDay >= 3) {
    flags.add("many_referrals_same_device_day");
    score += 45;
  }
  if (rewardsToday >= REFERRAL_DAILY_REWARD_LIMIT) {
    flags.add("daily_referral_reward_limit");
    score += 80;
  }
  if (rewardsMonth >= 50) {
    flags.add("monthly_referral_reward_limit");
    score += 80;
  }
  if (duplicateUser > 0) {
    flags.add("duplicate_referred_user_reward");
    score += 60;
  }

  return {
    riskScore: Math.min(score, 100),
    riskFlags: [...flags],
    // Round-6 #4: один и тот же приглашённый вознаграждается ОДИН раз — дубль
    // по другой ссылке блокируется сам по себе, не только по сумме баллов.
    shouldBlockReward:
      score >= HIGH_RISK_SCORE
      || flags.has("self_referral")
      || flags.has("daily_referral_reward_limit")
      || flags.has("duplicate_referred_user_reward"),
  };
}

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import db from "@/lib/db";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";
import { APP_URL } from "@/lib/env";
import { mainUrl } from "@/lib/subdomain";
import { assessReferralRisk, logFraudEvent, requestFingerprint } from "@/lib/antifraud";

export const REFERRAL_COOKIE = "eterapy_ref";

// B464 round-6 #4 — утверждённая владельцем (2026-06-30) staged win-win
// экономика. Все начисления сразу confirmed (спендабельны), «pending до
// ревью» отменён — антифрод решает ДО начисления, а возвраты закрываются
// clawback-ом.
//   друг:    +2 балла при его первом разборе;
//   реферер: +1 балл при первом разборе друга;
//   реферер: ещё +2 балла при первой ₽-покупке друга.
export const REFERRAL_REWARDS = {
  refereeFirstAnalysis: 2,
  referrerFirstAnalysis: 1,
  referrerFirstPurchase: 2,
} as const;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function createShareToken() {
  return randomBytes(12).toString("base64url");
}

export function normalizeShareText(value: unknown, fallback: string, max = 220) {
  const raw = typeof value === "string" ? value : "";
  const clean = raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const text = clean || fallback;
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

export function shareLandingUrl(token: string, sourceType = "share", topic?: string | null) {
  // B554 п.12: `mainUrl` отдаёт ОТНОСИТЕЛЬНЫЙ путь, когда сайт живёт на одном
  // домене (NEXT_PUBLIC_USE_SUBDOMAINS != "true") — а односоставный `new URL()`
  // на таком пути кидает TypeError, и создание ссылки падало 500-й. База в
  // втором аргументе игнорируется, если первый уже абсолютный.
  const url = new URL(mainUrl("/share"), APP_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("from", sourceType);
  if (topic) url.searchParams.set("topic", topic);
  return url.toString();
}

export function visitorHashFromRequest(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";
  return createHash("sha256").update(`${ip}\n${ua}`).digest("hex");
}

export function setReferralCookie(response: NextResponse, token: string) {
  response.cookies.set(REFERRAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function readReferralToken(request: NextRequest) {
  return request.cookies.get(REFERRAL_COOKIE)?.value ?? null;
}

export async function createSafeShareLink(input: {
  ownerUserId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  sourceLabel?: string | null;
  topic?: string | null;
  previewText: string;
  hideQuestion?: boolean;
  showWatermark?: boolean;
}) {
  const token = createShareToken();
  return db.shareLink.create({
    data: {
      token,
      ownerUserId: input.ownerUserId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceLabel: input.sourceLabel ?? null,
      topic: input.topic ?? null,
      previewText: normalizeShareText(input.previewText, "Я могу услышать себя бережнее и выбрать один следующий шаг."),
      hideQuestion: input.hideQuestion ?? true,
      showWatermark: input.showWatermark ?? true,
    },
  });
}

export async function recordShareVisit(input: {
  request: NextRequest;
  token: string;
  currentUserId?: string | null;
}) {
  const shareLink = await db.shareLink.findUnique({ where: { token: input.token } });
  if (!shareLink || shareLink.revokedAt) return { status: "missing" as const, shareLink: null };

  const visitorHash = visitorHashFromRequest(input.request);
  const fingerprint = requestFingerprint(input.request);
  const isSelfReferral = Boolean(input.currentUserId && input.currentUserId === shareLink.ownerUserId);
  await db.shareLink.update({
    where: { id: shareLink.id },
    data: {
      openedCount: { increment: 1 },
      lastOpenedAt: new Date(),
    },
  });

  const attribution = await db.referralAttribution.upsert({
    where: {
      shareLinkId_visitorHash: {
        shareLinkId: shareLink.id,
        visitorHash,
      },
    },
    create: {
      shareLinkId: shareLink.id,
      referrerUserId: shareLink.ownerUserId,
      referredUserId: isSelfReferral ? input.currentUserId ?? null : null,
      visitorHash,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      source: shareLink.sourceType,
      status: isSelfReferral ? "BLOCKED" : "OPENED",
      blockedReason: isSelfReferral ? "self_referral" : null,
      riskScore: isSelfReferral ? 100 : 0,
      riskFlags: isSelfReferral ? ["self_referral"] : [],
      metadata: {
        topic: shareLink.topic,
        sourceLabel: shareLink.sourceLabel,
      } as Prisma.InputJsonObject,
    },
    update: isSelfReferral
      ? {
          status: "BLOCKED",
          blockedReason: "self_referral",
          riskScore: 100,
          riskFlags: ["self_referral"],
          referredUserId: input.currentUserId ?? null,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
          deviceHash: fingerprint.deviceHash,
        }
      : {
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
          deviceHash: fingerprint.deviceHash,
          metadata: {
            topic: shareLink.topic,
            sourceLabel: shareLink.sourceLabel,
            lastVisitAt: new Date().toISOString(),
          } as Prisma.InputJsonObject,
        },
  });

  return {
    status: isSelfReferral ? "blocked" as const : "recorded" as const,
    shareLink,
    attribution,
  };
}

export async function attachReferralToRegisteredUser(input: {
  request: NextRequest;
  userId: string;
}) {
  const token = readReferralToken(input.request);
  if (!token) return null;
  const shareLink = await db.shareLink.findUnique({ where: { token } });
  if (!shareLink || shareLink.revokedAt) return null;
  const visitorHash = visitorHashFromRequest(input.request);
  const fingerprint = requestFingerprint(input.request);
  const isSelfReferral = shareLink.ownerUserId === input.userId;

  return db.referralAttribution.upsert({
    where: {
      shareLinkId_visitorHash: {
        shareLinkId: shareLink.id,
        visitorHash,
      },
    },
    create: {
      shareLinkId: shareLink.id,
      referrerUserId: shareLink.ownerUserId,
      referredUserId: input.userId,
      visitorHash,
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      source: shareLink.sourceType,
      status: isSelfReferral ? "BLOCKED" : "REGISTERED",
      blockedReason: isSelfReferral ? "self_referral" : null,
      riskScore: isSelfReferral ? 100 : 0,
      riskFlags: isSelfReferral ? ["self_referral"] : [],
    },
    update: {
      referredUserId: input.userId,
      status: isSelfReferral ? "BLOCKED" : "REGISTERED",
      blockedReason: isSelfReferral ? "self_referral" : null,
      riskScore: isSelfReferral ? 100 : 0,
      riskFlags: isSelfReferral ? ["self_referral"] : [],
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
    },
  });
}

// Round-6 #4 · этап 1 — первый разбор друга. Друг +2 и реферер +1, оба сразу
// confirmed; антифрод решает ДО начисления. Если реферальная cookie уже
// умерла (30 дней/очистка), этап всё равно срабатывает по REGISTERED-атрибуции
// зарегистрированного пользователя — cookie-less fallback.
export async function markReferralMeaningfulAction(input: {
  request: NextRequest;
  userId: string;
  action: string;
  entityId?: string;
}) {
  const token = readReferralToken(input.request);
  const shareLink = token ? await db.shareLink.findUnique({ where: { token } }) : null;
  const fingerprint = requestFingerprint(input.request);
  const now = new Date();

  if (shareLink) {
    if (!shareLink.ownerUserId || shareLink.ownerUserId === input.userId) return null;
    const ownerUserId = shareLink.ownerUserId;
    const visitorHash = visitorHashFromRequest(input.request);
    return db.$transaction(async (tx) => {
      const existing = await tx.referralAttribution.findUnique({
        where: {
          shareLinkId_visitorHash: {
            shareLinkId: shareLink.id,
            visitorHash,
          },
        },
        select: { id: true, rewardGrantedAt: true, blockedReason: true, status: true },
      });
      if (existing?.rewardGrantedAt) return null;
      const risk = await assessReferralRisk({
        tx,
        referrerUserId: ownerUserId,
        referredUserId: input.userId,
        visitorHash,
        fingerprint,
        excludeAttributionId: existing?.id ?? null,
        proposedReferrerRewardCredits: REFERRAL_REWARDS.referrerFirstAnalysis,
      });
      const referredUser = await tx.user.findUnique({
        where: { id: input.userId },
        select: { emailVerified: true },
      });
      const blockedReason = existing?.blockedReason ?? (risk.shouldBlockReward ? risk.riskFlags.join(",") || "high_risk_referral" : null);
      const awaitingEmailVerification = !blockedReason && !referredUser?.emailVerified;

      const attribution = await tx.referralAttribution.upsert({
        where: {
          shareLinkId_visitorHash: {
            shareLinkId: shareLink.id,
            visitorHash,
          },
        },
        create: {
          shareLinkId: shareLink.id,
          referrerUserId: ownerUserId,
          referredUserId: input.userId,
          visitorHash,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
          deviceHash: fingerprint.deviceHash,
          source: shareLink.sourceType,
          status: blockedReason ? "BLOCKED" : awaitingEmailVerification ? "REWARD_PENDING" : "REWARDED",
          blockedReason,
          riskScore: risk.riskScore,
          riskFlags: risk.riskFlags,
          meaningfulActionAt: now,
          rewardGrantedAt: blockedReason || awaitingEmailVerification ? null : now,
          metadata: { action: input.action, entityId: input.entityId, reward: blockedReason ? "blocked" : awaitingEmailVerification ? "awaiting_email_verification" : "first_analysis", credits: blockedReason || awaitingEmailVerification ? 0 : REFERRAL_REWARDS.refereeFirstAnalysis + REFERRAL_REWARDS.referrerFirstAnalysis },
        },
        update: {
          referredUserId: input.userId,
          status: blockedReason ? "BLOCKED" : awaitingEmailVerification ? "REWARD_PENDING" : "REWARDED",
          blockedReason,
          riskScore: risk.riskScore,
          riskFlags: risk.riskFlags,
          ipHash: fingerprint.ipHash,
          userAgentHash: fingerprint.userAgentHash,
          deviceHash: fingerprint.deviceHash,
          meaningfulActionAt: now,
          rewardGrantedAt: blockedReason || awaitingEmailVerification ? null : now,
          metadata: { action: input.action, entityId: input.entityId, reward: blockedReason ? "blocked" : awaitingEmailVerification ? "awaiting_email_verification" : "first_analysis", credits: blockedReason || awaitingEmailVerification ? 0 : REFERRAL_REWARDS.refereeFirstAnalysis + REFERRAL_REWARDS.referrerFirstAnalysis },
        },
      });

      if (blockedReason) {
        await logBlockedReward(tx, { attributionId: attribution.id, userId: input.userId, referrerUserId: ownerUserId, risk, fingerprint, action: input.action, entityId: input.entityId });
        return attribution;
      }
      if (awaitingEmailVerification) return attribution;
      await grantFirstAnalysisRewards(tx, {
        attributionId: attribution.id,
        referrerUserId: ownerUserId,
        referredUserId: input.userId,
        action: input.action,
        entityId: input.entityId,
        risk,
        fingerprint,
        now,
      });
      return attribution;
    });
  }

  // Cookie-less fallback: атрибуция уже создана при регистрации/визите — этап
  // «первый разбор» не должен теряться из-за отсутствия cookie.
  return db.$transaction(async (tx) => {
    const attribution = await tx.referralAttribution.findFirst({
      where: {
        referredUserId: input.userId,
        referrerUserId: { not: null },
        status: { in: ["OPENED", "REGISTERED"] },
        rewardGrantedAt: null,
        blockedReason: null,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!attribution?.referrerUserId || attribution.referrerUserId === input.userId) return null;
    const risk = await assessReferralRisk({
      tx,
      referrerUserId: attribution.referrerUserId,
      referredUserId: input.userId,
      visitorHash: attribution.visitorHash,
      fingerprint,
      excludeAttributionId: attribution.id,
      proposedReferrerRewardCredits: REFERRAL_REWARDS.referrerFirstAnalysis,
    });
    const blockedReason = risk.shouldBlockReward ? risk.riskFlags.join(",") || "high_risk_referral" : null;
    const referredUser = await tx.user.findUnique({
      where: { id: input.userId },
      select: { emailVerified: true },
    });
    const awaitingEmailVerification = !blockedReason && !referredUser?.emailVerified;
    await tx.referralAttribution.update({
      where: { id: attribution.id },
      data: {
        status: blockedReason ? "BLOCKED" : awaitingEmailVerification ? "REWARD_PENDING" : "REWARDED",
        blockedReason,
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        meaningfulActionAt: now,
        rewardGrantedAt: blockedReason || awaitingEmailVerification ? null : now,
        metadata: { action: input.action, entityId: input.entityId, reward: blockedReason ? "blocked" : awaitingEmailVerification ? "awaiting_email_verification" : "first_analysis", via: "registered_attribution_fallback" },
      },
    });
    if (blockedReason) {
      await logBlockedReward(tx, { attributionId: attribution.id, userId: input.userId, referrerUserId: attribution.referrerUserId, risk, fingerprint, action: input.action, entityId: input.entityId });
      return attribution;
    }
    if (awaitingEmailVerification) return attribution;
    await grantFirstAnalysisRewards(tx, {
      attributionId: attribution.id,
      referrerUserId: attribution.referrerUserId,
      referredUserId: input.userId,
      action: input.action,
      entityId: input.entityId,
      risk,
      fingerprint,
      now,
    });
    return attribution;
  });
}

export async function confirmReferralOnVerification(input: {
  request: NextRequest;
  userId: string;
}) {
  const fingerprint = requestFingerprint(input.request);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const attribution = await tx.referralAttribution.findFirst({
      where: {
        referredUserId: input.userId,
        referrerUserId: { not: null },
        status: "REWARD_PENDING",
        rewardGrantedAt: null,
        blockedReason: null,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!attribution?.referrerUserId) return null;

    const risk = await assessReferralRisk({
      tx,
      referrerUserId: attribution.referrerUserId,
      referredUserId: input.userId,
      visitorHash: attribution.visitorHash,
      fingerprint,
      excludeAttributionId: attribution.id,
      proposedReferrerRewardCredits: REFERRAL_REWARDS.referrerFirstAnalysis,
    });
    if (risk.shouldBlockReward) {
      const blockedReason = risk.riskFlags.join(",") || "high_risk_referral";
      await tx.referralAttribution.update({
        where: { id: attribution.id },
        data: { status: "BLOCKED", blockedReason, riskScore: risk.riskScore, riskFlags: risk.riskFlags },
      });
      await logBlockedReward(tx, {
        attributionId: attribution.id,
        userId: input.userId,
        referrerUserId: attribution.referrerUserId,
        risk,
        fingerprint,
        action: "email_verified",
      });
      return null;
    }

    await tx.referralAttribution.update({
      where: { id: attribution.id },
      data: {
        status: "REWARDED",
        rewardGrantedAt: now,
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        metadata: {
          ...((attribution.metadata as Prisma.JsonObject | null) ?? {}),
          reward: "first_analysis",
          grantedAfterEmailVerification: true,
          credits: REFERRAL_REWARDS.refereeFirstAnalysis + REFERRAL_REWARDS.referrerFirstAnalysis,
        } as Prisma.InputJsonObject,
      },
    });
    await grantFirstAnalysisRewards(tx, {
      attributionId: attribution.id,
      referrerUserId: attribution.referrerUserId,
      referredUserId: input.userId,
      action: "email_verified",
      risk,
      fingerprint,
      now,
    });
    return attribution;
  });
}

type ReferralRisk = Awaited<ReturnType<typeof assessReferralRisk>>;
type ReferralFingerprint = ReturnType<typeof requestFingerprint>;

async function logBlockedReward(
  tx: Prisma.TransactionClient,
  input: {
    attributionId: string;
    userId: string;
    referrerUserId: string;
    risk: ReferralRisk;
    fingerprint: ReferralFingerprint;
    action: string;
    entityId?: string;
  },
) {
  await logFraudEvent(tx, {
    subjectType: "referral",
    subjectId: input.attributionId,
    actorUserId: input.userId,
    riskScore: input.risk.riskScore,
    riskFlags: input.risk.riskFlags,
    action: "referral_reward_blocked",
    status: "blocked",
    ipHash: input.fingerprint.ipHash,
    userAgentHash: input.fingerprint.userAgentHash,
    deviceHash: input.fingerprint.deviceHash,
    metadata: { referrerUserId: input.referrerUserId, action: input.action, entityId: input.entityId } as Prisma.InputJsonObject,
  });
}

async function grantFirstAnalysisRewards(
  tx: Prisma.TransactionClient,
  input: {
    attributionId: string;
    referrerUserId: string;
    referredUserId: string;
    action: string;
    entityId?: string;
    risk: ReferralRisk;
    fingerprint: ReferralFingerprint;
    now: Date;
  },
) {
  const expiresAt = creditExpiryFor("referral", input.now);
  await recordClarityCreditEntry(tx, {
    userId: input.referredUserId,
    amount: REFERRAL_REWARDS.refereeFirstAnalysis,
    type: "grant",
    source: "referral",
    sourceEventId: `referee:${input.attributionId}`,
    status: "confirmed",
    expiresAt,
    metadata: {
      action: input.action,
      entityId: input.entityId,
      referrerUserId: input.referrerUserId,
      attributionId: input.attributionId,
      reward: "referee_first_analysis",
    } as Prisma.InputJsonObject,
  });
  await recordClarityCreditEntry(tx, {
    userId: input.referrerUserId,
    amount: REFERRAL_REWARDS.referrerFirstAnalysis,
    type: "grant",
    source: "referral",
    sourceEventId: `referrer:${input.attributionId}`,
    status: "confirmed",
    expiresAt,
    metadata: {
      action: input.action,
      entityId: input.entityId,
      referredUserId: input.referredUserId,
      attributionId: input.attributionId,
      reward: "referrer_first_analysis",
    } as Prisma.InputJsonObject,
  });
  await logFraudEvent(tx, {
    subjectType: "referral",
    subjectId: input.attributionId,
    actorUserId: input.referredUserId,
    riskScore: input.risk.riskScore,
    riskFlags: input.risk.riskFlags,
    action: "referral_reward_granted",
    status: "logged",
    ipHash: input.fingerprint.ipHash,
    userAgentHash: input.fingerprint.userAgentHash,
    deviceHash: input.fingerprint.deviceHash,
    metadata: { referrerUserId: input.referrerUserId, action: input.action, entityId: input.entityId } as Prisma.InputJsonObject,
  });
}

// Round-6 #4 · этап 2 — первая ₽-покупка друга: рефереру ещё +2 (confirmed).
// Вызывается из creditSucceededPayment (единая точка сеттла всех успешных
// платежей) БЕЗ request-контекста — риск считается по сохранённым хэшам
// атрибуции. Идемпотентно по sourceEventId.
export async function markReferralFirstPurchase(input: {
  userId: string;
  transactionId: string;
  amountKopecks: number;
}) {
  const referredUser = await db.user.findUnique({
    where: { id: input.userId },
    select: { emailVerified: true },
  });
  if (!referredUser?.emailVerified) return null;

  const succeeded = await db.transaction.count({
    where: { userId: input.userId, status: "SUCCEEDED" },
  });
  // Только ПЕРВЫЙ успешный платёж (текущий уже SUCCEEDED и входит в count).
  if (succeeded > 1) return null;

  const attribution = await db.referralAttribution.findFirst({
    where: {
      referredUserId: input.userId,
      referrerUserId: { not: null },
      status: { in: ["REGISTERED", "REWARD_PENDING", "REWARDED"] },
      blockedReason: null,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!attribution?.referrerUserId || attribution.referrerUserId === input.userId) return null;
  const referrerUserId = attribution.referrerUserId;
  const sourceEventId = `referrer-purchase:${attribution.id}`;
  const now = new Date();

  return db.$transaction(async (tx) => {
    const existing = await tx.clarityCreditLedgerEntry.findFirst({
      where: { source: "referral", sourceEventId, status: { not: "revoked" } },
      select: { id: true },
    });
    if (existing) return null;

    const fingerprint: ReferralFingerprint = {
      ipHash: attribution.ipHash ?? "unknown",
      userAgentHash: attribution.userAgentHash ?? "unknown",
      deviceHash: attribution.deviceHash,
    };
    const risk = await assessReferralRisk({
      tx,
      referrerUserId,
      referredUserId: input.userId,
      visitorHash: attribution.visitorHash,
      fingerprint,
      excludeAttributionId: attribution.id,
      proposedReferrerRewardCredits: REFERRAL_REWARDS.referrerFirstPurchase,
    });
    if (risk.shouldBlockReward) {
      await logFraudEvent(tx, {
        subjectType: "referral",
        subjectId: attribution.id,
        actorUserId: input.userId,
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        action: "referral_purchase_reward_blocked",
        status: "blocked",
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        deviceHash: fingerprint.deviceHash,
        metadata: { referrerUserId, transactionId: input.transactionId } as Prisma.InputJsonObject,
      });
      return null;
    }

    await recordClarityCreditEntry(tx, {
      userId: referrerUserId,
      amount: REFERRAL_REWARDS.referrerFirstPurchase,
      type: "grant",
      source: "referral",
      sourceEventId,
      status: "confirmed",
      expiresAt: creditExpiryFor("referral", now),
      metadata: {
        referredUserId: input.userId,
        attributionId: attribution.id,
        transactionId: input.transactionId,
        amountKopecks: input.amountKopecks,
        reward: "referrer_first_purchase",
      } as Prisma.InputJsonObject,
    });
    const updated = await tx.referralAttribution.update({
      where: { id: attribution.id },
      data: {
        status: "REWARD_CONFIRMED",
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        metadata: {
          ...((attribution.metadata as Prisma.JsonObject | null) ?? {}),
          purchaseTransactionId: input.transactionId,
          purchaseRewardedAt: now.toISOString(),
        } as Prisma.InputJsonObject,
      },
    });
    await logFraudEvent(tx, {
      subjectType: "referral",
      subjectId: attribution.id,
      actorUserId: input.userId,
      riskScore: risk.riskScore,
      riskFlags: risk.riskFlags,
      action: "referral_purchase_reward_granted",
      status: "logged",
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      metadata: { referrerUserId, transactionId: input.transactionId } as Prisma.InputJsonObject,
    });
    return updated;
  });
}

export async function clawbackReferralRewardsForUser(input: {
  referredUserId: string;
  reason: string;
  sourceEventId?: string | null;
}) {
  const attributions = await db.referralAttribution.findMany({
    where: {
      referredUserId: input.referredUserId,
      status: { in: ["REWARD_PENDING", "REWARDED", "REWARD_CONFIRMED"] },
      referrerUserId: { not: null },
    },
    select: { id: true, referrerUserId: true, referredUserId: true, riskScore: true, riskFlags: true },
  });

  for (const attribution of attributions) {
    await db.$transaction(async (tx) => {
      await tx.referralAttribution.update({
        where: { id: attribution.id },
        data: {
          status: "REWARD_REVOKED",
          blockedReason: input.reason,
          riskFlags: Array.from(new Set([...attribution.riskFlags, "refund_clawback"])),
        },
      });
      // Round-6 #4: снимаем ровно то, что реально начислялось по этой атрибуции
      // (staged-экономика: referee 2 · referrer 1 · referrer-purchase 2; для
      // легаси-строк — их фактические суммы), а не фиксированную константу.
      const grants = await tx.clarityCreditLedgerEntry.findMany({
        where: {
          source: "referral",
          type: "grant",
          status: { not: "revoked" },
          sourceEventId: {
            in: [`referee:${attribution.id}`, `referrer:${attribution.id}`, `referrer-purchase:${attribution.id}`],
          },
        },
        select: { userId: true, amount: true, sourceEventId: true },
      });
      for (const grant of grants) {
        await recordClarityCreditEntry(tx, {
          userId: grant.userId,
          amount: -grant.amount,
          type: "clawback",
          source: "referral",
          sourceEventId: input.sourceEventId ?? `clawback:${grant.sourceEventId}`,
          status: "confirmed",
          metadata: {
            reason: input.reason,
            referredUserId: input.referredUserId,
            referrerUserId: attribution.referrerUserId,
            attributionId: attribution.id,
            grantSourceEventId: grant.sourceEventId,
          } as Prisma.InputJsonObject,
        });
      }
      await logFraudEvent(tx, {
        subjectType: "referral",
        subjectId: attribution.id,
        actorUserId: input.referredUserId,
        riskScore: Math.max(attribution.riskScore, 80),
        riskFlags: Array.from(new Set([...attribution.riskFlags, "refund_clawback"])),
        action: "referral_reward_clawback",
        status: "clawback",
        metadata: { reason: input.reason, sourceEventId: input.sourceEventId } as Prisma.InputJsonObject,
      });
    });
  }

  return { clawedBack: attributions.length };
}

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import db from "@/lib/db";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { mainUrl } from "@/lib/subdomain";

export const REFERRAL_COOKIE = "eterapy_ref";
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
  const url = new URL(mainUrl("/share"));
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
      source: shareLink.sourceType,
      status: isSelfReferral ? "BLOCKED" : "OPENED",
      blockedReason: isSelfReferral ? "self_referral" : null,
      metadata: {
        topic: shareLink.topic,
        sourceLabel: shareLink.sourceLabel,
      } as Prisma.InputJsonObject,
    },
    update: isSelfReferral
      ? {
          status: "BLOCKED",
          blockedReason: "self_referral",
          referredUserId: input.currentUserId ?? null,
        }
      : {
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
      source: shareLink.sourceType,
      status: isSelfReferral ? "BLOCKED" : "REGISTERED",
      blockedReason: isSelfReferral ? "self_referral" : null,
    },
    update: {
      referredUserId: input.userId,
      status: isSelfReferral ? "BLOCKED" : "REGISTERED",
      blockedReason: isSelfReferral ? "self_referral" : null,
    },
  });
}

export async function markReferralMeaningfulAction(input: {
  request: NextRequest;
  userId: string;
  action: string;
  entityId?: string;
}) {
  const token = readReferralToken(input.request);
  if (!token) return null;
  const shareLink = await db.shareLink.findUnique({ where: { token } });
  if (!shareLink || !shareLink.ownerUserId || shareLink.ownerUserId === input.userId) return null;
  const ownerUserId = shareLink.ownerUserId;
  const visitorHash = visitorHashFromRequest(input.request);
  const now = new Date();
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

    const attribution = await tx.referralAttribution.upsert({
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
        source: shareLink.sourceType,
        status: "REWARD_PENDING",
        meaningfulActionAt: now,
        rewardGrantedAt: now,
        metadata: { action: input.action, entityId: input.entityId, reward: "pending_credit", credits: 1 },
      },
      update: {
        referredUserId: input.userId,
        status: existing?.blockedReason ? "BLOCKED" : "REWARD_PENDING",
        meaningfulActionAt: now,
        rewardGrantedAt: existing?.rewardGrantedAt ?? now,
        metadata: { action: input.action, entityId: input.entityId, reward: "pending_credit", credits: 1 },
      },
    });

    if (!existing?.rewardGrantedAt && !existing?.blockedReason) {
      const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      await recordClarityCreditEntry(tx, {
        userId: ownerUserId,
        amount: 1,
        type: "grant",
        source: "referral",
        sourceEventId: attribution.id,
        status: "pending",
        expiresAt,
        metadata: {
          action: input.action,
          entityId: input.entityId,
          referredUserId: input.userId,
          hold: "meaningful_action_pending_review",
        } as Prisma.InputJsonObject,
      });
    }

    return attribution;
  });
}

import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import db from "@/lib/db";
import { requestFingerprint, logFraudEvent } from "@/lib/antifraud";
import { mainUrl } from "@/lib/subdomain";
import { visitorHashFromRequest } from "@/lib/share-referral";
import {
  commissionForSource,
  isFoundingActive,
  tierForPlanKey,
  type BookingClientSource,
} from "@/lib/practitioner-commission";

export const BYOC_COOKIE = "eterapy_byoc";
export const BYOC_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
export const FOUNDING_COHORT_CAP = 150;
export const FOUNDING_COHORT_MONTHS = 12;

type ByocTx = Prisma.TransactionClient | typeof db;
type ResolveClientSourceResult = {
  source: BookingClientSource;
  firstTouchInviteId: string | null;
  attributionPractitionerId: string | null;
  reason: "sticky_link" | "first_touch" | "organic" | "other_byoc_practitioner" | "expired_link";
};

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function createPractitionerInviteToken() {
  return randomBytes(12).toString("base64url");
}

export function practitionerInviteLandingUrl(slug: string, token: string) {
  const url = new URL(mainUrl(`/p/${slug}`));
  url.searchParams.set("ref", token);
  return url.toString();
}

export function setByocCookie(response: NextResponse, token: string) {
  response.cookies.set(BYOC_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: BYOC_COOKIE_MAX_AGE,
    path: "/",
  });
}

export function readByocCookie(request: NextRequest) {
  return request.cookies.get(BYOC_COOKIE)?.value ?? null;
}

export async function createPractitionerInvite(input: {
  practitionerId: string;
  label?: string | null;
  freeAiHook?: string | null;
}, tx: ByocTx = db) {
  return tx.practitionerInvite.create({
    data: {
      practitionerId: input.practitionerId,
      token: createPractitionerInviteToken(),
      label: input.label?.trim() || "Основная ссылка",
      freeAiHook: input.freeAiHook?.trim() || null,
    },
  });
}

export async function recordPractitionerInviteVisit(input: {
  request: NextRequest;
  slug: string;
  token: string | null;
  currentUserId?: string | null;
}) {
  if (!input.token) return { status: "missing" as const, invite: null };
  const invite = await db.practitionerInvite.findFirst({
    where: {
      token: input.token,
      status: "ACTIVE",
      practitioner: {
        slug: input.slug,
        status: "ACTIVE",
        verified: true,
      },
    },
    include: {
      practitioner: { select: { id: true, userId: true, slug: true } },
    },
  });
  if (!invite) return { status: "missing" as const, invite: null };

  const visitorHash = visitorHashFromRequest(input.request);
  const fingerprint = requestFingerprint(input.request);
  const isSelf = Boolean(input.currentUserId && input.currentUserId === invite.practitioner.userId);
  const visitKey = {
    inviteId: invite.id,
    visitorHash,
  };
  const existingVisit = await db.practitionerInviteVisit.findUnique({
    where: { inviteId_visitorHash: visitKey },
    select: { id: true },
  });
  const visit = await db.practitionerInviteVisit.upsert({
    where: {
      inviteId_visitorHash: visitKey,
    },
    create: {
      inviteId: invite.id,
      visitorHash,
      referredUserId: input.currentUserId && !isSelf ? input.currentUserId : null,
      status: isSelf ? "BLOCKED" : "OPENED",
      blockedReason: isSelf ? "self_deal" : null,
      riskScore: isSelf ? 100 : 0,
      riskFlags: isSelf ? ["byoc_self_deal"] : [],
      ...fingerprint,
      metadata: { landingSlug: input.slug } as Prisma.InputJsonObject,
    },
    update: isSelf
      ? {
          status: "BLOCKED",
          blockedReason: "self_deal",
          riskScore: 100,
          riskFlags: ["byoc_self_deal"],
          referredUserId: input.currentUserId,
          ...fingerprint,
        }
      : {
          referredUserId: input.currentUserId ?? undefined,
          ...fingerprint,
          metadata: { landingSlug: input.slug, lastVisitAt: new Date().toISOString() } as Prisma.InputJsonObject,
        },
  });

  if (!existingVisit && !isSelf) {
    await db.practitionerInvite.update({
      where: { id: invite.id },
      data: { openedCount: { increment: 1 } },
    });
  }

  if (isSelf) {
    await db.$transaction((tx) => logFraudEvent(tx, {
      subjectType: "practitioner_invite",
      subjectId: invite.id,
      actorUserId: input.currentUserId ?? null,
      action: "byoc_self_deal",
      status: "blocked",
      riskScore: 100,
      riskFlags: ["byoc_self_deal"],
      ...fingerprint,
      metadata: { practitionerId: invite.practitioner.id },
    }));
  }

  return { status: isSelf ? "blocked" as const : "recorded" as const, invite, visit };
}

export async function attachByocAtRegistration(input: {
  request: NextRequest;
  userId: string;
}) {
  const token = readByocCookie(input.request);
  if (!token) return null;

  const invite = await db.practitionerInvite.findUnique({
    where: { token },
    include: { practitioner: { select: { id: true, userId: true } } },
  });
  if (!invite || invite.status !== "ACTIVE") return null;

  const visitorHash = visitorHashFromRequest(input.request);
  const fingerprint = requestFingerprint(input.request);
  const isSelf = invite.practitioner.userId === input.userId;

  if (isSelf) {
    await db.$transaction((tx) => logFraudEvent(tx, {
      subjectType: "practitioner_invite",
      subjectId: invite.id,
      actorUserId: input.userId,
      action: "byoc_self_registration",
      status: "blocked",
      riskScore: 100,
      riskFlags: ["byoc_self_deal"],
      ...fingerprint,
      metadata: { practitionerId: invite.practitioner.id },
    }));
    return null;
  }

  const [attribution] = await db.$transaction([
    db.clientAttribution.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        firstTouchSource: "BYOC",
        firstTouchInviteId: invite.id,
        firstTouchPractitionerId: invite.practitioner.id,
        metadata: { source: "byoc_registration_cookie" } as Prisma.InputJsonObject,
      },
      update: {},
    }),
    db.practitionerInviteVisit.upsert({
      where: {
        inviteId_visitorHash: {
          inviteId: invite.id,
          visitorHash,
        },
      },
      create: {
        inviteId: invite.id,
        visitorHash,
        referredUserId: input.userId,
        status: "REGISTERED",
        ...fingerprint,
      },
      update: {
        referredUserId: input.userId,
        status: "REGISTERED",
        ...fingerprint,
      },
    }),
    db.practitionerInvite.update({
      where: { id: invite.id },
      data: { registeredCount: { increment: 1 } },
    }),
  ]);

  return attribution;
}

async function practitionerTierForUser(tx: ByocTx, userId: string, now: Date) {
  const subscriptions = await tx.userSubscription.findMany({
    where: {
      userId,
      planKey: { in: ["practitioner_pro", "practitioner_pro_plus"] },
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { planKey: true },
  });
  const planKeys = subscriptions.map((subscription) => subscription.planKey);
  if (planKeys.includes("practitioner_pro_plus")) return "practitioner_pro_plus";
  if (planKeys.includes("practitioner_pro")) return "practitioner_pro";
  return "base";
}

export async function resolveClientSource(input: {
  clientId: string;
  practitionerId: string;
  now?: Date;
  tx?: ByocTx;
}): Promise<ResolveClientSourceResult> {
  const tx = input.tx ?? db;
  const now = input.now ?? new Date();
  const link = await tx.clientPractitionerLink.findUnique({
    where: {
      clientId_practitionerId: {
        clientId: input.clientId,
        practitionerId: input.practitionerId,
      },
    },
    select: { source: true, status: true, expiresAt: true, metadata: true },
  });
  if (link?.status === "ACTIVE" && link.expiresAt > now) {
    const metadata = link.metadata && typeof link.metadata === "object" && !Array.isArray(link.metadata)
      ? link.metadata as Record<string, unknown>
      : {};
    return {
      source: link.source,
      firstTouchInviteId: typeof metadata.firstTouchInviteId === "string" ? metadata.firstTouchInviteId : null,
      attributionPractitionerId: input.practitionerId,
      reason: "sticky_link",
    };
  }

  const attribution = await tx.clientAttribution.findUnique({
    where: { userId: input.clientId },
    select: { firstTouchSource: true, firstTouchInviteId: true, firstTouchPractitionerId: true },
  });
  if (attribution?.firstTouchSource === "BYOC" && attribution.firstTouchPractitionerId === input.practitionerId) {
    return {
      source: "BYOC",
      firstTouchInviteId: attribution.firstTouchInviteId,
      attributionPractitionerId: attribution.firstTouchPractitionerId,
      reason: "first_touch",
    };
  }
  if (attribution?.firstTouchSource === "BYOC") {
    return {
      source: "PLATFORM",
      firstTouchInviteId: attribution.firstTouchInviteId,
      attributionPractitionerId: attribution.firstTouchPractitionerId,
      reason: "other_byoc_practitioner",
    };
  }
  if (attribution?.firstTouchSource === "PLATFORM") {
    return {
      source: "PLATFORM",
      firstTouchInviteId: null,
      attributionPractitionerId: null,
      reason: "organic",
    };
  }
  return {
    source: "PLATFORM",
    firstTouchInviteId: null,
    attributionPractitionerId: null,
    reason: link ? "expired_link" : "organic",
  };
}

export async function resolveByocBookingCommission(input: {
  clientId: string;
  practitionerId: string;
  request?: NextRequest;
  tx?: ByocTx;
  now?: Date;
}) {
  const tx = input.tx ?? db;
  const now = input.now ?? new Date();
  const practitioner = await tx.practitioner.findUnique({
    where: { id: input.practitionerId },
    select: {
      id: true,
      userId: true,
      isFoundingCohort: true,
      foundingUntil: true,
    },
  });
  if (!practitioner) {
    return {
      source: "PLATFORM" as BookingClientSource,
      referrerPractitionerId: null,
      commissionPercentApplied: 35,
      shouldBlock: false,
      riskFlags: [] as string[],
    };
  }

  const fingerprint = input.request ? requestFingerprint(input.request) : {};
  if (practitioner.userId === input.clientId) {
    await logFraudEvent(tx as Prisma.TransactionClient, {
      subjectType: "practitioner",
      subjectId: input.practitionerId,
      actorUserId: input.clientId,
      action: "byoc_self_deal",
      status: "blocked",
      riskScore: 100,
      riskFlags: ["byoc_self_deal"],
      ...fingerprint,
      metadata: { practitionerId: input.practitionerId },
    });
    return {
      source: "PLATFORM" as BookingClientSource,
      referrerPractitionerId: null,
      commissionPercentApplied: 35,
      shouldBlock: true,
      riskFlags: ["byoc_self_deal"],
    };
  }

  const sourceResolution = await resolveClientSource({
    clientId: input.clientId,
    practitionerId: input.practitionerId,
    now,
    tx,
  });
  const source = sourceResolution.source;

  if (sourceResolution.reason === "other_byoc_practitioner") {
    await logFraudEvent(tx as Prisma.TransactionClient, {
      subjectType: "practitioner",
      subjectId: input.practitionerId,
      actorUserId: input.clientId,
      action: "byoc_poaching",
      status: "review",
      riskScore: 70,
      riskFlags: ["byoc_poaching"],
      ...fingerprint,
      metadata: {
        practitionerId: input.practitionerId,
        attributedPractitionerId: sourceResolution.attributionPractitionerId,
        firstTouchInviteId: sourceResolution.firstTouchInviteId,
      },
    });
  }

  if (sourceResolution.reason === "organic" && input.request && readByocCookie(input.request)) {
    await logFraudEvent(tx as Prisma.TransactionClient, {
      subjectType: "practitioner",
      subjectId: input.practitionerId,
      actorUserId: input.clientId,
      action: "byoc_existing_client",
      status: "review",
      riskScore: 50,
      riskFlags: ["byoc_existing_client"],
      ...fingerprint,
      metadata: { practitionerId: input.practitionerId },
    });
  }

  const tier = tierForPlanKey(await practitionerTierForUser(tx, practitioner.userId, now));
  const foundingActive = isFoundingActive(practitioner, now);
  const commissionPercentApplied = commissionForSource(source, tier, foundingActive);

  return {
    source,
    referrerPractitionerId: source === "BYOC" ? input.practitionerId : null,
    commissionPercentApplied,
    firstTouchInviteId: sourceResolution.firstTouchInviteId,
    shouldBlock: false,
    riskFlags: sourceResolution.reason === "other_byoc_practitioner" ? ["byoc_poaching"] : [] as string[],
  };
}

export async function finalizeByocBookingAttribution(input: {
  clientId: string;
  practitionerId: string;
  source: BookingClientSource;
  firstTouchInviteId?: string | null;
  tx?: ByocTx;
  now?: Date;
}) {
  const tx = input.tx ?? db;
  const now = input.now ?? new Date();

  if (input.source === "BYOC") {
    await tx.clientPractitionerLink.upsert({
      where: {
        clientId_practitionerId: {
          clientId: input.clientId,
          practitionerId: input.practitionerId,
        },
      },
      create: {
        clientId: input.clientId,
        practitionerId: input.practitionerId,
        source: "BYOC",
        status: "ACTIVE",
        lastBookingAt: now,
        expiresAt: addDays(now, 365),
        metadata: input.firstTouchInviteId
          ? { firstTouchInviteId: input.firstTouchInviteId } as Prisma.InputJsonObject
          : undefined,
      },
      update: {
        source: "BYOC",
        status: "ACTIVE",
        lastBookingAt: now,
        expiresAt: addDays(now, 365),
        metadata: input.firstTouchInviteId
          ? { firstTouchInviteId: input.firstTouchInviteId } as Prisma.InputJsonObject
          : undefined,
      },
    });
    if (input.firstTouchInviteId) {
      await tx.practitionerInvite.updateMany({
        where: { id: input.firstTouchInviteId, practitionerId: input.practitionerId },
        data: { bookedCount: { increment: 1 } },
      });
    }
    return;
  }

  await tx.clientAttribution.upsert({
    where: { userId: input.clientId },
    create: {
      userId: input.clientId,
      firstTouchSource: "PLATFORM",
      metadata: { source: "booking_default" } as Prisma.InputJsonObject,
    },
    update: {},
  });
}

export async function assignFoundingCohortIfEligible(
  practitionerId: string,
  tx: ByocTx = db,
  now = new Date(),
) {
  const practitioner = await tx.practitioner.findUnique({
    where: { id: practitionerId },
    select: {
      id: true,
      verifiedAt: true,
      isFoundingCohort: true,
      foundingUntil: true,
    },
  });
  if (!practitioner || practitioner.isFoundingCohort) return null;

  const cohortSize = await tx.practitioner.count({ where: { isFoundingCohort: true } });
  if (cohortSize >= FOUNDING_COHORT_CAP) return null;

  const startsAt = practitioner.verifiedAt ?? now;
  return tx.practitioner.update({
    where: { id: practitioner.id },
    data: {
      isFoundingCohort: true,
      foundingUntil: practitioner.foundingUntil ?? addMonths(startsAt, FOUNDING_COHORT_MONTHS),
    },
  });
}

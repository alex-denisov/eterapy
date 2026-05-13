import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import type { Permission } from "@/lib/moderator-permissions";

export const ANTIFRAUD_REVIEW_STATUSES = ["review", "blocked", "clawback"] as const;

export function canReviewAntifraud(role: string | undefined, permissions: Permission[]) {
  return role === "SUPERADMIN" || permissions.includes("antifraud.review") || permissions.includes("safety.review");
}

export function fraudMetadataObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

export async function getAdminAntifraudData() {
  const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    totalEvents,
    reviewQueue,
    blockedEvents,
    clawbackEvents,
    appealQueue,
    highRiskEvents,
    recentEvents,
    statusGroups,
    actionGroups,
    subjectGroups,
    referralRisk,
    creditHolds,
    practitionerRisk,
    heldPayouts,
    riskyReviews,
  ] = await Promise.all([
    db.fraudEvent.count(),
    db.fraudEvent.count({ where: { status: { in: [...ANTIFRAUD_REVIEW_STATUSES] } } }),
    db.fraudEvent.count({ where: { status: "blocked" } }),
    db.fraudEvent.count({ where: { status: "clawback" } }),
    db.fraudEvent.count({ where: { action: "appeal_submitted", status: { not: "resolved" } } }),
    db.fraudEvent.count({ where: { riskScore: { gte: 70 } } }),
    db.fraudEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.fraudEvent.groupBy({ by: ["status"], _count: { _all: true } }),
    db.fraudEvent.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { _count: { action: "desc" } }, take: 12 }),
    db.fraudEvent.groupBy({ by: ["subjectType"], _count: { _all: true }, orderBy: { _count: { subjectType: "desc" } } }),
    db.referralAttribution.count({ where: { riskScore: { gte: 70 } } }),
    db.clarityCreditLedgerEntry.count({ where: { status: { in: ["pending", "revoked"] } } }),
    db.practitioner.count({ where: { riskScore: { gte: 70 } } }),
    db.payout.count({ where: { status: "HELD" } }),
    db.review.count({ where: { status: "REVIEW" } }),
  ]);

  const todayEvents = await db.fraudEvent.count({ where: { createdAt: { gte: sinceDay } } });
  const actorIds = [...new Set(recentEvents.map((event) => event.actorUserId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  return {
    metrics: {
      totalEvents,
      todayEvents,
      reviewQueue,
      blockedEvents,
      clawbackEvents,
      appealQueue,
      highRiskEvents,
      referralRisk,
      creditHolds,
      practitionerRisk,
      heldPayouts,
      riskyReviews,
    },
    statusGroups: statusGroups.map((row) => ({ status: row.status, count: row._count._all })),
    actionGroups: actionGroups.map((row) => ({ action: row.action, count: row._count._all })),
    subjectGroups: subjectGroups.map((row) => ({ subjectType: row.subjectType, count: row._count._all })),
    recentEvents: recentEvents.map((event) => {
      const actor = event.actorUserId ? actorMap.get(event.actorUserId) : null;
      return {
        id: event.id,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        actorUserId: event.actorUserId,
        actorName: actor?.name ?? actor?.email ?? "Система",
        actorRole: actor?.role ?? null,
        riskScore: event.riskScore,
        riskFlags: event.riskFlags,
        action: event.action,
        status: event.status,
        evidence: fraudMetadataObject(event.metadata),
        createdAt: event.createdAt.toISOString(),
      };
    }),
  };
}

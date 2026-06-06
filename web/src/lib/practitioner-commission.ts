import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export const COMMISSION_BY_PLAN = {
  practitioner_pro: 30,
  practitioner_pro_plus: 25,
} as const;

export type PractitionerCommissionPlanKey = keyof typeof COMMISSION_BY_PLAN;
export type PractitionerCommissionSource = "base" | "subscription_pro" | "subscription_pro_plus" | "override";

type CommissionTx = Pick<Prisma.TransactionClient, "practitioner" | "userSubscription">;

type ResolveEffectiveCommissionInput = {
  baseCommissionPercent?: number | null;
  commissionOverride?: number | null;
  activePlanKey?: string | null;
};

export type ResolvedPractitionerCommission = {
  percent: number;
  source: PractitionerCommissionSource;
  activePlanKey: PractitionerCommissionPlanKey | null;
};

function normalizePercent(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(Number(value));
  return Math.min(100, Math.max(0, rounded));
}

function isCommissionPlanKey(planKey: string | null | undefined): planKey is PractitionerCommissionPlanKey {
  return Boolean(planKey && Object.prototype.hasOwnProperty.call(COMMISSION_BY_PLAN, planKey));
}

function sourceForPlan(planKey: PractitionerCommissionPlanKey): PractitionerCommissionSource {
  return planKey === "practitioner_pro_plus" ? "subscription_pro_plus" : "subscription_pro";
}

export function resolveEffectiveCommission(input: ResolveEffectiveCommissionInput): ResolvedPractitionerCommission {
  const base = normalizePercent(input.baseCommissionPercent, 35);
  const activePlanKey = isCommissionPlanKey(input.activePlanKey) ? input.activePlanKey : null;

  if (input.commissionOverride !== null && input.commissionOverride !== undefined) {
    return {
      percent: normalizePercent(input.commissionOverride, base),
      source: "override",
      activePlanKey,
    };
  }

  if (activePlanKey) {
    const planPercent = COMMISSION_BY_PLAN[activePlanKey];
    if (planPercent < base) {
      return { percent: planPercent, source: sourceForPlan(activePlanKey), activePlanKey };
    }
  }

  return { percent: base, source: "base", activePlanKey };
}

function chooseBestActivePlan(planKeys: string[]): PractitionerCommissionPlanKey | null {
  if (planKeys.includes("practitioner_pro_plus")) return "practitioner_pro_plus";
  if (planKeys.includes("practitioner_pro")) return "practitioner_pro";
  return null;
}

async function activeCommissionPlanForUser(tx: CommissionTx, userId: string, now: Date) {
  const subscriptions = await tx.userSubscription.findMany({
    where: {
      userId,
      planKey: { in: Object.keys(COMMISSION_BY_PLAN) },
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { planKey: true },
  });

  return chooseBestActivePlan(subscriptions.map((subscription) => subscription.planKey));
}

async function syncPractitioner(practitioner: {
  id: string;
  userId: string;
  baseCommissionPercent: number | null;
  commissionOverride: number | null;
}, tx: CommissionTx, now: Date) {
  const activePlanKey = await activeCommissionPlanForUser(tx, practitioner.userId, now);
  const resolved = resolveEffectiveCommission({
    baseCommissionPercent: practitioner.baseCommissionPercent,
    commissionOverride: practitioner.commissionOverride,
    activePlanKey,
  });

  await tx.practitioner.update({
    where: { id: practitioner.id },
    data: {
      commissionPercent: resolved.percent,
      commissionSource: resolved.source,
      commissionSyncedAt: now,
    },
  });

  return resolved;
}

export async function syncPractitionerCommission(
  practitionerId: string,
  tx: CommissionTx = db,
  now = new Date(),
) {
  const practitioner = await tx.practitioner.findUnique({
    where: { id: practitionerId },
    select: {
      id: true,
      userId: true,
      baseCommissionPercent: true,
      commissionOverride: true,
    },
  });
  if (!practitioner) return null;

  return syncPractitioner(practitioner, tx, now);
}

export async function syncPractitionerCommissionForUser(
  userId: string,
  tx: CommissionTx = db,
  now = new Date(),
) {
  const practitioner = await tx.practitioner.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      baseCommissionPercent: true,
      commissionOverride: true,
    },
  });
  if (!practitioner) return null;

  return syncPractitioner(practitioner, tx, now);
}

export async function syncPractitionerCommissions(
  tx: CommissionTx = db,
  now = new Date(),
) {
  const practitioners = await tx.practitioner.findMany({
    select: {
      id: true,
      userId: true,
      baseCommissionPercent: true,
      commissionOverride: true,
    },
  });
  if (practitioners.length === 0) return { synced: 0 };

  const subscriptions = await tx.userSubscription.findMany({
    where: {
      userId: { in: practitioners.map((practitioner) => practitioner.userId) },
      planKey: { in: Object.keys(COMMISSION_BY_PLAN) },
      status: { in: ["TRIALING", "ACTIVE"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
    },
    select: { userId: true, planKey: true },
  });
  const plansByUser = new Map<string, string[]>();
  for (const subscription of subscriptions) {
    const planKeys = plansByUser.get(subscription.userId) ?? [];
    planKeys.push(subscription.planKey);
    plansByUser.set(subscription.userId, planKeys);
  }

  for (const practitioner of practitioners) {
    const activePlanKey = chooseBestActivePlan(plansByUser.get(practitioner.userId) ?? []);
    const resolved = resolveEffectiveCommission({
      baseCommissionPercent: practitioner.baseCommissionPercent,
      commissionOverride: practitioner.commissionOverride,
      activePlanKey,
    });

    await tx.practitioner.update({
      where: { id: practitioner.id },
      data: {
        commissionPercent: resolved.percent,
        commissionSource: resolved.source,
        commissionSyncedAt: now,
      },
    });
  }

  return { synced: practitioners.length };
}

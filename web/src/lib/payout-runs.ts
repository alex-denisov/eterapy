import type { JobResult } from "@/lib/job-queue";
import db from "@/lib/db";
import { emitPayoutScheduled } from "@/lib/payout-notifications";
import { assertPractitionerPayoutAllowed } from "@/lib/practitioner-antifraud";

export const PAYOUT_HOLD_DAYS_BY_PLAN = {
  base: 14,
  practitioner_pro: 5,
  practitioner_pro_plus: 2,
} as const;

export type PractitionerPayoutPlanKey = keyof typeof PAYOUT_HOLD_DAYS_BY_PLAN;

export interface PayoutRunCandidate {
  id: string;
  practitionerId: string;
  amountKopecks: number;
  reserveKopecks: number;
  payoutDetails: { type: string | null; kycStatus: string | null } | null;
  gate: { allowed: boolean; reasons: string[] };
}

export interface PayoutRunInput {
  payoutRunId: string;
  scheduledFor: Date;
  now?: Date;
  initiatedBy?: string | null;
}

const RESERVE_RATE_BY_PLAN: Record<PractitionerPayoutPlanKey, number> = {
  base: 0,
  practitioner_pro: 0.05,
  practitioner_pro_plus: 0.05,
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isPaidPlanKey(value: string | null | undefined): value is Exclude<PractitionerPayoutPlanKey, "base"> {
  return value === "practitioner_pro" || value === "practitioner_pro_plus";
}

export function payoutAvailableAt(planKey: PractitionerPayoutPlanKey, now = new Date()) {
  return addDays(now, PAYOUT_HOLD_DAYS_BY_PLAN[planKey]);
}

export function payoutReserveKopecks(planKey: PractitionerPayoutPlanKey, amountKopecks: number) {
  const rate = RESERVE_RATE_BY_PLAN[planKey];
  return Math.max(0, Math.round(amountKopecks * rate));
}

export function payoutRunIdempotencyKey(scheduledFor: Date) {
  return `payout-run:${scheduledFor.toISOString().slice(0, 10)}`;
}

export async function resolvePractitionerPayoutPlanKey(
  userId: string,
  tx: Pick<typeof db, "userSubscription"> = db,
  now = new Date(),
): Promise<PractitionerPayoutPlanKey> {
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

function entityKycMissing(details: PayoutRunCandidate["payoutDetails"]) {
  return details?.type === "ENTITY" && details.kycStatus !== "VERIFIED";
}

function payoutDetailsMissing(details: PayoutRunCandidate["payoutDetails"]) {
  return !details?.type;
}

export function classifyPayoutRunCandidates(candidates: PayoutRunCandidate[]) {
  const processing: Array<PayoutRunCandidate & { disbursedKopecks: number }> = [];
  const held: Array<{ id: string; holdReason: string; riskFlags: string[] }> = [];

  for (const candidate of candidates) {
    if (!candidate.gate.allowed) {
      held.push({
        id: candidate.id,
        holdReason: "risk_review",
        riskFlags: candidate.gate.reasons.length > 0 ? candidate.gate.reasons : ["payout_gate_blocked"],
      });
      continue;
    }

    if (payoutDetailsMissing(candidate.payoutDetails)) {
      held.push({
        id: candidate.id,
        holdReason: "payout_details_required",
        riskFlags: ["payout_details_required"],
      });
      continue;
    }

    if (entityKycMissing(candidate.payoutDetails)) {
      held.push({
        id: candidate.id,
        holdReason: "kyc_required",
        riskFlags: ["entity_kyc_required"],
      });
      continue;
    }

    processing.push({
      ...candidate,
      disbursedKopecks: Math.max(0, candidate.amountKopecks - candidate.reserveKopecks),
    });
  }

  return {
    processing,
    held,
    summary: {
      candidateCount: candidates.length,
      processingCount: processing.length,
      heldCount: held.length,
      totalAmountKopecks: candidates.reduce((sum, candidate) => sum + candidate.amountKopecks, 0),
      totalDisbursedKopecks: processing.reduce((sum, candidate) => sum + candidate.disbursedKopecks, 0),
      totalReserveKopecks: candidates.reduce((sum, candidate) => sum + candidate.reserveKopecks, 0),
    },
  };
}

export async function runPayoutRun(input: PayoutRunInput): Promise<JobResult> {
  const now = input.now ?? new Date();
  const payoutRun = await db.payoutRun.upsert({
    where: { scheduledFor: input.scheduledFor },
    create: {
      id: input.payoutRunId,
      scheduledFor: input.scheduledFor,
      status: "PENDING",
      initiatedBy: input.initiatedBy ?? null,
    },
    update: {
      initiatedBy: input.initiatedBy ?? undefined,
    },
  });
  if (payoutRun.status === "COMPLETED") {
    return {
      ok: true,
      payoutRunId: payoutRun.id,
      scheduledFor: payoutRun.scheduledFor.toISOString(),
      alreadyCompleted: true,
      candidateCount: payoutRun.candidateCount,
      processingCount: payoutRun.processingCount,
      heldCount: payoutRun.heldCount,
      totalAmountKopecks: payoutRun.totalAmountKopecks,
      totalDisbursedKopecks: payoutRun.totalDisbursedKopecks,
      totalReserveKopecks: payoutRun.totalReserveKopecks,
    };
  }

  await db.payoutRun.update({
    where: { id: payoutRun.id },
    data: {
      status: "RUNNING",
      initiatedBy: input.initiatedBy ?? undefined,
      startedAt: now,
    },
  });

  const duePayouts = await db.payout.findMany({
    where: {
      status: "PENDING",
      payoutRunId: null,
      OR: [{ availableAt: null }, { availableAt: { lte: now } }],
    },
    select: {
      id: true,
      practitionerId: true,
      amountKopecks: true,
      reserveKopecks: true,
      practitioner: {
        select: {
          payoutDetails: { select: { type: true, kycStatus: true } },
        },
      },
    },
  });

  const gateChecksByPractitioner = new Map<string, ReturnType<typeof assertPractitionerPayoutAllowed>>();
  const gates = await Promise.all(duePayouts.map((payout) => {
    let gate = gateChecksByPractitioner.get(payout.practitionerId);
    if (!gate) {
      gate = assertPractitionerPayoutAllowed(payout.practitionerId);
      gateChecksByPractitioner.set(payout.practitionerId, gate);
    }
    return gate;
  }));

  const classified = classifyPayoutRunCandidates(duePayouts.map((payout, index) => ({
    id: payout.id,
    practitionerId: payout.practitionerId,
    amountKopecks: payout.amountKopecks,
    reserveKopecks: payout.reserveKopecks,
    payoutDetails: payout.practitioner.payoutDetails,
    gate: gates[index] ?? { allowed: false, reasons: ["payout_gate_unavailable"] },
  })));

  await db.$transaction(async (tx) => {
    for (const payout of classified.processing) {
      await tx.payout.updateMany({
        where: { id: payout.id, status: "PENDING", payoutRunId: null },
        data: {
          status: "PROCESSING",
          payoutRunId: payoutRun.id,
          processedAt: now,
        },
      });
    }

    for (const payout of classified.held) {
      await tx.payout.updateMany({
        where: { id: payout.id, status: "PENDING", payoutRunId: null },
        data: {
          status: "HELD",
          payoutRunId: payoutRun.id,
          holdReason: payout.holdReason,
          riskFlags: payout.riskFlags,
        },
      });
    }

    await tx.payoutRun.update({
      where: { id: payoutRun.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        candidateCount: classified.summary.candidateCount,
        processingCount: classified.summary.processingCount,
        heldCount: classified.summary.heldCount,
        totalAmountKopecks: classified.summary.totalAmountKopecks,
        totalDisbursedKopecks: classified.summary.totalDisbursedKopecks,
        totalReserveKopecks: classified.summary.totalReserveKopecks,
        metadata: {
          scheduledFor: input.scheduledFor.toISOString(),
          completedAt: now.toISOString(),
          note: "PROCESSING means ready for manual/provider payout execution",
        },
      },
    });
  });

  await emitPayoutScheduled({
    date: input.scheduledFor,
    totalRub: Math.round(classified.summary.totalDisbursedKopecks / 100),
    practitionerCount: new Set(classified.processing.map((payout) => payout.practitionerId)).size,
  });

  return {
    ok: true,
    payoutRunId: payoutRun.id,
    scheduledFor: input.scheduledFor.toISOString(),
    ...classified.summary,
  };
}

export function normalizePayoutPlanKey(value: string | null | undefined): PractitionerPayoutPlanKey {
  return isPaidPlanKey(value) ? value : "base";
}

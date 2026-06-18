/**
 * Session-end completion + conditional payout creation.
 *
 * Called from every path that transitions a booking to COMPLETED
 * (`/api/bookings PATCH`, `/api/bookings/[id] PATCH`, and
 * `/api/video/session PATCH status=ENDED`).
 *
 * Rules from backlog 11.C.2:
 *   - Practitioner payout is created at session end, but held until the
 *     24h client dispute window expires, conditional on:
 *       · no unresolved complaints on this booking
 *         (complaint status OPEN or REVIEWING at completion time),
 *       · the practitioner did not end the session early
 *         (≥ 75% of the scheduled slot duration must have elapsed
 *         since the session actually started).
 *   - If the conditions fail because of an unresolved complaint, the payout is
 *     held with `open_complaint`; otherwise it is held with `dispute_window`
 *     and released by `cron.session-escrow-capture`.
 *   - If the conditions fail because the practitioner tried to end
 *     the session too early, the COMPLETED transition itself is
 *     blocked. No state changes.
 *
 * Also fixes two adjacent unit bugs the old call sites had:
 *   - Payout.amountKopecks is stored as kopecks, not rubles.
 *   - booking.endedAt is now set at completion time.
 */
import db from "./db";
import { payoutHoldMetadata } from "./practitioner-antifraud";
import {
  PAYOUT_HOLD_DAYS_BY_PLAN,
  payoutAvailableAt,
  payoutReserveKopecks,
  resolvePractitionerPayoutPlanKey,
} from "./payout-runs";

export const PAYOUT_STATUS_PENDING = "PENDING";
export const PAYOUT_STATUS_HELD = "HELD";
export const PAYOUT_STATUS_DONE = "DONE";
export const PAYOUT_STATUS_PROCESSING = "PROCESSING";
export const PAYOUT_STATUS_FAILED = "FAILED";

/** Minimum fraction of the scheduled slot that must pass before a
 *  practitioner-initiated completion counts as "not early". */
export const EARLY_END_MIN_FRACTION = 0.75;
export const SESSION_DISPUTE_WINDOW_HOURS = 24;

export type CompletionOutcome =
  | {
      status: "completed";
      payout: {
        id: string;
        amountKopecks: number;
        status: typeof PAYOUT_STATUS_HELD;
        holdReason: "open_complaint" | "risk_review" | "dispute_window";
      };
    }
  | { status: "already_completed" }
  | { status: "invalid_status"; currentStatus: string }
  | { status: "not_found" }
  | { status: "early_end_blocked"; elapsedMs: number; requiredMs: number };

export interface CompletionActor {
  /** The user id of whoever is triggering the completion, for payout audit trail. */
  userId: string;
  /** True when the actor is the practitioner assigned to this booking —
   *  the early-end (75%) rule only applies in that case. */
  isPractitioner: boolean;
}

export async function completeBookingAtSessionEnd(
  bookingId: string,
  actor: CompletionActor,
): Promise<CompletionOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      priceRub: true,
      commissionPercentApplied: true,
      riskScore: true,
      riskFlags: true,
      startedAt: true,
      practitioner: {
        select: { id: true, userId: true, commissionPercent: true },
      },
      slot: { select: { startAt: true, endAt: true } },
      complaints: {
        select: { id: true, status: true },
      },
    },
  });
  if (!booking) return { status: "not_found" };
  if (booking.status === "COMPLETED") return { status: "already_completed" };
  if (booking.status !== "IN_PROGRESS") {
    return { status: "invalid_status", currentStatus: booking.status };
  }

  // Early-end guard — only enforced when the practitioner is the actor.
  if (actor.isPractitioner) {
    const scheduledMs = booking.slot
      ? new Date(booking.slot.endAt).getTime() - new Date(booking.slot.startAt).getTime()
      : 60 * 60 * 1000;
    const effectiveStart = booking.startedAt ?? booking.slot?.startAt ?? new Date();
    const elapsedMs = Date.now() - new Date(effectiveStart).getTime();
    const requiredMs = Math.floor(scheduledMs * EARLY_END_MIN_FRACTION);
    if (elapsedMs < requiredMs) {
      return { status: "early_end_blocked", elapsedMs, requiredMs };
    }
  }

  const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
  const grossKopecks = booking.priceRub * 100;
  const amountKopecks = Math.round(grossKopecks * (1 - commissionPercent / 100));
  const completionNow = new Date(Date.now());
  const planKeyAtPayout = await resolvePractitionerPayoutPlanKey(booking.practitioner.userId, db, completionNow);
  const holdDays = PAYOUT_HOLD_DAYS_BY_PLAN[planKeyAtPayout];
  const reserveKopecks = payoutReserveKopecks(planKeyAtPayout, amountKopecks);

  const hasUnresolvedComplaint = booking.complaints.some(
    (c) => c.status === "OPEN" || c.status === "REVIEWING",
  );
  const payoutHold = payoutHoldMetadata({
    riskScore: booking.riskScore,
    riskFlags: booking.riskFlags,
    hasUnresolvedComplaint,
  });
  const payoutStatus = PAYOUT_STATUS_HELD;
  const holdReason = hasUnresolvedComplaint
    ? "open_complaint"
    : payoutHold.status === PAYOUT_STATUS_HELD
      ? payoutHold.holdReason
      : "dispute_window";
  const disputeWindowEndsAt = new Date(completionNow.getTime() + SESSION_DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);

  const payoutRow = await db.$transaction(async (tx) => {
    const flip = await tx.booking.updateMany({
      where: { id: bookingId, status: "IN_PROGRESS" },
      data: { status: "COMPLETED", endedAt: completionNow, commissionPercentApplied: commissionPercent },
    });
    if (flip.count === 0) {
      return null;
    }

    await tx.practitioner.update({
      where: { id: booking.practitioner.id },
      data: { sessionCount: { increment: 1 } },
    });

    return tx.payout.create({
      data: {
        practitionerId: booking.practitioner.id,
        bookingId,
        amountKopecks,
        status: payoutStatus,
        initiatedBy: actor.userId,
        availableAt: holdReason === "dispute_window" ? disputeWindowEndsAt : payoutAvailableAt(planKeyAtPayout, completionNow),
        holdReason,
        holdDays,
        planKeyAtPayout,
        reserveKopecks,
        riskScore: booking.riskScore,
        riskFlags: booking.riskFlags,
      },
      select: { id: true, amountKopecks: true, status: true },
    });
  });

  if (!payoutRow) {
    return { status: "already_completed" };
  }

  return {
    status: "completed",
    payout: {
      id: payoutRow.id,
      amountKopecks: payoutRow.amountKopecks,
      status: payoutStatus,
      holdReason: holdReason as "open_complaint" | "risk_review" | "dispute_window",
    },
  };
}

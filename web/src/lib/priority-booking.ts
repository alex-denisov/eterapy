import type { BookingStatus, Prisma, WaitlistStatus } from "@prisma/client";
import db from "@/lib/db";

export const PREMIUM_BOOKING_PRIORITY = 100;

export type PlanLike = string | { key?: string | null } | null | undefined;

export type PrioritySlotGate = {
  visibleFrom?: Date | string | null;
  earlyAccessFrom?: Date | string | null;
};

export type WaitlistCandidate = {
  id: string;
  status: WaitlistStatus | string;
  priority: number;
  createdAt: Date | string;
};

function planKey(plan: PlanLike): string | null {
  if (!plan) return null;
  if (typeof plan === "string") return plan;
  return plan.key ?? null;
}

function dateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function isAtOrAfter(now: Date, value: Date | string | null | undefined): boolean {
  const date = dateValue(value);
  return Boolean(date && now.getTime() >= date.getTime());
}

export function isPremiumPlan(plan: PlanLike): boolean {
  return planKey(plan) === "premium";
}

export function bookingPriorityForPlan(plan: PlanLike): number {
  return isPremiumPlan(plan) ? PREMIUM_BOOKING_PRIORITY : 0;
}

export function canAccessPrioritySlot(slot: PrioritySlotGate, plan: PlanLike, now = new Date()): boolean {
  if (!slot.visibleFrom) return true;
  if (isAtOrAfter(now, slot.visibleFrom)) return true;
  return isPremiumPlan(plan) && isAtOrAfter(now, slot.earlyAccessFrom);
}

export function isEarlyAccessSlot(slot: PrioritySlotGate, plan: PlanLike, now = new Date()): boolean {
  return isPremiumPlan(plan)
    && !isAtOrAfter(now, slot.visibleFrom)
    && isAtOrAfter(now, slot.earlyAccessFrom);
}

export function selectWaitlistPromotionCandidate<T extends WaitlistCandidate>(entries: T[], now = new Date()): T | null {
  const active = entries
    .filter((entry) => entry.status === "ACTIVE")
    .filter((entry) => new Date(entry.createdAt).getTime() <= now.getTime());
  active.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return active[0] ?? null;
}

export type PriorityBookingTx = Pick<
  Prisma.TransactionClient,
  "booking" | "bookingWaitlistEntry" | "timeSlot" | "practitioner"
>;

export type WaitlistPromotionResult =
  | { status: "slot_not_found" }
  | { status: "no_candidate" }
  | { status: "promoted"; booking: { id: string }; waitlistEntryId: string };

export async function promoteWaitlistForReleasedSlot(
  input: {
    slotId: string;
    actorUserId?: string | null;
    status?: BookingStatus;
    tx?: PriorityBookingTx;
  },
): Promise<WaitlistPromotionResult> {
  if (!input.tx) {
    return db.$transaction((tx) => promoteWaitlistForReleasedSlotInTx(tx, input));
  }
  return promoteWaitlistForReleasedSlotInTx(input.tx, input);
}

async function promoteWaitlistForReleasedSlotInTx(
  tx: PriorityBookingTx,
  input: {
    slotId: string;
    status?: BookingStatus;
  },
): Promise<WaitlistPromotionResult> {
  const slot = await tx.timeSlot.findUnique({
    where: { id: input.slotId },
    include: { practitioner: true },
  });
  if (!slot) return { status: "slot_not_found" as const };

  const entries = await tx.bookingWaitlistEntry.findMany({
    where: {
      status: "ACTIVE",
      practitionerId: slot.practitionerId,
      OR: [
        { slotId: slot.id },
        { slotId: null, startAt: slot.startAt, endAt: slot.endAt },
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 10,
  });

  const candidate = selectWaitlistPromotionCandidate(entries);
  if (!candidate) return { status: "no_candidate" as const };

  const promotedSlot = await tx.timeSlot.create({
    data: {
      practitionerId: slot.practitionerId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      available: false,
      visibleFrom: slot.visibleFrom,
      earlyAccessFrom: slot.earlyAccessFrom,
    },
  });

  const booking = await tx.booking.create({
    data: {
      clientId: candidate.clientId,
      practitionerId: slot.practitionerId,
      slotId: promotedSlot.id,
      status: input.status ?? "PENDING",
      priceRub: slot.practitioner.pricePerSession,
      priority: candidate.priority,
    },
  });

  await tx.timeSlot.update({
    where: { id: slot.id },
    data: { available: false },
  });

  await tx.bookingWaitlistEntry.update({
    where: { id: candidate.id },
    data: {
      status: "PROMOTED",
      promotedBookingId: booking.id,
      promotedAt: new Date(),
    },
  });

  return { status: "promoted" as const, booking, waitlistEntryId: candidate.id };
}

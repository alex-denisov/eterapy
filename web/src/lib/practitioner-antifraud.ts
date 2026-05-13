import type { Prisma } from "@prisma/client";
import type { requestFingerprint } from "@/lib/antifraud";
import { logFraudEvent } from "@/lib/antifraud";
import db from "@/lib/db";

export const PRACTITIONER_PAYOUT_HOLD_DAYS = 7;
export const PRACTITIONER_HIGH_RISK_SCORE = 70;

const EXTERNAL_PAYMENT_PATTERNS = [
  /(?:оплат|перевед|скинь|кинь|перешл)[\s\S]{0,40}(?:карт|сбер|тинькофф|сбп|телефон|telegram|телеграм|whatsapp|ватсап)/i,
  /(?:вне|мимо|без)\s+(?:платформ|сервиса|eterapy)/i,
  /(?:номер\s+карты|реквизит|сбп|сбербанк|тинькофф|tinkoff|kaspi)/i,
  /(?:t\.me|telegram\.me|wa\.me|whatsapp\.com|@[\w_]{4,})/i,
];

const GUARANTEE_PATTERNS = [
  /(?:гарантирую|100%\s*результат|точно\s+помогу|вылечу|диагноз|назначу)/i,
  /(?:только\s+сегодня|срочно\s+оплат|иначе\s+будет\s+хуже)/i,
];

type Fingerprint = ReturnType<typeof requestFingerprint>;

function clamp(score: number) {
  return Math.min(100, Math.max(0, score));
}

export function payoutAvailableAt(now = new Date()) {
  return new Date(now.getTime() + PRACTITIONER_PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

export function detectPractitionerTextRisk(text: string | null | undefined) {
  const flags = new Set<string>();
  let score = 0;
  const value = text?.trim() ?? "";

  if (!value) return { riskScore: 0, riskFlags: [] as string[] };

  if (EXTERNAL_PAYMENT_PATTERNS.some((pattern) => pattern.test(value))) {
    flags.add("external_payment_signal");
    score += 80;
  }
  if (GUARANTEE_PATTERNS.some((pattern) => pattern.test(value))) {
    flags.add("compliance_promise_or_pressure");
    score += 60;
  }
  if (value.length < 20) {
    flags.add("very_short_review_text");
    score += 15;
  }

  return { riskScore: clamp(score), riskFlags: [...flags] };
}

export async function assessBookingRisk(input: {
  tx: Prisma.TransactionClient;
  clientId: string;
  practitionerId: string;
  fingerprint: Fingerprint;
}) {
  const flags = new Set<string>();
  let score = 0;
  const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [practitioner, clientBookingsDay, clientBookingsMonth, sameIpDay, sameDeviceDay, disputedOrRefundedMonth] = await Promise.all([
    input.tx.practitioner.findUnique({
      where: { id: input.practitionerId },
      select: { userId: true, verified: true, riskScore: true },
    }),
    input.tx.booking.count({
      where: { clientId: input.clientId, practitionerId: input.practitionerId, createdAt: { gte: sinceDay } },
    }),
    input.tx.booking.count({
      where: { clientId: input.clientId, practitionerId: input.practitionerId, createdAt: { gte: sinceMonth } },
    }),
    input.tx.booking.count({
      where: { practitionerId: input.practitionerId, ipHash: input.fingerprint.ipHash, createdAt: { gte: sinceDay } },
    }),
    input.fingerprint.deviceHash
      ? input.tx.booking.count({
          where: { practitionerId: input.practitionerId, deviceHash: input.fingerprint.deviceHash, createdAt: { gte: sinceDay } },
        })
      : Promise.resolve(0),
    input.tx.booking.count({
      where: {
        practitionerId: input.practitionerId,
        createdAt: { gte: sinceMonth },
        status: { in: ["DISPUTED", "REFUNDED", "CANCELLED"] },
      },
    }),
  ]);

  if (!practitioner?.verified) {
    flags.add("practitioner_not_verified");
    score += 100;
  }
  if (practitioner?.userId === input.clientId) {
    flags.add("practitioner_self_booking");
    score += 100;
  }
  if (clientBookingsDay >= 2 || clientBookingsMonth >= 5) {
    flags.add("many_bookings_same_client");
    score += clientBookingsDay >= 2 ? 40 : 25;
  }
  if (sameIpDay >= 4) {
    flags.add("many_bookings_same_ip_day");
    score += 35;
  }
  if (sameDeviceDay >= 3) {
    flags.add("many_bookings_same_device_day");
    score += 50;
  }
  if ((practitioner?.riskScore ?? 0) >= PRACTITIONER_HIGH_RISK_SCORE) {
    flags.add("practitioner_high_risk");
    score += 70;
  }
  if (disputedOrRefundedMonth >= 3) {
    flags.add("high_dispute_refund_velocity");
    score += 55;
  }

  return {
    riskScore: clamp(score),
    riskFlags: [...flags],
    shouldBlock: flags.has("practitioner_not_verified") || flags.has("practitioner_self_booking"),
    shouldReview: score >= PRACTITIONER_HIGH_RISK_SCORE,
  };
}

export async function assessReviewRisk(input: {
  tx: Prisma.TransactionClient;
  bookingId: string;
  authorId: string;
  practitionerId: string;
  text?: string | null;
}) {
  const flags = new Set<string>();
  let score = 0;
  const textRisk = detectPractitionerTextRisk(input.text);
  for (const flag of textRisk.riskFlags) flags.add(flag);
  score += textRisk.riskScore;

  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [authorReviews, practitionerReviews] = await Promise.all([
    input.tx.review.count({
      where: { authorId: input.authorId, practitionerId: input.practitionerId, createdAt: { gte: sinceMonth } },
    }),
    input.tx.review.count({
      where: { practitionerId: input.practitionerId, createdAt: { gte: sinceMonth } },
    }),
  ]);

  if (authorReviews >= 2) {
    flags.add("many_reviews_same_author_practitioner");
    score += 35;
  }
  if (practitionerReviews >= 25) {
    flags.add("review_velocity_spike");
    score += 25;
  }

  return {
    riskScore: clamp(score),
    riskFlags: [...flags],
    status: score >= PRACTITIONER_HIGH_RISK_SCORE ? "REVIEW" : "PUBLISHED",
  };
}

export function payoutHoldMetadata(input: { riskScore: number; riskFlags: string[]; hasUnresolvedComplaint?: boolean }) {
  if (input.hasUnresolvedComplaint) {
    return { status: "HELD", holdReason: "open_complaint" };
  }
  if (input.riskScore >= PRACTITIONER_HIGH_RISK_SCORE) {
    return { status: "HELD", holdReason: "risk_review" };
  }
  return { status: "PENDING", holdReason: "payout_delay" };
}

export async function holdPractitionerPayoutsForBooking(input: {
  bookingId: string;
  actorUserId?: string | null;
  reason: string;
  riskScore?: number;
  riskFlags?: string[];
}) {
  const riskScore = input.riskScore ?? 80;
  const riskFlags = input.riskFlags ?? [input.reason];

  await db.$transaction(async (tx) => {
    const updated = await tx.payout.updateMany({
      where: { bookingId: input.bookingId, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "HELD",
        holdReason: input.reason,
        riskScore,
        riskFlags,
      },
    });

    await logFraudEvent(tx, {
      subjectType: "booking",
      subjectId: input.bookingId,
      actorUserId: input.actorUserId ?? null,
      action: "practitioner_payout_held",
      status: updated.count > 0 ? "review" : "logged",
      riskScore,
      riskFlags,
      metadata: { reason: input.reason, heldPayouts: updated.count },
    });
  });
}

export async function assertPractitionerPayoutAllowed(practitionerId: string) {
  const [practitioner, openComplaints, highRiskEvents] = await Promise.all([
    db.practitioner.findUnique({
      where: { id: practitionerId },
      select: { verified: true, riskScore: true, riskFlags: true },
    }),
    db.complaint.count({
      where: {
        status: { in: ["OPEN", "REVIEWING"] },
        booking: { practitionerId },
      },
    }),
    db.fraudEvent.count({
      where: {
        subjectType: { in: ["practitioner", "booking", "review", "payout"] },
        status: "review",
        riskScore: { gte: PRACTITIONER_HIGH_RISK_SCORE },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        OR: [
          { subjectId: practitionerId },
          { metadata: { path: ["practitionerId"], equals: practitionerId } },
        ],
      },
    }),
  ]);

  const reasons: string[] = [];
  if (!practitioner?.verified) reasons.push("practitioner_not_verified");
  if ((practitioner?.riskScore ?? 0) >= PRACTITIONER_HIGH_RISK_SCORE) reasons.push("practitioner_high_risk");
  if (openComplaints > 0) reasons.push("open_complaints");
  if (highRiskEvents > 0) reasons.push("open_high_risk_events");

  return { allowed: reasons.length === 0, reasons };
}

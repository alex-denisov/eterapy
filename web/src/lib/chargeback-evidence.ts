import db from "@/lib/db";
import { logFraudEvent } from "@/lib/antifraud";

export async function buildChargebackEvidencePackage(input: { bookingId?: string; productResultId?: string; paymentId?: string }) {
  if (input.bookingId) return bookingEvidence(input.bookingId);
  if (input.productResultId) return productResultEvidence(input.productResultId);
  if (input.paymentId) {
    const payment = await db.payment.findUnique({ where: { id: input.paymentId }, select: { bookingId: true } });
    if (payment?.bookingId) return bookingEvidence(payment.bookingId);
  }
  throw new Error("chargeback_evidence_target_required");
}
async function bookingEvidence(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { id: true, email: true, createdAt: true } },
      practitioner: {
        select: {
          id: true,
          userId: true,
          commissionPercent: true,
          agentOfferVersion: true,
          agentOfferAcceptedAt: true,
          taxStatus: true,
          taxReviewStatus: true,
          taxStatusVerifiedAt: true,
          payoutDetails: { select: { type: true, inn: true, kycStatus: true, kycVerifiedAt: true } },
        },
      },
      slot: true,
      payment: true,
      complaints: true,
      payouts: true,
      videoSession: { select: { status: true, startedAt: true, endedAt: true, complianceStatus: true } },
    },
  });
  if (!booking) throw new Error("booking_not_found");

  const [transactions, report] = await Promise.all([
    db.transaction.findMany({
      where: {
        OR: [
          { providerPaymentId: booking.payment?.externalId ?? "__none__" },
          { metadata: { path: ["bookingId"], equals: booking.id } },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
    db.agentReport.findFirst({
      where: {
        practitionerId: booking.practitionerId,
        periodStart: { lte: booking.endedAt ?? booking.updatedAt },
        periodEnd: { gt: booking.endedAt ?? booking.updatedAt },
      },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    target: { type: "booking", id: booking.id },
    order: {
      bookingId: booking.id,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      slot: booking.slot ? { startAt: booking.slot.startAt.toISOString(), endAt: booking.slot.endAt.toISOString() } : null,
      priceRub: booking.priceRub,
      commissionPercentApplied: booking.commissionPercentApplied,
    },
    client: booking.client,
    agentOffer: {
      practitionerId: booking.practitioner.id,
      version: booking.practitioner.agentOfferVersion,
      acceptedAt: booking.practitioner.agentOfferAcceptedAt?.toISOString() ?? null,
      commissionPercent: booking.practitioner.commissionPercent,
      taxStatus: booking.practitioner.taxStatus,
      taxReviewStatus: booking.practitioner.taxReviewStatus,
      taxStatusVerifiedAt: booking.practitioner.taxStatusVerifiedAt?.toISOString() ?? null,
      payoutDetails: booking.practitioner.payoutDetails,
    },
    payment: booking.payment,
    transactions,
    serviceDelivery: {
      roomId: booking.roomId,
      startedAt: booking.startedAt?.toISOString() ?? null,
      endedAt: booking.endedAt?.toISOString() ?? null,
      videoSession: booking.videoSession,
    },
    disputes: booking.complaints,
    payouts: booking.payouts,
    agentReport: report,
    routingLog: null,
  };
}

async function productResultEvidence(productResultId: string) {
  const result = await db.productResult.findUnique({
    where: { id: productResultId },
    include: { dialogue: true, user: { select: { id: true, email: true, createdAt: true } } },
  });
  if (!result) throw new Error("product_result_not_found");

  const routingLog = result.dialogueId
    ? await db.aIRequest.findFirst({
        where: { metadata: { path: ["dialogueId"], equals: result.dialogueId } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    target: { type: "product_result", id: result.id },
    order: {
      productKey: result.productKey,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
      savedAt: result.savedAt?.toISOString() ?? null,
      exportedAt: result.exportedAt?.toISOString() ?? null,
    },
    client: result.user,
    serviceDelivery: {
      dialogueId: result.dialogueId,
      resultReady: result.status === "READY",
      resultTitle: result.title,
    },
    routingLog,
  };
}

export async function recordChargebackClawback(input: {
  bookingId: string;
  amountKopecks: number;
  actorUserId?: string | null;
}) {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: { practitionerId: true },
  });
  if (!booking) throw new Error("booking_not_found");

  return db.$transaction(async (tx) => {
    const held = await tx.payout.updateMany({
      where: {
        practitionerId: booking.practitionerId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        status: "HELD",
        holdReason: "chargeback_clawback",
        riskScore: 90,
        riskFlags: ["chargeback_after_payout", "future_payout_clawback"],
      },
    });

    await tx.practitioner.update({
      where: { id: booking.practitionerId },
      data: {
        riskScore: { increment: 20 },
        riskFlags: { push: "chargeback_after_payout" },
      },
    });

    await logFraudEvent(tx, {
      subjectType: "booking",
      subjectId: input.bookingId,
      actorUserId: input.actorUserId ?? null,
      action: "chargeback_clawback_created",
      status: "review",
      riskScore: 90,
      riskFlags: ["chargeback_after_payout", "future_payout_clawback"],
      metadata: {
        practitionerId: booking.practitionerId,
        amountKopecks: input.amountKopecks,
        heldFuturePayouts: held.count,
      },
    });

    return { practitionerId: booking.practitionerId, heldFuturePayouts: held.count };
  });
}

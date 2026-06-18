import db from "@/lib/db";

export function addBusinessDays(date: Date, days: number) {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}
export async function issueAgentReport(input: {
  practitionerId: string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [bookings, payouts, complaints] = await Promise.all([
    db.booking.findMany({
      where: {
        practitionerId: input.practitionerId,
        status: { in: ["COMPLETED", "REFUNDED", "DISPUTED"] },
        endedAt: { gte: input.periodStart, lt: input.periodEnd },
      },
      select: {
        id: true,
        priceRub: true,
        status: true,
        commissionPercentApplied: true,
        practitioner: { select: { commissionPercent: true } },
      },
    }),
    db.payout.findMany({
      where: {
        practitionerId: input.practitionerId,
        createdAt: { gte: input.periodStart, lt: input.periodEnd },
      },
      select: { amountKopecks: true, status: true, holdReason: true },
    }),
    db.complaint.count({
      where: {
        createdAt: { gte: input.periodStart, lt: input.periodEnd },
        booking: { practitionerId: input.practitionerId },
      },
    }),
  ]);

  const grossKopecks = bookings.reduce((sum, booking) => sum + booking.priceRub * 100, 0);
  const commissionKopecks = bookings.reduce((sum, booking) => {
    const pct = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
    return sum + Math.round((booking.priceRub * 100 * pct) / 100);
  }, 0);
  const refundKopecks = bookings
    .filter((booking) => booking.status === "REFUNDED")
    .reduce((sum, booking) => sum + booking.priceRub * 100, 0);
  const heldKopecks = payouts
    .filter((payout) => payout.status === "HELD")
    .reduce((sum, payout) => sum + payout.amountKopecks, 0);
  const payoutDueKopecks = payouts
    .filter((payout) => ["PENDING", "PROCESSING", "DONE"].includes(payout.status))
    .reduce((sum, payout) => sum + payout.amountKopecks, 0);
  const payoutStatus = payouts.some((payout) => payout.status === "HELD")
    ? "HELD"
    : payouts.some((payout) => payout.status === "PROCESSING")
      ? "PROCESSING"
      : payouts.some((payout) => payout.status === "DONE")
        ? "DONE"
        : "PENDING";

  return db.agentReport.upsert({
    where: {
      practitionerId_periodStart_periodEnd: {
        practitionerId: input.practitionerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    },
    create: {
      practitionerId: input.practitionerId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sessionCount: bookings.filter((booking) => booking.status === "COMPLETED").length,
      grossKopecks,
      commissionKopecks,
      refundKopecks,
      disputeCount: complaints,
      heldKopecks,
      payoutDueKopecks,
      payoutStatus,
      autoAcceptAt: addBusinessDays(now, 3),
      metadata: { bookingIds: bookings.map((booking) => booking.id) },
    },
    update: {
      sessionCount: bookings.filter((booking) => booking.status === "COMPLETED").length,
      grossKopecks,
      commissionKopecks,
      refundKopecks,
      disputeCount: complaints,
      heldKopecks,
      payoutDueKopecks,
      payoutStatus,
      metadata: { bookingIds: bookings.map((booking) => booking.id) },
    },
  });
}

export async function autoAcceptAgentReports(now = new Date()) {
  return db.agentReport.updateMany({
    where: {
      status: "ISSUED",
      autoAcceptAt: { lte: now },
      objectedAt: null,
    },
    data: {
      status: "ACCEPTED",
      acceptedAt: now,
    },
  });
}

export async function objectAgentReport(input: { reportId: string; reason: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.agentReport.update({
    where: { id: input.reportId },
    data: {
      status: "OBJECTED",
      objectedAt: now,
      objectionReason: input.reason.trim().slice(0, 2000),
    },
  });
}

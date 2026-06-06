/**
 * Practitioner earnings/balance calculation — shared between the practitioner
 * cabinet (`/cabinet/practitioner/earnings`) and the superadmin practitioner
 * management panel (`/admin/practitioners`).
 *
 * Formula (all integer rubles):
 *   accruedNet     = sum(COMPLETED booking.priceRub) − commission
 *   paidOut        = sum(Payout.amountKopecks / 100) where status = DONE
 *   pendingPayout  = sum(Payout.amountKopecks / 100) where status in (PENDING, PROCESSING, HELD)
 *   availablePayout = due PENDING payouts minus chargeback reserve
 *   heldPayout     = not-yet-due PENDING + HELD + reserve
 *   internalCharges = practitioner-only charges paid from accrued earnings
 *   currentBalance = accruedNet − paidOut − pendingPayout − internalCharges
 *
 * HELD payouts (created by `completeBookingAtSessionEnd` when an unresolved
 * complaint exists on the booking — see backlog 11.C.2/3) reserve money
 * against the practitioner balance until the moderator resolves the dispute.
 *
 * `commissionPercent` defaults to 35% when not set (see Practitioner schema).
 */

import db from "@/lib/db";
import { getBillingTransactionMetadata } from "@/lib/entitlements";

export interface PractitionerBalance {
  practitionerId: string;
  userId: string;
  commissionPercent: number;
  accruedNet: number;
  paidOut: number;
  pendingPayout: number;
  availablePayout: number;
  heldPayout: number;
  reservePayout: number;
  internalCharges: number;
  currentBalance: number;
  completedSessionCount: number;
}

/**
 * Compute balance for a batch of practitioners in a single query pass.
 * Returns a Map keyed by practitionerId.
 */
export async function computePractitionerBalances(
  practitionerIds: string[]
): Promise<Map<string, PractitionerBalance>> {
  if (practitionerIds.length === 0) return new Map();

  const [practitioners, bookings, payouts] = await Promise.all([
    db.practitioner.findMany({
      where: { id: { in: practitionerIds } },
      select: { id: true, userId: true, commissionPercent: true },
    }),
    db.booking.findMany({
      where: { practitionerId: { in: practitionerIds }, status: "COMPLETED" },
      select: { practitionerId: true, priceRub: true, commissionPercentApplied: true },
    }),
    db.payout.findMany({
      where: { practitionerId: { in: practitionerIds } },
      select: {
        practitionerId: true,
        amountKopecks: true,
        status: true,
        availableAt: true,
        reserveKopecks: true,
      },
    }),
  ]);
  const userIds = [...new Set(practitioners.map((p) => p.userId))];
  const internalChargeTransactions = userIds.length > 0
    ? await db.transaction.findMany({
        where: { userId: { in: userIds }, status: "SUCCEEDED" },
        select: { userId: true, amount: true, metadata: true },
      })
    : [];

  const result = new Map<string, PractitionerBalance>();
  const bookingsByPractitioner = new Map<string, typeof bookings>();
  const payoutsByPractitioner = new Map<string, typeof payouts>();
  const internalChargesByUser = new Map<string, number>();

  for (const booking of bookings) {
    const list = bookingsByPractitioner.get(booking.practitionerId) ?? [];
    list.push(booking);
    bookingsByPractitioner.set(booking.practitionerId, list);
  }

  for (const payout of payouts) {
    const list = payoutsByPractitioner.get(payout.practitionerId) ?? [];
    list.push(payout);
    payoutsByPractitioner.set(payout.practitionerId, list);
  }

  for (const transaction of internalChargeTransactions) {
    const metadata = getBillingTransactionMetadata(transaction);
    if (
      metadata.purchaseKind === "subscription"
      && typeof metadata.planKey === "string"
      && metadata.planKey.startsWith("practitioner_pro")
      && metadata.checkoutSource === "practitioner_earnings_balance"
    ) {
      internalChargesByUser.set(
        transaction.userId,
        (internalChargesByUser.get(transaction.userId) ?? 0) + Math.abs(transaction.amount),
      );
    }
  }

  for (const p of practitioners) {
    const commissionPercent = p.commissionPercent ?? 35;

    const myBookings = bookingsByPractitioner.get(p.id) ?? [];
    const totalRevenue = myBookings.reduce((s, b) => s + b.priceRub, 0);
    const totalFee = myBookings.reduce((sum, booking) => {
      const applied = booking.commissionPercentApplied ?? commissionPercent;
      return sum + Math.round(booking.priceRub * (applied / 100));
    }, 0);
    const accruedNet = totalRevenue - totalFee;

    const myPayouts = payoutsByPractitioner.get(p.id) ?? [];
    const paidKopecks = myPayouts
      .filter(x => x.status === "DONE")
      .reduce((s, x) => s + x.amountKopecks, 0);
    const pendingKopecks = myPayouts
      .filter(x => x.status === "PENDING" || x.status === "PROCESSING" || x.status === "HELD")
      .reduce((s, x) => s + x.amountKopecks, 0);
    const now = Date.now();
    let availablePayoutKopecks = 0;
    let heldPayoutKopecks = 0;
    let reservePayoutKopecks = 0;
    for (const payout of myPayouts) {
      const reserve = Math.max(0, payout.reserveKopecks ?? 0);
      if (payout.status === "PENDING") {
        const due = !payout.availableAt || new Date(payout.availableAt).getTime() <= now;
        if (due) {
          availablePayoutKopecks += Math.max(0, payout.amountKopecks - reserve);
          heldPayoutKopecks += reserve;
        } else {
          heldPayoutKopecks += payout.amountKopecks;
        }
        reservePayoutKopecks += reserve;
      } else if (payout.status === "HELD") {
        heldPayoutKopecks += payout.amountKopecks;
        reservePayoutKopecks += reserve;
      } else if (payout.status === "PROCESSING") {
        heldPayoutKopecks += payout.amountKopecks;
        reservePayoutKopecks += reserve;
      }
    }

    const paidOut = Math.round(paidKopecks / 100);
    const pendingPayout = Math.round(pendingKopecks / 100);
    const availablePayout = Math.round(availablePayoutKopecks / 100);
    const heldPayout = Math.round(heldPayoutKopecks / 100);
    const reservePayout = Math.round(reservePayoutKopecks / 100);
    const internalCharges = Math.round((internalChargesByUser.get(p.userId) ?? 0) / 100);
    const currentBalance = accruedNet - paidOut - pendingPayout - internalCharges;

    result.set(p.id, {
      practitionerId: p.id,
      userId: p.userId,
      commissionPercent,
      accruedNet,
      paidOut,
      pendingPayout,
      availablePayout,
      heldPayout,
      reservePayout,
      internalCharges,
      currentBalance,
      completedSessionCount: myBookings.length,
    });
  }

  return result;
}

export async function computePractitionerBalance(
  practitionerId: string
): Promise<PractitionerBalance | null> {
  const map = await computePractitionerBalances([practitionerId]);
  return map.get(practitionerId) ?? null;
}

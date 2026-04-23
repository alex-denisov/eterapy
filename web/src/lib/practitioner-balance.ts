/**
 * Practitioner earnings/balance calculation — shared between the practitioner
 * cabinet (`/cabinet/practitioner/earnings`) and the superadmin practitioner
 * management panel (`/admin/practitioners`).
 *
 * Formula (all integer rubles):
 *   accruedNet     = sum(COMPLETED booking.priceRub) − commission
 *   paidOut        = sum(Payout.amountKopecks / 100) where status = DONE
 *   pendingPayout  = sum(Payout.amountKopecks / 100) where status in (PENDING, PROCESSING)
 *   currentBalance = accruedNet − paidOut − pendingPayout
 *
 * `commissionPercent` defaults to 25% when not set (see Practitioner schema).
 */

import db from "@/lib/db";

export interface PractitionerBalance {
  practitionerId: string;
  commissionPercent: number;
  accruedNet: number;
  paidOut: number;
  pendingPayout: number;
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
      select: { id: true, commissionPercent: true },
    }),
    db.booking.findMany({
      where: { practitionerId: { in: practitionerIds }, status: "COMPLETED" },
      select: { practitionerId: true, priceRub: true },
    }),
    db.payout.findMany({
      where: { practitionerId: { in: practitionerIds } },
      select: { practitionerId: true, amountKopecks: true, status: true },
    }),
  ]);

  const result = new Map<string, PractitionerBalance>();

  for (const p of practitioners) {
    const commissionPercent = p.commissionPercent ?? 25;
    const commission = commissionPercent / 100;

    const myBookings = bookings.filter(b => b.practitionerId === p.id);
    const totalRevenue = myBookings.reduce((s, b) => s + b.priceRub, 0);
    const totalFee = Math.round(totalRevenue * commission);
    const accruedNet = totalRevenue - totalFee;

    const myPayouts = payouts.filter(x => x.practitionerId === p.id);
    const paidKopecks = myPayouts
      .filter(x => x.status === "DONE")
      .reduce((s, x) => s + x.amountKopecks, 0);
    const pendingKopecks = myPayouts
      .filter(x => x.status === "PENDING" || x.status === "PROCESSING")
      .reduce((s, x) => s + x.amountKopecks, 0);

    const paidOut = Math.round(paidKopecks / 100);
    const pendingPayout = Math.round(pendingKopecks / 100);
    const currentBalance = accruedNet - paidOut - pendingPayout;

    result.set(p.id, {
      practitionerId: p.id,
      commissionPercent,
      accruedNet,
      paidOut,
      pendingPayout,
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

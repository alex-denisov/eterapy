/**
 * Session-start billing.
 *
 * Called the first time either participant enters the video room for a
 * CONFIRMED booking. Transitions the booking to IN_PROGRESS, debits the
 * client's balance by the session price, writes a Payment row and a
 * negative Transaction row so the charge shows up in /cabinet/billing.
 *
 * Safety properties:
 *   - Race-safe: only one caller flips CONFIRMED → IN_PROGRESS (conditional
 *     updateMany). Concurrent callers see outcome "already_charged".
 *   - Overdraft-safe: balance decrement is a conditional updateMany gated
 *     on `balance >= priceKopecks`, so two concurrent charges against the
 *     same balance cannot go negative.
 *   - Unit-safe: `Booking.priceRub` is in rubles, `User.balance` and
 *     `Payment.amountKopecks` are in kopecks — this module is the single
 *     place that does the `* 100` conversion for session charges.
 *   - Idempotent: calling again after a successful charge returns
 *     "already_charged" without any further side effects.
 */
import db from "./db";

export type SessionChargeOutcome =
  | { status: "charged"; priceKopecks: number; newBalanceKopecks: number }
  | { status: "already_charged" }
  | { status: "insufficient_balance"; balanceKopecks: number; priceKopecks: number }
  | { status: "invalid_status"; currentStatus: string };

class InsufficientBalanceError extends Error {
  constructor(public balanceKopecks: number, public priceKopecks: number) {
    super("insufficient balance");
  }
}

export async function chargeClientForSession(bookingId: string): Promise<SessionChargeOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, clientId: true, priceRub: true, status: true },
  });
  if (!booking) {
    return { status: "invalid_status", currentStatus: "NOT_FOUND" };
  }
  if (booking.status === "IN_PROGRESS") {
    return { status: "already_charged" };
  }
  if (booking.status !== "CONFIRMED") {
    return { status: "invalid_status", currentStatus: booking.status };
  }

  const priceKopecks = booking.priceRub * 100;

  // Free session (test mode / promos): flip status, skip billing side effects.
  if (priceKopecks === 0) {
    const flip = await db.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data: { status: "IN_PROGRESS" },
    });
    if (flip.count === 0) return { status: "already_charged" };
    return { status: "charged", priceKopecks: 0, newBalanceKopecks: 0 };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const flip = await tx.booking.updateMany({
        where: { id: bookingId, status: "CONFIRMED" },
        data: { status: "IN_PROGRESS" },
      });
      if (flip.count === 0) {
        return { outcome: "already_charged" as const };
      }

      const dec = await tx.user.updateMany({
        where: { id: booking.clientId, balance: { gte: priceKopecks } },
        data: { balance: { decrement: priceKopecks } },
      });
      if (dec.count === 0) {
        const current = await tx.user.findUnique({
          where: { id: booking.clientId },
          select: { balance: true },
        });
        throw new InsufficientBalanceError(current?.balance ?? 0, priceKopecks);
      }

      await tx.payment.create({
        data: {
          bookingId,
          amountKopecks: priceKopecks,
          currency: "RUB",
          status: "PAID",
        },
      });

      await tx.transaction.create({
        data: {
          userId: booking.clientId,
          amount: -priceKopecks,
          status: "SUCCEEDED",
          provider: "internal",
          description: `Оплата сессии ${bookingId}`,
        },
      });

      const user = await tx.user.findUnique({
        where: { id: booking.clientId },
        select: { balance: true },
      });
      return { outcome: "charged" as const, newBalance: user?.balance ?? 0 };
    });

    if (result.outcome === "already_charged") {
      return { status: "already_charged" };
    }
    return { status: "charged", priceKopecks, newBalanceKopecks: result.newBalance };
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { status: "insufficient_balance", balanceKopecks: err.balanceKopecks, priceKopecks };
    }
    throw err;
  }
}

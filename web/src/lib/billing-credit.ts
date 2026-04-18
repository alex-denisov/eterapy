/**
 * Shared credit logic for YooKassa top-ups.
 *
 * Two entry points flow into the same credit path:
 *   1. `POST /api/billing/yookassa-webhook` — YooKassa notifies us when a payment succeeds/cancels.
 *   2. `POST /api/billing/reconcile` — user returns to /cabinet/billing?payment=success and we
 *      actively poll YooKassa for the final status of each PENDING transaction, in case the
 *      webhook is delayed or was lost.
 *
 * Both paths are idempotent: we only credit the balance + save the card when the transaction
 * row is still `PENDING`. The status transition is the guard — once flipped to SUCCEEDED we
 * never credit again, even if the webhook arrives after the reconcile-driven crediting.
 */
import db from "./db";

interface YookassaCardSnapshot {
  id: string;
  saved?: boolean;
  card?: {
    last4: string;
    card_type: string;
    expiry_month: string;
    expiry_year: string;
  };
}

interface YookassaPaymentLike {
  id: string;
  status?: string;
  paid?: boolean;
  payment_method?: YookassaCardSnapshot;
}

function normalizeBrand(cardType: string): string {
  const t = cardType.toLowerCase();
  if (t.includes("visa")) return "Visa";
  if (t.includes("master")) return "MasterCard";
  if (t.includes("mir")) return "Mir";
  return cardType;
}

/**
 * Credits a PENDING transaction: flips to SUCCEEDED, adds amount to user.balance,
 * saves the card if present. Returns `true` if we applied the credit, `false` if the
 * transaction had already been settled by a concurrent run (idempotent no-op).
 */
export async function creditSucceededPayment(
  providerPaymentId: string,
  paymentMethod?: YookassaCardSnapshot,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { providerPaymentId },
    });
    if (!transaction || transaction.status !== "PENDING") return false;

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: "SUCCEEDED" },
    });
    await tx.user.update({
      where: { id: transaction.userId },
      data: { balance: { increment: transaction.amount } },
    });

    const pm = paymentMethod;
    if (pm?.saved && pm.card) {
      const existing = await tx.savedCard.findUnique({
        where: { paymentMethodId: pm.id },
      });
      if (!existing) {
        const existingCardsCount = await tx.savedCard.count({
          where: { userId: transaction.userId },
        });
        await tx.savedCard.create({
          data: {
            userId: transaction.userId,
            paymentMethodId: pm.id,
            last4: pm.card.last4,
            brand: normalizeBrand(pm.card.card_type),
            expiryMonth: pm.card.expiry_month,
            expiryYear: pm.card.expiry_year,
            isDefault: existingCardsCount === 0,
          },
        });
      }
    }
    return true;
  });
}

/** Flips a PENDING transaction to CANCELLED. No balance change. Idempotent. */
export async function cancelPendingPayment(providerPaymentId: string): Promise<boolean> {
  const transaction = await db.transaction.findUnique({
    where: { providerPaymentId },
  });
  if (!transaction || transaction.status !== "PENDING") return false;
  await db.transaction.update({
    where: { id: transaction.id },
    data: { status: "CANCELLED" },
  });
  return true;
}

/** Thin alias used by callers who have the full YooKassa payment object. */
export async function applyPaymentResult(payment: YookassaPaymentLike): Promise<"credited" | "cancelled" | "noop"> {
  const s = payment.status?.toLowerCase();
  if (s === "succeeded" || payment.paid === true) {
    const applied = await creditSucceededPayment(payment.id, payment.payment_method);
    return applied ? "credited" : "noop";
  }
  if (s === "canceled" || s === "cancelled") {
    const applied = await cancelPendingPayment(payment.id);
    return applied ? "cancelled" : "noop";
  }
  return "noop";
}

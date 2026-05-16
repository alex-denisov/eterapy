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
import { notify } from "./notifications";
import { createRefund } from "./yukassa";
import {
  getBillingTransactionMetadata,
  grantEntitlementForTransaction,
  recordCreditLedgerEntry,
  revokeEntitlementsForTransaction,
} from "./entitlements";
import { clawbackReferralRewardsForUser } from "./share-referral";
import { trackServerEvent } from "./analytics";
import { log } from "./logger";

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
  const result = await db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { providerPaymentId },
    });
    if (!transaction || transaction.status !== "PENDING") return null;

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: "SUCCEEDED" },
    });

    const entitlementGrant = await grantEntitlementForTransaction(tx, transaction);
    if (entitlementGrant.kind !== "balance") {
      return {
        userId: transaction.userId,
        amount: transaction.amount,
        newCard: null,
        entitlementGrant,
      };
    }

    const updatedUser = await tx.user.update({
      where: { id: transaction.userId },
      data: { balance: { increment: transaction.amount } },
      select: { balance: true },
    });
    await recordCreditLedgerEntry(tx, {
      userId: transaction.userId,
      amountKopecks: transaction.amount,
      balanceAfterKopecks: updatedUser.balance,
      type: "TOPUP",
      transactionId: transaction.id,
      description: transaction.description,
      metadata: transaction.metadata ?? undefined,
    });

    let newCard: { last4: string; brand: string } | null = null;
    const pm = paymentMethod;
    if (pm?.saved && pm.card) {
      const existing = await tx.savedCard.findUnique({
        where: { paymentMethodId: pm.id },
      });
      if (!existing) {
        const existingCardsCount = await tx.savedCard.count({
          where: { userId: transaction.userId },
        });
        const brand = normalizeBrand(pm.card.card_type);
        await tx.savedCard.create({
          data: {
            userId: transaction.userId,
            paymentMethodId: pm.id,
            last4: pm.card.last4,
            brand,
            expiryMonth: pm.card.expiry_month,
            expiryYear: pm.card.expiry_year,
            isDefault: existingCardsCount === 0,
          },
        });
        newCard = { last4: pm.card.last4, brand };
      }
    }
    return { userId: transaction.userId, amount: transaction.amount, newCard, entitlementGrant };
  });

  if (!result) return false;

  const amountRub = (result.amount / 100).toFixed(2);

  // Track payment_success for funnel analytics (best-effort)
  const productType = result.entitlementGrant.kind === "product"
    ? (result.entitlementGrant as { productKey: string }).productKey
    : result.entitlementGrant.kind === "subscription"
      ? "subscription"
      : "balance";
  trackServerEvent(db, {
    event: "payment_success",
    userId: result.userId,
    surface: "billing",
    properties: {
      amount_rub: amountRub,
      currency: "RUB",
      product_type: productType,
    },
  });

  // Fire notifications outside the DB transaction — best-effort, no blocking.
  notify({
    userId: result.userId,
    event: "BALANCE_TOPUP",
    data: { amountRub },
  }).catch((e) => log.error("billing.balance_topup_notify_failed", { err: e }));

  if (result.newCard) {
    notify({
      userId: result.userId,
      event: "CARD_LINKED",
      data: { last4: result.newCard.last4, brand: result.newCard.brand },
    }).catch((e) => log.error("billing.card_linked_notify_failed", { err: e }));
  }

  if (result.entitlementGrant.kind === "product") {
    notify({
      userId: result.userId,
      event: "PRODUCT_UNLOCKED",
      data: { productKey: result.entitlementGrant.productKey },
    }).catch((e) => log.error("billing.product_unlocked_notify_failed", { err: e }));
  }

  if (result.entitlementGrant.kind === "subscription") {
    notify({
      userId: result.userId,
      event: "SUBSCRIPTION_STARTED",
      data: { planKey: result.entitlementGrant.planKey },
    }).catch((e) => log.error("billing.subscription_started_notify_failed", { err: e }));
  }

  return true;
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

export async function refundSucceededTransaction(input: {
  transactionId: string;
  reason: string;
}): Promise<{ refunded: boolean; providerRefundId?: string | null }> {
  const transaction = await db.transaction.findUnique({
    where: { id: input.transactionId },
    include: { user: { select: { balance: true } } },
  });

  if (!transaction || transaction.status === "REFUNDED") {
    return { refunded: false, providerRefundId: null };
  }
  if (transaction.status !== "SUCCEEDED") {
    throw new Error("Возврат доступен только для успешной транзакции");
  }

  const metadata = getBillingTransactionMetadata(transaction);
  if (metadata.purchaseKind === "balance" && transaction.user.balance < transaction.amount) {
    throw new Error("Недостаточно баланса для безопасного возврата пополнения");
  }

  const providerRefund = transaction.provider === "yookassa" && transaction.providerPaymentId
    ? await createRefund({
      paymentId: transaction.providerPaymentId,
      amountKopecks: Math.abs(transaction.amount),
    })
    : null;

  await db.$transaction(async (tx) => {
    const fresh = await tx.transaction.findUnique({
      where: { id: transaction.id },
      include: { user: { select: { balance: true } } },
    });
    if (!fresh || fresh.status !== "SUCCEEDED") return;

    const freshMetadata = getBillingTransactionMetadata(fresh);
    if (freshMetadata.purchaseKind === "balance") {
      if (fresh.user.balance < fresh.amount) {
        throw new Error("Недостаточно баланса для безопасного возврата пополнения");
      }
      const updatedUser = await tx.user.update({
        where: { id: fresh.userId },
        data: { balance: { decrement: fresh.amount } },
        select: { balance: true },
      });
      await recordCreditLedgerEntry(tx, {
        userId: fresh.userId,
        amountKopecks: -Math.abs(fresh.amount),
        balanceAfterKopecks: updatedUser.balance,
        type: "BALANCE_REFUND",
        source: "yookassa_refund",
        transactionId: fresh.id,
        description: input.reason || fresh.description,
        metadata: {
          ...freshMetadata,
          refundReason: input.reason,
          providerRefundId: providerRefund?.id,
        },
      });
    } else {
      await revokeEntitlementsForTransaction(tx, fresh, input.reason);
    }

    await tx.transaction.update({
      where: { id: fresh.id },
      data: {
        status: "REFUNDED",
        metadata: {
          ...freshMetadata,
          refundReason: input.reason,
          providerRefundId: providerRefund?.id,
          providerRefundStatus: providerRefund?.status,
        },
      },
    });
  });

  await clawbackReferralRewardsForUser({
    referredUserId: transaction.userId,
    reason: `refund:${input.reason}`,
    sourceEventId: transaction.id,
  });

  return { refunded: true, providerRefundId: providerRefund?.id ?? null };
}

/**
 * Marks a SUCCEEDED transaction as REFUNDED in response to a YooKassa-initiated chargeback
 * or refund notification. Does NOT call createRefund — the reversal already happened at
 * the provider level. Reverts balance/entitlements and clawbacks referral rewards.
 */
export async function chargebackSucceededTransaction(input: {
  providerPaymentId: string;
  providerRefundId: string;
  reason: string;
}): Promise<{ applied: boolean }> {
  const transaction = await db.transaction.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
    include: { user: { select: { balance: true } } },
  });

  if (!transaction) return { applied: false };
  if (transaction.status === "REFUNDED") return { applied: false };
  if (transaction.status !== "SUCCEEDED") return { applied: false };

  const metadata = getBillingTransactionMetadata(transaction);

  await db.$transaction(async (tx) => {
    const fresh = await tx.transaction.findUnique({
      where: { id: transaction.id },
      include: { user: { select: { balance: true } } },
    });
    if (!fresh || fresh.status !== "SUCCEEDED") return;

    const freshMetadata = getBillingTransactionMetadata(fresh);
    if (freshMetadata.purchaseKind === "balance") {
      const deduct = Math.min(fresh.amount, fresh.user.balance);
      const updatedUser = await tx.user.update({
        where: { id: fresh.userId },
        data: { balance: { decrement: deduct } },
        select: { balance: true },
      });
      await recordCreditLedgerEntry(tx, {
        userId: fresh.userId,
        amountKopecks: -deduct,
        balanceAfterKopecks: updatedUser.balance,
        type: "BALANCE_REFUND",
        source: "yookassa_chargeback",
        transactionId: fresh.id,
        description: input.reason || "Chargeback",
        metadata: {
          ...freshMetadata,
          refundReason: input.reason,
          providerRefundId: input.providerRefundId,
        },
      });
    } else {
      await revokeEntitlementsForTransaction(tx, fresh, input.reason);
    }

    await tx.transaction.update({
      where: { id: fresh.id },
      data: {
        status: "REFUNDED",
        metadata: {
          ...freshMetadata,
          refundReason: input.reason,
          providerRefundId: input.providerRefundId,
          chargebacked: true,
        },
      },
    });
  });

  await clawbackReferralRewardsForUser({
    referredUserId: transaction.userId,
    reason: `chargeback:${input.reason}`,
    sourceEventId: transaction.id,
  });

  trackServerEvent(db, {
    event: "payment_chargeback",
    userId: transaction.userId,
    surface: "billing",
    properties: {
      amount_rub: (transaction.amount / 100).toFixed(2),
      provider_refund_id: input.providerRefundId,
      reason: input.reason,
    },
  });

  log.warn("billing.chargeback_applied", {
    userId: transaction.userId,
    transactionId: transaction.id,
    providerPaymentId: input.providerPaymentId,
    providerRefundId: input.providerRefundId,
  });

  return { applied: true };
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

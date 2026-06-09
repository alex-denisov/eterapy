/**
 * Shared settlement logic for YooKassa card payments.
 *
 * Two entry points flow into the same settlement path:
 *   1. `POST /api/billing/yookassa-webhook` — YooKassa notifies us when a payment succeeds/cancels.
 *   2. `POST /api/billing/reconcile` — user returns to /cabinet/billing?payment=success and we
 *      actively poll YooKassa for the final status of each PENDING transaction, in case the
 *      webhook is delayed or was lost.
 *
 * Both paths are idempotent: we only grant the entitlement + save the card when the transaction
 * row is still `PENDING`. The status transition is the guard — once flipped to SUCCEEDED we
 * never grant again, even if the webhook arrives after the reconcile-driven settlement.
 * Z1-Ф1: there is no client ₽ balance — a card payment pays directly for a product or
 * subscription, never a top-up.
 */
import db from "./db";
import { notify } from "./notifications";
import { logAudit, AUDIT_ACTIONS } from "./audit";
import { createRefund, cancelPayment } from "./yukassa";
import type { Prisma } from "@prisma/client";
import {
  getBillingTransactionMetadata,
  grantEntitlementForTransaction,
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
 * Settles a PENDING transaction: flips to SUCCEEDED and grants the product or
 * subscription entitlement. Z1-Ф1: there is no client ₽ balance — a card payment
 * pays directly for a product/subscription, never a top-up. Saves the payment
 * card if YooKassa returned a saved method. Returns `true` if applied, `false`
 * if the transaction had already been settled by a concurrent run (idempotent).
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
    const newCard = await saveCardFromPaymentMethod(tx, transaction.userId, paymentMethod);
    return { userId: transaction.userId, amount: transaction.amount, newCard, entitlementGrant };
  });

  if (!result) return false;

  const amountRub = (result.amount / 100).toFixed(2);

  // Track payment_success for funnel analytics (best-effort)
  let productType = "other";
  if (result.entitlementGrant.kind === "product") {
    productType = result.entitlementGrant.productKey;
  } else if (result.entitlementGrant.kind === "subscription") {
    productType = "subscription";
  } else if (result.entitlementGrant.kind === "credits") {
    productType = result.entitlementGrant.creditPackKey;
  } else if (result.entitlementGrant.kind === "bundle") {
    productType = result.entitlementGrant.bundleKey;
  }
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

  // B359 / Баг 4: persist successful payments to the audit log so superadmin has
  // a durable «история оплат» (the PAYMENT action existed but was never written).
  // Best-effort, non-PII details (amount, product type, provider payment id).
  logAudit(
    result.userId,
    AUDIT_ACTIONS.PAYMENT,
    result.userId,
    JSON.stringify({ amountRub, currency: "RUB", productType, providerPaymentId }),
  ).catch((e) => log.error("billing.payment_audit_failed", { err: e }));

  // Fire notifications outside the DB transaction — best-effort, no blocking.
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

  if (result.entitlementGrant.kind === "bundle") {
    notify({
      userId: result.userId,
      event: "PRODUCT_UNLOCKED",
      data: { productKey: result.entitlementGrant.bundleKey },
    }).catch((e) => log.error("billing.bundle_unlocked_notify_failed", { err: e }));
  }

  // B358 / Баг 9: «начисление баллов» — a paid credit-pack purchase must also
  // notify the buyer (email + web + Telegram per prefs). This branch was missing,
  // so credit top-ups settled silently while card/product/subscription notified.
  if (result.entitlementGrant.kind === "credits") {
    notify({
      userId: result.userId,
      event: "BALANCE_TOPUP",
      data: { amountRub, credits: String(result.entitlementGrant.credits) },
    }).catch((e) => log.error("billing.balance_topup_notify_failed", { err: e }));
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
  });

  if (!transaction || transaction.status === "REFUNDED") {
    return { refunded: false, providerRefundId: null };
  }
  if (transaction.status !== "SUCCEEDED") {
    throw new Error("Возврат доступен только для успешной транзакции");
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
    });
    if (!fresh || fresh.status !== "SUCCEEDED") return;

    const freshMetadata = getBillingTransactionMetadata(fresh);
    // Z1-Ф1: no client ₽ balance — a refund just revokes the product/subscription
    // entitlement (digital → credits ledger reversal) and refunds the card.
    await revokeEntitlementsForTransaction(tx, fresh, input.reason);

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
 * the provider level. Revokes entitlements and clawbacks referral rewards.
 */
export async function chargebackSucceededTransaction(input: {
  providerPaymentId: string;
  providerRefundId: string;
  reason: string;
}): Promise<{ applied: boolean }> {
  const transaction = await db.transaction.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
  });

  if (!transaction) return { applied: false };
  if (transaction.status === "REFUNDED") return { applied: false };
  if (transaction.status !== "SUCCEEDED") return { applied: false };

  await db.$transaction(async (tx) => {
    const fresh = await tx.transaction.findUnique({
      where: { id: transaction.id },
    });
    if (!fresh || fresh.status !== "SUCCEEDED") return;

    const freshMetadata = getBillingTransactionMetadata(fresh);
    // Z1-Ф1: no client ₽ balance — a chargeback just revokes the entitlement.
    await revokeEntitlementsForTransaction(tx, fresh, input.reason);

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

/**
 * Z1-Ф1: saves a card from a YooKassa payment_method (idempotent by paymentMethodId).
 * Returns the saved-card summary, or null if nothing was saved.
 */
async function saveCardFromPaymentMethod(
  tx: Prisma.TransactionClient,
  userId: string,
  pm: YookassaCardSnapshot | undefined,
): Promise<{ last4: string; brand: string } | null> {
  if (!pm?.saved || !pm.card) return null;
  const existing = await tx.savedCard.findUnique({ where: { paymentMethodId: pm.id } });
  if (existing) return null;
  const count = await tx.savedCard.count({ where: { userId } });
  const brand = normalizeBrand(pm.card.card_type);
  await tx.savedCard.create({
    data: {
      userId,
      paymentMethodId: pm.id,
      last4: pm.card.last4,
      brand,
      expiryMonth: pm.card.expiry_month,
      expiryYear: pm.card.expiry_year,
      isDefault: count === 0,
    },
  });
  return { last4: pm.card.last4, brand };
}

/**
 * Z1-Ф1: card verification via a 1 ₽ two-stage hold. Saves the card method and
 * RELEASES the hold (cancel) — the client is never charged. Idempotent on the
 * PENDING verification transaction. Used for `save-card` (capture:false) payments
 * that reach `waiting_for_capture`.
 */
export async function verifyCardHold(
  providerPaymentId: string,
  paymentMethod?: YookassaCardSnapshot,
): Promise<boolean> {
  const result = await db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { providerPaymentId } });
    if (!transaction || transaction.status !== "PENDING") return null;
    const newCard = await saveCardFromPaymentMethod(tx, transaction.userId, paymentMethod);
    await tx.transaction.update({ where: { id: transaction.id }, data: { status: "CANCELLED" } });
    return { userId: transaction.userId, newCard };
  });
  if (!result) return false;

  // Release the 1 ₽ hold — best-effort, outside the DB transaction.
  await cancelPayment(providerPaymentId).catch((e) =>
    log.error("billing.card_hold_cancel_failed", { providerPaymentId, err: e }),
  );

  if (result.newCard) {
    notify({
      userId: result.userId,
      event: "CARD_LINKED",
      data: { last4: result.newCard.last4, brand: result.newCard.brand },
    }).catch((e) => log.error("billing.card_linked_notify_failed", { err: e }));
    // Баг 5: card linking must appear in the audit log.
    logAudit(
      result.userId,
      AUDIT_ACTIONS.CARD_LINKED,
      undefined,
      `Привязана карта ${result.newCard.brand} ····${result.newCard.last4}`,
    ).catch((e) => log.error("billing.card_linked_audit_failed", { err: e }));
  }
  return true;
}

/** Thin alias used by callers who have the full YooKassa payment object. */
export async function applyPaymentResult(
  payment: YookassaPaymentLike,
): Promise<"credited" | "cancelled" | "card_verified" | "noop"> {
  const s = payment.status?.toLowerCase();
  if (s === "waiting_for_capture") {
    // Card-verification hold (save_payment_method) → save card + release the hold.
    // Session holds (no saved method) are captured server-side at session start,
    // so they are ignored here.
    if (payment.payment_method?.saved) {
      const applied = await verifyCardHold(payment.id, payment.payment_method);
      return applied ? "card_verified" : "noop";
    }
    return "noop";
  }
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

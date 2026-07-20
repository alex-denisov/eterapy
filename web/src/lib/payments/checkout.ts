/**
 * Provider-agnostic checkout: turns a resolved purchase into a hosted-payment
 * URL plus the `Transaction` row that the settlement path keys off.
 *
 * Both providers converge on the same contract — a PENDING transaction whose
 * `providerPaymentId` is what the provider will quote back to us — so
 * `billing-credit.ts` stays provider-neutral.
 */
import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import type { ResolvedBillingPurchase } from "@/lib/entitlements";
import { assertRubPaymentAmount, paymentDocumentVersionData, withPaymentPolicyMetadata } from "@/lib/billing-policy";
import { yukassaFetch } from "@/lib/yukassa";
import { activePaymentProvider, receiptTaxSystem, robokassaConfig } from "./config";
import { buildPaymentUrl, type RobokassaReceiptItem } from "./robokassa";
import { buildBillingReturnUrl } from "./return-url";

export interface CheckoutResult {
  /** Where to send the payer to complete the payment. */
  confirmationUrl: string;
  /** Provider-side identifier, mirrored on the transaction row. */
  providerPaymentId: string;
  transactionId: string;
}

/** Payment links expire so abandoned checkouts cannot be paid days later. */
const PAYMENT_LINK_TTL_MS = 60 * 60 * 1000;

/**
 * Fiscal classification of what is being sold.
 *
 * Credit packs are money paid before the service is chosen, i.e. an advance —
 * the receipt at top-up records the prepayment, not a delivered service.
 */
function receiptItemFor(purchase: ResolvedBillingPurchase): RobokassaReceiptItem {
  const isAdvance = purchase.kind === "credits";
  return {
    name: purchase.description,
    quantity: 1,
    sumKopecks: purchase.amountKopecks,
    // ИП на УСН не является плательщиком НДС.
    tax: "none",
    paymentObject: isAdvance ? "payment" : "service",
    paymentMethod: isAdvance ? "advance" : "full_payment",
  };
}

/**
 * Creates the payment.
 *
 * The transaction row is written FIRST: Robokassa's `InvId` must be a number we
 * control, and the row's sequence-backed `invoiceId` supplies it. That ordering
 * also means a payment can never exist without a local record of it.
 */
export async function createCheckout({
  userId,
  userEmail,
  purchase,
}: {
  userId: string;
  userEmail?: string | null;
  purchase: ResolvedBillingPurchase;
}): Promise<CheckoutResult> {
  const provider = activePaymentProvider();
  const documentVersions = paymentDocumentVersionData();
  const policyMetadata = withPaymentPolicyMetadata(purchase.metadata);

  if (provider === "robokassa") {
    const config = robokassaConfig();

    const transaction = await db.transaction.create({
      data: {
        userId,
        amount: purchase.amountKopecks,
        currency: "RUB",
        status: "PENDING",
        provider: "robokassa",
        description: purchase.description,
        offerVersion: documentVersions.offerVersion,
        termsVersion: documentVersions.termsVersion,
        consentVersion: documentVersions.consentVersion,
        metadata: policyMetadata,
      },
    });

    // The InvId is the provider-side identifier for this payment.
    const providerPaymentId = String(transaction.invoiceId);
    await db.transaction.update({
      where: { id: transaction.id },
      data: { providerPaymentId },
    });

    const confirmationUrl = buildPaymentUrl({
      config,
      amountKopecks: purchase.amountKopecks,
      invId: transaction.invoiceId,
      description: purchase.description,
      receipt: { items: [receiptItemFor(purchase)], taxSystem: receiptTaxSystem() },
      email: userEmail ?? undefined,
      expiresAt: new Date(Date.now() + PAYMENT_LINK_TTL_MS),
    });

    return { confirmationUrl, providerPaymentId, transactionId: transaction.id };
  }

  // ─── Legacy YooKassa path, kept switchable via PAYMENT_PROVIDER ─────────────
  const returnUrl = buildBillingReturnUrl(policyMetadata, "success", APP_URL);
  const payment = await yukassaFetch<{
    id: string;
    status: string;
    paid: boolean;
    amount: { value: string; currency: string };
    confirmation?: { confirmation_url?: string };
  }>("/payments", {
    method: "POST",
    body: {
      amount: { value: (purchase.amountKopecks / 100).toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: returnUrl },
      notification_url: `${APP_URL}/api/billing/yookassa-webhook`,
      capture: true,
      description: purchase.description,
      metadata: {
        userId,
        amountKopecks: String(purchase.amountKopecks),
        purchaseKind: purchase.metadata.purchaseKind,
        productKey: policyMetadata.productKey,
        planKey: policyMetadata.planKey,
        creditPackKey: policyMetadata.creditPackKey,
        creditsAmount: policyMetadata.creditsAmount ? String(policyMetadata.creditsAmount) : undefined,
        checkoutSource: policyMetadata.checkoutSource,
        returnPath: policyMetadata.returnPath,
        currency: policyMetadata.currency,
        ruOnlyPaymentPolicy: String(policyMetadata.ruOnlyPaymentPolicy),
        offerVersion: policyMetadata.offerVersion,
        termsVersion: policyMetadata.termsVersion,
        consentVersion: policyMetadata.consentVersion,
      },
    },
  });
  assertRubPaymentAmount(payment);

  if (!payment.confirmation?.confirmation_url) {
    throw new Error("Платёжный провайдер не вернул ссылку на оплату");
  }

  const transaction = await db.transaction.create({
    data: {
      userId,
      amount: purchase.amountKopecks,
      currency: "RUB",
      status: "PENDING",
      provider: "yookassa",
      providerPaymentId: payment.id,
      description: purchase.description,
      offerVersion: documentVersions.offerVersion,
      termsVersion: documentVersions.termsVersion,
      consentVersion: documentVersions.consentVersion,
      metadata: policyMetadata,
    },
  });

  return {
    confirmationUrl: payment.confirmation.confirmation_url,
    providerPaymentId: payment.id,
    transactionId: transaction.id,
  };
}

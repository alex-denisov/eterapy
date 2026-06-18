/**
 * POST /api/billing/pay-with-saved-card
 * Быстрая оплата с использованием привязанной карты.
 * Body: { cardId: string, productKey?: string, planKey?: string, creditPackKey?: string }
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { applyPaymentResult } from "@/lib/billing-credit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { resolveBillingPurchase, type ResolvedBillingPurchase } from "@/lib/entitlements";
import { APP_URL } from "@/lib/env";
import {
  assertRubPaymentAmount,
  normalizePaymentDeclineReason,
  paymentDeclineUserMessage,
  paymentDocumentVersionData,
  withPaymentPolicyMetadata,
} from "@/lib/billing-policy";

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json();
  const { cardId } = body;

  if (!cardId) {
    return errorWithRequestContext("CARD_ID_REQUIRED", "cardId required", 400, context);
  }

  let purchase: ResolvedBillingPurchase;
  try {
    purchase = resolveBillingPurchase(body);
  } catch (err) {
    return errorWithRequestContext(
      "INVALID_PURCHASE",
      err instanceof Error ? err.message : "Некорректный платеж",
      400,
      context
    );
  }

  // Находим карту пользователя
  const card = await db.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });

  if (!card) {
    return errorWithRequestContext("CARD_NOT_FOUND", "Карта не найдена", 404, context);
  }

  const baseUrl = APP_URL;
  const returnUrl = `${baseUrl}/cabinet/billing?payment=success`;
  const notificationUrl = `${baseUrl}/api/billing/yookassa-webhook`;
  const documentVersions = paymentDocumentVersionData();
  const policyMetadata = withPaymentPolicyMetadata({
    ...purchase.metadata,
    cardId,
  });

  try {
    // Создаём платёж с использованием сохранённого payment method
    const payment = await yukassaFetch<{
      id: string;
      status: string;
      paid: boolean;
      amount: { value: string; currency: string };
      confirmation?: { confirmation_url?: string };
      cancellation_details?: { party?: string; reason?: string };
      payment_method?: { card?: { issuer_country?: string } };
    }>("/payments", {
      method: "POST",
      body: {
        amount: {
          value: (purchase.amountKopecks / 100).toFixed(2),
          currency: "RUB",
        },
        capture: true,
        payment_method_id: card.paymentMethodId,
        customer_id: session.user.id,
        description: purchase.description,
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
        },
        notification_url: notificationUrl,
        metadata: {
          userId: session.user.id,
          amountKopecks: String(purchase.amountKopecks),
          cardId,
          purchaseKind: policyMetadata.purchaseKind,
          productKey: policyMetadata.productKey,
          planKey: policyMetadata.planKey,
          creditPackKey: policyMetadata.creditPackKey,
          creditsAmount: policyMetadata.creditsAmount ? String(policyMetadata.creditsAmount) : undefined,
          checkoutSource: policyMetadata.checkoutSource,
          currency: policyMetadata.currency,
          ruOnlyPaymentPolicy: String(policyMetadata.ruOnlyPaymentPolicy),
          offerVersion: policyMetadata.offerVersion,
          termsVersion: policyMetadata.termsVersion,
          consentVersion: policyMetadata.consentVersion,
        },
      },
    });
    assertRubPaymentAmount(payment);

    await db.transaction.create({
      data: {
        userId: session.user.id,
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

    // Saved-card charges usually capture immediately, so credit in-band rather than
    // waiting for the async webhook — otherwise the UI would show a stale balance.
    // The webhook (when it arrives) becomes an idempotent no-op.
    const outcome = await applyPaymentResult(payment);
    const declineReason = normalizePaymentDeclineReason(payment);
    if (outcome === "cancelled") {
      return errorWithRequestContext(
        declineReason === "ru_payment_method_required" ? "RU_PAYMENT_METHOD_REQUIRED" : "PAYMENT_DECLINED",
        paymentDeclineUserMessage(declineReason),
        402,
        context,
      );
    }

    log.info("billing-saved-card-payment-created", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      providerPaymentId: payment.id,
      amountKopecks: purchase.amountKopecks,
      purchaseKind: purchase.kind,
      status: payment.status,
      credited: outcome === "credited",
    });

    return jsonWithRequestContext({
      ok: true,
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      credited: outcome === "credited",
      confirmationUrl: payment.confirmation?.confirmation_url,
    }, undefined, context);
  } catch (err: unknown) {
    log.error("billing-saved-card-payment-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      cardId,
      amountKopecks: purchase?.amountKopecks,
      error: serializeError(err),
    });
    const message = err instanceof Error && err.message.includes("Unsupported payment currency")
      ? "Оплата доступна только в рублях."
      : paymentDeclineUserMessage(null);
    return errorWithRequestContext("SAVED_CARD_PAYMENT_FAILED", message, 500, context);
  }
}

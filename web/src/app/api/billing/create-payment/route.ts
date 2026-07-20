/**
 * POST /api/billing/create-payment
 * Создаёт платёж у активного провайдера и возвращает ссылку для редиректа.
 * Body:
 * - product unlock: { productKey: string }
 * - subscription start: { planKey: string }
 * - clarity-credit pack: { creditPackKey: "pack-5" | "pack-10" | "pack-25" }
 *
 * Провайдер выбирается флагом `PAYMENT_PROVIDER` — см. `lib/payments/checkout.ts`.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { resolveBillingPurchaseWithSettings, type ResolvedBillingPurchase } from "@/lib/entitlements";
import { trackServerEvent } from "@/lib/analytics";
import { paymentDeclineUserMessage } from "@/lib/billing-policy";
import { createCheckout } from "@/lib/payments/checkout";
import { activePaymentProvider } from "@/lib/payments/config";

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json();
  let purchase: ResolvedBillingPurchase;
  try {
    purchase = await resolveBillingPurchaseWithSettings(body);
  } catch (err) {
    return errorWithRequestContext(
      "INVALID_PURCHASE",
      err instanceof Error ? err.message : "Некорректный платеж",
      400,
      context
    );
  }

  // Payment velocity check: max 5 payment attempts per hour per user (card testing protection)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await db.transaction.count({
    where: { userId: session.user.id, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= 5) {
    log.warn("billing-payment-velocity-exceeded", {
      requestId: context.requestId,
      userId: session.user.id,
      recentCount,
    });
    return errorWithRequestContext(
      "RATE_LIMITED",
      "Слишком много попыток оплаты. Попробуйте позже.",
      429,
      context
    );
  }

  const provider = activePaymentProvider();

  try {
    const checkout = await createCheckout({
      userId: session.user.id,
      userEmail: session.user.email,
      purchase,
    });

    log.info("billing-payment-created", {
      requestId: context.requestId,
      userId: session.user.id,
      provider,
      providerPaymentId: checkout.providerPaymentId,
      amountKopecks: purchase.amountKopecks,
      purchaseKind: purchase.kind,
    });

    trackServerEvent(db, {
      event: "checkout_started",
      userId: session.user.id,
      surface: "billing",
      properties: {
        amount_rub: (purchase.amountKopecks / 100).toFixed(2),
        currency: "RUB",
        product_type: purchase.metadata.productKey ?? purchase.metadata.planKey ?? purchase.metadata.creditPackKey ?? "other",
      },
    });

    return jsonWithRequestContext({
      ok: true,
      paymentId: checkout.providerPaymentId,
      confirmationUrl: checkout.confirmationUrl,
    }, undefined, context);
  } catch (err: unknown) {
    log.error("billing-payment-create-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      provider,
      amountKopecks: purchase?.amountKopecks,
      error: serializeError(err),
    });
    const message = err instanceof Error ? err.message : "Ошибка создания платежа";
    return errorWithRequestContext(
      "PAYMENT_CREATE_FAILED",
      message.includes("Unsupported payment currency") ? "Оплата доступна только в рублях." : paymentDeclineUserMessage(null),
      500,
      context,
    );
  }
}

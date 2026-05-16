/**
 * POST /api/billing/create-payment
 * Создаёт платёж в ЮKassa и возвращает confirmation URL для редиректа.
 * Body:
 * - balance top-up: { amountKopecks: number, description?: string }
 * - product unlock: { productKey: string }
 * - subscription start: { planKey: string }
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { resolveBillingPurchase, type ResolvedBillingPurchase } from "@/lib/entitlements";
import { trackServerEvent } from "@/lib/analytics";

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json();
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

  // Valid return URL — always a full absolute URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const returnUrl = `${baseUrl}/cabinet/billing?payment=success`;
  const notificationUrl = `${baseUrl}/api/billing/yookassa-webhook`;

  try {
    // Создаём платёж в ЮKassa напрямую через yukassaFetch
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
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
        },
        notification_url: notificationUrl,
        capture: true,
        description: purchase.description,
        metadata: {
          userId: session.user.id,
          amountKopecks: String(purchase.amountKopecks),
          purchaseKind: purchase.metadata.purchaseKind,
          productKey: purchase.metadata.productKey,
          planKey: purchase.metadata.planKey,
          checkoutSource: purchase.metadata.checkoutSource,
        },
      },
    });

    if (!payment.confirmation?.confirmation_url) {
      throw new Error("ЮKassa не вернула confirmation_url");
    }

    // Сохраняем транзакцию в БД
    await db.transaction.create({
      data: {
        userId: session.user.id,
        amount: purchase.amountKopecks,
        status: "PENDING",
        provider: "yookassa",
        providerPaymentId: payment.id,
        description: purchase.description,
        metadata: purchase.metadata,
      },
    });

    log.info("billing-payment-created", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      providerPaymentId: payment.id,
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
        product_type: purchase.metadata.productKey ?? purchase.metadata.planKey ?? "balance",
      },
    });

    return jsonWithRequestContext({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation.confirmation_url,
    }, undefined, context);
  } catch (err: unknown) {
    log.error("billing-payment-create-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      amountKopecks: purchase?.amountKopecks,
      error: serializeError(err),
    });
    const message = err instanceof Error ? err.message : "Ошибка создания платежа";
    return errorWithRequestContext("PAYMENT_CREATE_FAILED", message, 500, context);
  }
}

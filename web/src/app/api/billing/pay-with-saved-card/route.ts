/**
 * POST /api/billing/pay-with-saved-card
 * Быстрое пополнение баланса с использованием привязанной карты.
 * Body: { cardId: string, amountKopecks: number }
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
import { applyPaymentResult } from "@/lib/billing-credit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json();
  const { cardId, amountKopecks } = body;

  if (!cardId) {
    return errorWithRequestContext("CARD_ID_REQUIRED", "cardId required", 400, context);
  }

  const amount = Number(amountKopecks);
  if (!amount || amount < 100) {
    return errorWithRequestContext("INVALID_AMOUNT", "Минимальная сумма 100 копеек (1 ₽)", 400, context);
  }

  // Находим карту пользователя
  const card = await db.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });

  if (!card) {
    return errorWithRequestContext("CARD_NOT_FOUND", "Карта не найдена", 404, context);
  }

  const description = `Пополнение баланса ${amount / 100} ₽`;

  try {
    // Создаём платёж с использованием сохранённого payment method
    const payment = await yukassaFetch<{
      id: string;
      status: string;
      paid: boolean;
      amount: { value: string; currency: string };
    }>("/payments", {
      method: "POST",
      body: {
        amount: {
          value: (amount / 100).toFixed(2),
          currency: "RUB",
        },
        capture: true,
        payment_method_id: card.paymentMethodId,
        customer_id: session.user.id,
        description,
        metadata: {
          userId: session.user.id,
          amountKopecks: String(amount),
          cardId,
        },
      },
    });

    await db.transaction.create({
      data: {
        userId: session.user.id,
        amount,
        status: "PENDING",
        provider: "yookassa",
        providerPaymentId: payment.id,
        description,
      },
    });

    // Saved-card charges usually capture immediately, so credit in-band rather than
    // waiting for the async webhook — otherwise the UI would show a stale balance.
    // The webhook (when it arrives) becomes an idempotent no-op.
    const outcome = await applyPaymentResult(payment);

    log.info("billing-saved-card-payment-created", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      providerPaymentId: payment.id,
      amountKopecks: amount,
      status: payment.status,
      credited: outcome === "credited",
    });

    return jsonWithRequestContext({
      ok: true,
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
      credited: outcome === "credited",
    }, undefined, context);
  } catch (err: unknown) {
    log.error("billing-saved-card-payment-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      cardId,
      amountKopecks: amount,
      error: serializeError(err),
    });
    return errorWithRequestContext(
      "SAVED_CARD_PAYMENT_FAILED",
      err instanceof Error ? err.message : "Ошибка платежа",
      500,
      context
    );
  }
}

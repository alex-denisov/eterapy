/**
 * POST /api/billing/create-payment
 * Создаёт платёж в ЮKassa и возвращает confirmation URL для редиректа.
 * Body: { amountKopecks: number, description?: string }
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";
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
  const amountKopecks = Number(body.amountKopecks);
  const description = body.description || `Пополнение баланса на сайте ETerapy`;

  if (!amountKopecks || amountKopecks < 100) {
    return errorWithRequestContext("INVALID_AMOUNT", "Минимальная сумма 100 копеек (1 ₽)", 400, context);
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
        amount: { value: (amountKopecks / 100).toFixed(2), currency: "RUB" },
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
        },
        notification_url: notificationUrl,
        capture: true,
        description,
        metadata: {
          userId: session.user.id,
          amountKopecks: String(amountKopecks),
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
        amount: amountKopecks,
        status: "PENDING",
        provider: "yookassa",
        providerPaymentId: payment.id,
        description,
      },
    });

    log.info("billing-payment-created", {
      requestId: context.requestId,
      userId: session.user.id,
      provider: "yookassa",
      providerPaymentId: payment.id,
      amountKopecks,
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
      amountKopecks,
      error: serializeError(err),
    });
    const message = err instanceof Error ? err.message : "Ошибка создания платежа";
    return errorWithRequestContext("PAYMENT_CREATE_FAILED", message, 500, context);
  }
}

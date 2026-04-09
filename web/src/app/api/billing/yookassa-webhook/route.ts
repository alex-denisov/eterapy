/**
 * POST /api/billing/yookassa-webhook
 * Webhook от ЮKassa для обновления статуса платежа.
 * ЮKassa отправляет события: payment.succeeded, payment.canceled и т.д.
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const event = body.event; // "payment.succeeded", "payment.canceled"
  const payment = body.object;

  if (!payment?.id) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  const providerPaymentId = payment.id;
  const transaction = await db.transaction.findUnique({
    where: { providerPaymentId },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  switch (event) {
    case "payment.succeeded":
      await db.$transaction([
        // Обновляем статус транзакции
        db.transaction.update({
          where: { id: transaction.id },
          data: { status: "SUCCEEDED" },
        }),
        // Начисляем баланс пользователю
        db.user.update({
          where: { id: transaction.userId },
          data: { balance: { increment: transaction.amount } },
        }),
      ]);
      break;

    case "payment.canceled":
      await db.transaction.update({
        where: { id: transaction.id },
        data: { status: "CANCELLED" },
      });
      break;

    default:
      console.log(`Unknown webhook event: ${event}`);
  }

  return NextResponse.json({ ok: true });
}

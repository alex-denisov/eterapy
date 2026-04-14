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
      await db.$transaction(async (tx) => {
        // Обновляем статус транзакции
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "SUCCEEDED" },
        });
        // Начисляем баланс пользователю
        await tx.user.update({
          where: { id: transaction.userId },
          data: { balance: { increment: transaction.amount } },
        });

        // Если платёж был с сохранением карты — сохраняем payment method
        const pm = payment.payment_method;
        if (pm?.saved && pm.card) {
          const existing = await tx.savedCard.findUnique({
            where: { paymentMethodId: pm.id },
          });
          if (!existing) {
            // Если это первая карта — делаем её default
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
      });
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

function normalizeBrand(cardType: string): string {
  const t = cardType.toLowerCase();
  if (t.includes("visa")) return "Visa";
  if (t.includes("master")) return "MasterCard";
  if (t.includes("mir")) return "Mir";
  return cardType;
}

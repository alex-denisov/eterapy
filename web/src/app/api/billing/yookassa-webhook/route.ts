/**
 * POST /api/billing/yookassa-webhook
 * Webhook от ЮKassa для обновления статуса платежа.
 * ЮKassa отправляет события: payment.succeeded, payment.canceled и т.д.
 *
 * YooKassa authenticates webhooks via HTTP Basic Auth using shopId:secretKey.
 * We verify the Authorization header to ensure the request is legitimate.
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;

function verifyYookassaAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  if (!YUKASSA_SHOP_ID || !YUKASSA_SECRET_KEY) {
    // In development, allow without auth if env vars are missing
    console.warn("[yookassa-webhook] YUKASSA_SHOP_ID or YUKASSA_SECRET_KEY not set, skipping auth verification");
    return true;
  }

  const expected = `Basic ${Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString("base64")}`;
  return authHeader === expected;
}

export async function POST(req: NextRequest) {
  // Verify YooKassa authentication
  if (!verifyYookassaAuth(req)) {
    console.error("[yookassa-webhook] Unauthorized — invalid or missing Basic Auth");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const event = body.event; // "payment.succeeded", "payment.canceled"
  const payment = body.object;

  if (!payment?.id) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const providerPaymentId = payment.id;

  // Log incoming webhook for debugging
  console.log(`[yookassa-webhook] Event: ${event}, Payment ID: ${providerPaymentId}`);

  const transaction = await db.transaction.findUnique({
    where: { providerPaymentId },
  });

  if (!transaction) {
    console.error(`[yookassa-webhook] Transaction not found for providerPaymentId: ${providerPaymentId}`);
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
        // Начисляем баланс пользователю (amount is already in kopecks)
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
      console.log(`[yookassa-webhook] Payment succeeded: transaction ${transaction.id}, user ${transaction.userId}, amount ${transaction.amount} kopecks`);
      break;

    case "payment.canceled":
      await db.transaction.update({
        where: { id: transaction.id },
        data: { status: "CANCELLED" },
      });
      console.log(`[yookassa-webhook] Payment canceled: transaction ${transaction.id}`);
      break;

    default:
      console.log(`[yookassa-webhook] Unknown webhook event: ${event}`);
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

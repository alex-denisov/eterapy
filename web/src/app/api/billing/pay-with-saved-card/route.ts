/**
 * POST /api/billing/pay-with-saved-card
 * Быстрое пополнение баланса с использованием привязанной карты.
 * Body: { cardId: string, amountKopecks: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch } from "@/lib/yukassa";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json();
  const { cardId, amountKopecks } = body;

  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const amount = Number(amountKopecks);
  if (!amount || amount < 100) {
    return NextResponse.json({ error: "Минимальная сумма 100 копеек (1 ₽)" }, { status: 400 });
  }

  // Находим карту пользователя
  const card = await db.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });

  if (!card) {
    return NextResponse.json({ error: "Карта не найдена" }, { status: 404 });
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

    // Сохраняем транзакцию
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

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      status: payment.status,
      paid: payment.paid,
    });
  } catch (err: any) {
    console.error("YuKassa pay-with-saved-card error:", err);
    return NextResponse.json({ error: err.message || "Ошибка платежа" }, { status: 500 });
  }
}

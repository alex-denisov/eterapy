/**
 * POST /api/billing/create-payment
 * Создаёт платёж в ЮKassa и возвращает confirmation URL для редиректа.
 * Body: { amountKopecks: number, description?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { yukassaFetch, createPayment as ykCreatePayment } from "@/lib/yukassa";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json();
  const amountKopecks = Number(body.amountKopecks);
  const description = body.description || `Пополнение баланса на сайте ETerapy`;

  if (!amountKopecks || amountKopecks < 100) {
    return NextResponse.json({ error: "Минимальная сумма 100 ₽ (10000 копеек)" }, { status: 400 });
  }

  try {
    // Создаём платёж в ЮKassa
    const payment = await ykCreatePayment({
      amount: { value: (amountKopecks / 100).toFixed(2), currency: "RUB" },
      confirmation: {
        type: "redirect",
        return_url: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/cabinet/billing?payment=success`
          : "http://localhost:3000/cabinet/billing?payment=success",
      },
      capture: true,
      description,
      metadata: {
        userId: session.user.id,
        amountKopecks: String(amountKopecks),
      },
    });

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

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation?.confirmation_url,
    });
  } catch (err: any) {
    console.error("YuKassa create payment error:", err);
    return NextResponse.json({ error: err.message || "Ошибка создания платежа" }, { status: 500 });
  }
}

/**
 * POST /api/billing/create-payment
 * Создаёт платёж в ЮKassa и возвращает confirmation URL для редиректа.
 * Body: { amountKopecks: number, description?: string }
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
  const amountKopecks = Number(body.amountKopecks);
  const description = body.description || `Пополнение баланса на сайте ETerapy`;

  if (!amountKopecks || amountKopecks < 100) {
    return NextResponse.json({ error: "Минимальная сумма 100 копеек (1 ₽)" }, { status: 400 });
  }

  // Valid return URL — always a full absolute URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const returnUrl = `${baseUrl}/cabinet/billing?payment=success`;

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

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      confirmationUrl: payment.confirmation.confirmation_url,
    });
  } catch (err: any) {
    console.error("YuKassa create payment error:", err);
    return NextResponse.json({ error: err.message || "Ошибка создания платежа" }, { status: 500 });
  }
}

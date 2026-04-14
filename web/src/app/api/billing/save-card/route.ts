/**
 * POST /api/billing/save-card
 * Создаёт платёж с save_payment_method=true для привязки карты.
 * После оплаты карта сохраняется в БД через webhook.
 * Body: { amountKopecks?: number } — если не указано, используется 100 (1 ₽)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { yukassaFetch } from "@/lib/yukassa";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json();
  // Минимальная сумма для привязки карты — 1 ₽ (100 копеек)
  const amountKopecks = Math.max(Number(body.amountKopecks) || 100, 100);
  const description = body.description || "Привязка банковской карты";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const returnUrl = `${baseUrl}/cabinet/billing?payment=card-saved`;
  const notificationUrl = `${baseUrl}/api/billing/yookassa-webhook`;

  try {
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
        save_payment_method: true,
        customer_id: session.user.id,
        description,
        metadata: {
          userId: session.user.id,
          amountKopecks: String(amountKopecks),
          saveMethod: "true",
        },
      },
    });

    if (!payment.confirmation?.confirmation_url) {
      throw new Error("ЮKassa не вернула confirmation_url");
    }

    // Сохраняем транзакцию
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
    console.error("YuKassa save-card error:", err);
    return NextResponse.json({ error: err.message || "Ошибка привязки карты" }, { status: 500 });
  }
}

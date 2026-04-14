/**
 * GET /api/billing/cards — Список привязанных карт пользователя
 * DELETE /api/billing/cards?cardId=xxx — Удалить привязанную карту
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { deleteSavedPaymentMethod } from "@/lib/yukassa";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const cards = await db.savedCard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ cards });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("cardId");

  if (!cardId) {
    return NextResponse.json({ error: "cardId required" }, { status: 400 });
  }

  const card = await db.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });

  if (!card) {
    return NextResponse.json({ error: "Карта не найдена" }, { status: 404 });
  }

  try {
    // Удаляем из YooKassa
    await deleteSavedPaymentMethod(card.paymentMethodId);
  } catch (err: any) {
    console.error("YooKassa delete payment method error:", err);
    // Продолжаем — удаляем из БД даже если YooKassa вернул ошибку
  }

  // Удаляем из БД
  await db.savedCard.delete({ where: { id: cardId } });

  // Если это была default карта, назначаем новую default
  if (card.isDefault) {
    const remainingCards = await db.savedCard.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    if (remainingCards.length > 0) {
      await db.savedCard.update({
        where: { id: remainingCards[0].id },
        data: { isDefault: true },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

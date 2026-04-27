/**
 * GET /api/billing/cards — Список привязанных карт пользователя
 * DELETE /api/billing/cards?cardId=xxx — Удалить привязанную карту
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { deleteSavedPaymentMethod } from "@/lib/yukassa";
import { notify } from "@/lib/notifications";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const cards = await db.savedCard.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return jsonWithRequestContext({ cards }, undefined, context);
}

export async function DELETE(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("cardId");

  if (!cardId) {
    return errorWithRequestContext("CARD_ID_REQUIRED", "cardId required", 400, context);
  }

  const card = await db.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id },
  });

  if (!card) {
    return errorWithRequestContext("CARD_NOT_FOUND", "Карта не найдена", 404, context);
  }

  try {
    // Удаляем из YooKassa
    await deleteSavedPaymentMethod(card.paymentMethodId);
  } catch (err: unknown) {
    log.warn("billing-card-provider-delete-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      cardId,
      provider: "yookassa",
      error: serializeError(err),
    });
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

  notify({
    userId: session.user.id,
    event: "CARD_REMOVED",
    data: { last4: card.last4, brand: card.brand },
    requestId: context.requestId,
  }).catch((e) => {
    log.error("billing-card-removed-notify-failed", {
      requestId: context.requestId,
      userId: session.user.id,
      cardId,
      error: serializeError(e),
    });
  });

  log.info("billing-card-removed", {
    requestId: context.requestId,
    userId: session.user.id,
    cardId,
  });

  return jsonWithRequestContext({ ok: true }, undefined, context);
}

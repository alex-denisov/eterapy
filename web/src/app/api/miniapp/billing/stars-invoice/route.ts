/**
 * POST /api/miniapp/billing/stars-invoice — B529
 *
 * Выставляет счёт в Telegram Stars и возвращает ссылку, которую мини-апп
 * открывает через `WebApp.openInvoice`. Тело запроса — то же, что у веб-оплаты
 * (`{ productKey }` | `{ planKey }` | `{ creditPackKey }`): цена берётся из
 * общего прейскуранта, а не приезжает от клиента.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { log, serializeError } from "@/lib/logger";
import { requestContextFromHeaders } from "@/lib/request-context";
import { resolveBillingPurchaseWithSettings, type ResolvedBillingPurchase } from "@/lib/entitlements";
import { trackServerEvent } from "@/lib/analytics";
import { isStarsConfigured } from "@/lib/payments/telegram-stars";
import { createStarsInvoice, StarsCheckoutError } from "@/lib/payments/telegram-stars-server";

/** Тот же потолок попыток, что у веб-оплаты: защита от перебора. */
const MAX_ATTEMPTS_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  if (!isStarsConfigured()) {
    return errorWithRequestContext("STARS_UNAVAILABLE", "Оплата звёздами пока недоступна", 503, context);
  }

  let purchase: ResolvedBillingPurchase;
  try {
    purchase = await resolveBillingPurchaseWithSettings(await req.json());
  } catch (err) {
    return errorWithRequestContext(
      "INVALID_PURCHASE",
      err instanceof Error ? err.message : "Некорректный платеж",
      400,
      context,
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await db.transaction.count({
    where: { userId: session.user.id, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= MAX_ATTEMPTS_PER_HOUR) {
    log.warn("stars-invoice-velocity-exceeded", { requestId: context.requestId, userId: session.user.id, recentCount });
    return errorWithRequestContext("RATE_LIMITED", "Слишком много попыток оплаты. Попробуйте позже.", 429, context);
  }

  try {
    const invoice = await createStarsInvoice({ userId: session.user.id, purchase });

    trackServerEvent(db, {
      event: "payment_started",
      userId: session.user.id,
      surface: "miniapp",
      properties: { provider: "telegram_stars", stars: String(invoice.stars), purchase_kind: purchase.kind },
    });

    return jsonWithRequestContext({ invoiceLink: invoice.invoiceLink, stars: invoice.stars }, undefined, context);
  } catch (err) {
    if (err instanceof StarsCheckoutError) {
      return errorWithRequestContext("STARS_UNAVAILABLE", err.message, 502, context);
    }
    log.error("stars-invoice-unhandled", { requestId: context.requestId, error: serializeError(err) });
    return errorWithRequestContext("PAYMENT_FAILED", "Не удалось выставить счёт", 500, context);
  }
}

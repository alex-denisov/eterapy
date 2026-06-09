/**
 * Z1a — карточная оплата сессий (двухстадийная hold/эскроу).
 *
 * Заменяет балансовую оплату (`session-charge.ts`). Жизненный цикл:
 *   1. Бронь создана  → holdSessionForBooking()  → YooKassa hold (capture:false),
 *      клиент авторизует платёж по confirmationUrl. Payment(status=PENDING).
 *   2. Старт сессии (CONFIRMED→IN_PROGRESS) → captureSessionForBooking() →
 *      capture холда, Payment(PAID) + расходная Transaction.
 *   3. Отмена/неявка до capture → cancelSessionHold() → release холда.
 *   4. Возврат по жалобе (после capture) → refundSessionForBooking() → YooKassa refund.
 *
 * NB: карт-холд YooKassa живёт ~7 дней — capture/cancel должны произойти в этом окне
 * (холд создаётся при брони, захватывается при старте сессии; для дальних дат
 * политику lead-time задаёт вызывающий код).
 */
import db from "./db";
import { APP_URL } from "@/lib/env";
import { log } from "@/lib/logger";
import { notify } from "./notifications";
import {
  createTwoStagePayment,
  createTwoStagePaymentFromSavedMethod,
  capturePayment,
  cancelPayment,
  createRefund,
} from "./yukassa";

export type SessionHoldResult =
  | { status: "free" }
  // viaSavedCard=true → авторизовано привязанной картой без редиректа (Баг 16).
  | { status: "held"; paymentId: string; confirmationUrl: string; viaSavedCard: boolean };

/** Создаёт двухстадийный hold на сессию при бронировании. Деньги резервируются,
 *  но не списываются до старта сессии. Бесплатная сессия (priceRub=0) → no-op.
 *
 *  Баг 16: если у клиента есть привязанная карта — холдируем одним тапом по ней
 *  (createTwoStagePaymentFromSavedMethod, без редиректа на ЮKassa). Если карты нет
 *  или платёж по ней требует 3DS / отклонён — откатываемся на обычный hold с
 *  confirmationUrl (редирект на оплату картой). */
export async function holdSessionForBooking(input: {
  bookingId: string;
  priceRub: number;
  clientId?: string;
  description?: string;
  returnUrl?: string;
}): Promise<SessionHoldResult> {
  const priceKopecks = input.priceRub * 100;
  if (priceKopecks <= 0) return { status: "free" };

  const description = input.description ?? `Оплата сессии ${input.bookingId}`;
  const returnUrl = input.returnUrl ?? `${APP_URL}/cabinet/bookings?booking=${input.bookingId}`;

  // 1. Попытка холда по привязанной карте (без редиректа).
  let viaSavedCard = false;
  let payment: Awaited<ReturnType<typeof createTwoStagePayment>> | null = null;
  if (input.clientId) {
    const card = await db.savedCard.findFirst({
      where: { userId: input.clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { paymentMethodId: true },
    });
    if (card) {
      try {
        const p = await createTwoStagePaymentFromSavedMethod({
          amountKopecks: priceKopecks,
          bookingId: input.bookingId,
          paymentMethodId: card.paymentMethodId,
          customerId: input.clientId,
          description,
        });
        // Успешный одно-таповый холд → waiting_for_capture без confirmationUrl.
        if (p.status === "waiting_for_capture" || (p.status === "pending" && !p.confirmationUrl)) {
          payment = p;
          viaSavedCard = true;
        } else if (p.confirmationUrl) {
          // Карта требует 3DS — используем тот же платёж с редиректом.
          payment = p;
        }
      } catch (e) {
        log.warn("session-payment.saved_card_hold_failed", { bookingId: input.bookingId, err: e });
      }
    }
  }

  // 2. Фолбэк: обычный двухстадийный платёж с редиректом на ЮKassa.
  if (!payment) {
    payment = await createTwoStagePayment({
      amountKopecks: priceKopecks,
      bookingId: input.bookingId,
      returnUrl,
      description,
    });
  }

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: input.bookingId },
      data: { paymentId: payment!.id, paymentMethod: "yukassa" },
    });
    await tx.payment.upsert({
      where: { bookingId: input.bookingId },
      create: {
        bookingId: input.bookingId,
        externalId: payment!.id,
        amountKopecks: priceKopecks,
        currency: "RUB",
        status: "PENDING",
      },
      update: { externalId: payment!.id, amountKopecks: priceKopecks, status: "PENDING" },
    });
  });

  return {
    status: "held",
    paymentId: payment.id,
    confirmationUrl: viaSavedCard ? "" : (payment.confirmationUrl ?? ""),
    viaSavedCard,
  };
}

export type SessionCaptureOutcome =
  | { status: "charged"; priceKopecks: number }
  | { status: "already_charged" }
  | { status: "hold_missing" }
  | { status: "invalid_status"; currentStatus: string };

/** Захватывает hold при старте сессии (CONFIRMED→IN_PROGRESS). Идемпотентно. */
export async function captureSessionForBooking(bookingId: string): Promise<SessionCaptureOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, clientId: true, priceRub: true, status: true, paymentId: true,
      practitioner: { select: { userId: true } },
    },
  });
  if (!booking) return { status: "invalid_status", currentStatus: "NOT_FOUND" };
  if (booking.status === "IN_PROGRESS") return { status: "already_charged" };
  if (booking.status !== "CONFIRMED") return { status: "invalid_status", currentStatus: booking.status };

  const priceKopecks = booking.priceRub * 100;

  // Бесплатная сессия (test mode / промо): только меняем статус.
  if (priceKopecks === 0) {
    const flip = await db.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data: { status: "IN_PROGRESS" },
    });
    return flip.count === 0 ? { status: "already_charged" } : { status: "charged", priceKopecks: 0 };
  }

  if (!booking.paymentId) return { status: "hold_missing" };

  // Захват холда в YooKassa (идемпотентно по capture-{id}).
  const captured = await capturePayment(booking.paymentId, priceKopecks);
  if (captured.status !== "succeeded") return { status: "hold_missing" };

  const result = await db.$transaction(async (tx) => {
    const flip = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data: { status: "IN_PROGRESS" },
    });
    if (flip.count === 0) return "already_charged" as const;

    await tx.payment.update({ where: { bookingId }, data: { status: "PAID" } }).catch(() => {});
    await tx.transaction.create({
      data: {
        userId: booking.clientId,
        amount: -priceKopecks,
        status: "SUCCEEDED",
        provider: "yukassa",
        description: `Оплата сессии ${bookingId}`,
      },
    });
    return "charged" as const;
  });

  // Баг 16: когда холд захвачен (деньги реально получены) — практик видит, что
  // оплата прошла. Уведомляем его событием PAYMENT_RECEIVED (→ /earnings).
  if (result === "charged" && booking.practitioner?.userId) {
    notify({ userId: booking.practitioner.userId, event: "PAYMENT_RECEIVED", data: {
      amountRub: booking.priceRub.toLocaleString("ru-RU"), date: new Date().toLocaleDateString("ru-RU"),
    }}).catch((e: unknown) => log.warn("session-payment.capture_notify_failed", { bookingId, err: e }));
  }

  return result === "already_charged" ? { status: "already_charged" } : { status: "charged", priceKopecks };
}

/** Отменяет hold при отмене брони (если ещё не захвачен). Захваченный платёж не
 *  отменяется здесь — для него путь возврата refundSessionForBooking(). */
export async function cancelSessionHold(
  bookingId: string,
): Promise<{ status: "cancelled" | "noop" | "already_captured" }> {
  const payment = await db.payment.findUnique({
    where: { bookingId },
    select: { externalId: true, status: true },
  });
  if (!payment?.externalId) return { status: "noop" };
  if (payment.status === "PAID") return { status: "already_captured" };

  await cancelPayment(payment.externalId).catch(() => {});
  await db.payment.update({ where: { bookingId }, data: { status: "CANCELLED" } }).catch(() => {});
  return { status: "cancelled" };
}

/** Возврат на карту за уже захваченную сессию (по жалобе/споре). */
export async function refundSessionForBooking(
  bookingId: string,
  amountKopecks: number,
): Promise<{ status: "refunded" | "noop" }> {
  const payment = await db.payment.findUnique({
    where: { bookingId },
    select: { externalId: true, status: true },
  });
  if (!payment?.externalId || payment.status !== "PAID") return { status: "noop" };

  await createRefund({ paymentId: payment.externalId, amountKopecks });
  await db.payment.update({
    where: { bookingId },
    data: { status: "REFUNDED", refundedAt: new Date() },
  }).catch(() => {});
  return { status: "refunded" };
}

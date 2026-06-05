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
import {
  createTwoStagePayment,
  capturePayment,
  cancelPayment,
  createRefund,
} from "./yukassa";

export type SessionHoldResult =
  | { status: "free" }
  | { status: "held"; paymentId: string; confirmationUrl: string };

/** Создаёт двухстадийный hold на сессию при бронировании. Деньги резервируются,
 *  но не списываются до старта сессии. Бесплатная сессия (priceRub=0) → no-op. */
export async function holdSessionForBooking(input: {
  bookingId: string;
  priceRub: number;
  description?: string;
  returnUrl?: string;
}): Promise<SessionHoldResult> {
  const priceKopecks = input.priceRub * 100;
  if (priceKopecks <= 0) return { status: "free" };

  const returnUrl = input.returnUrl ?? `${APP_URL}/cabinet/bookings?booking=${input.bookingId}`;
  const payment = await createTwoStagePayment({
    amountKopecks: priceKopecks,
    bookingId: input.bookingId,
    returnUrl,
    description: input.description ?? `Оплата сессии ${input.bookingId}`,
  });

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: input.bookingId },
      data: { paymentId: payment.id, paymentMethod: "yukassa" },
    });
    await tx.payment.upsert({
      where: { bookingId: input.bookingId },
      create: {
        bookingId: input.bookingId,
        externalId: payment.id,
        amountKopecks: priceKopecks,
        currency: "RUB",
        status: "PENDING",
      },
      update: { externalId: payment.id, amountKopecks: priceKopecks, status: "PENDING" },
    });
  });

  return { status: "held", paymentId: payment.id, confirmationUrl: payment.confirmationUrl ?? "" };
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
    select: { id: true, clientId: true, priceRub: true, status: true, paymentId: true },
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

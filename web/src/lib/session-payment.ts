/**
 * Z1a — карточная оплата сессий (двухстадийная hold/эскроу).
 *
 * Заменяет балансовую оплату (`session-charge.ts`). Жизненный цикл:
 *   1. Бронь создана  → holdSessionForBooking()  → YooKassa hold (capture:false),
 *      клиент авторизует платёж по confirmationUrl. Payment(status=PENDING).
 *   2. Старт сессии (CONFIRMED→IN_PROGRESS) → startSessionForBooking() →
 *      без capture: hold остаётся зарезервированным.
 *   3. Завершение сессии → payout создаётся в HELD на 24h dispute window.
 *   4. После dispute window без открытого спора → captureSessionForBooking() →
 *      capture холда, Payment(PAID), расходная Transaction, payout(PENDING).
 *   5. Отмена/неявка до capture → cancelSessionHold() → release холда.
 *   6. Возврат по жалобе (после capture) → refundSessionForBooking() → YooKassa refund.
 *
 * NB: карт-холд YooKassa живёт ~7 дней — capture/cancel должны произойти в этом окне
 * (холд создаётся при брони, захватывается после 24h dispute window; для дальних дат
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
import { paymentDocumentVersionData } from "@/lib/billing-policy";

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
  const documentVersions = paymentDocumentVersionData();

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
        offerVersion: documentVersions.offerVersion,
        termsVersion: documentVersions.termsVersion,
        consentVersion: documentVersions.consentVersion,
      },
      update: {
        externalId: payment!.id,
        amountKopecks: priceKopecks,
        status: "PENDING",
        offerVersion: documentVersions.offerVersion,
        termsVersion: documentVersions.termsVersion,
        consentVersion: documentVersions.consentVersion,
      },
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

export type SessionStartOutcome =
  | { status: "started" }
  | { status: "already_started" }
  | { status: "hold_missing" }
  | { status: "invalid_status"; currentStatus: string };

/** Начинает сессию (CONFIRMED→IN_PROGRESS), не захватывая card hold. */
export async function startSessionForBooking(bookingId: string): Promise<SessionStartOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      priceRub: true,
      paymentId: true,
      payment: { select: { externalId: true, status: true } },
    },
  });
  if (!booking) return { status: "invalid_status", currentStatus: "NOT_FOUND" };
  if (booking.status === "IN_PROGRESS") return { status: "already_started" };
  if (booking.status !== "CONFIRMED") return { status: "invalid_status", currentStatus: booking.status };
  if (booking.priceRub > 0 && (!booking.paymentId || !booking.payment?.externalId || booking.payment.status !== "PENDING")) {
    return { status: "hold_missing" };
  }

  const startedAt = new Date(Date.now());
  const flip = await db.booking.updateMany({
    where: { id: bookingId, status: "CONFIRMED" },
    data: { status: "IN_PROGRESS", startedAt },
  });
  return flip.count === 0 ? { status: "already_started" } : { status: "started" };
}

/** Захватывает hold после истечения 24h dispute window. Идемпотентно. */
export async function captureSessionForBooking(bookingId: string): Promise<SessionCaptureOutcome> {
  return settleSessionAfterDisputeWindow(bookingId);
}

export async function settleSessionAfterDisputeWindow(
  bookingId: string,
  options: { releaseAnyHeldPayout?: boolean } = {},
): Promise<SessionCaptureOutcome> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, clientId: true, priceRub: true, status: true, paymentId: true,
      payment: { select: { externalId: true, status: true } },
      practitioner: { select: { userId: true } },
    },
  });
  if (!booking) return { status: "invalid_status", currentStatus: "NOT_FOUND" };
  if (booking.status !== "COMPLETED") return { status: "invalid_status", currentStatus: booking.status };

  const priceKopecks = booking.priceRub * 100;
  const documentVersions = paymentDocumentVersionData();
  const heldPayoutWhere = options.releaseAnyHeldPayout
    ? { bookingId, status: "HELD" as const }
    : { bookingId, status: "HELD" as const, holdReason: "dispute_window" };

  // Бесплатная сессия (test mode / промо): только выпускаем payout из dispute hold.
  if (priceKopecks === 0) {
    await db.payout.updateMany({
      where: heldPayoutWhere,
      data: { status: "PENDING", holdReason: "payout_delay" },
    });
    return { status: "charged", priceKopecks: 0 };
  }

  const providerPaymentId = booking.payment?.externalId ?? booking.paymentId;
  if (booking.payment?.status === "PAID") {
    await db.payout.updateMany({
      where: heldPayoutWhere,
      data: { status: "PENDING", holdReason: "payout_delay" },
    });
    return { status: "already_charged" };
  }
  if (!providerPaymentId || booking.payment?.status !== "PENDING") return { status: "hold_missing" };

  // Захват холда в YooKassa (идемпотентно по capture-{id}).
  const captured = await capturePayment(providerPaymentId, priceKopecks);
  if (captured.status !== "succeeded") return { status: "hold_missing" };

  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { bookingId }, data: { status: "PAID" } }).catch(() => {});
    await tx.transaction.create({
      data: {
        userId: booking.clientId,
        amount: -priceKopecks,
        currency: "RUB",
        status: "SUCCEEDED",
        provider: "yukassa",
        providerPaymentId,
        description: `Оплата сессии ${bookingId}`,
        offerVersion: documentVersions.offerVersion,
        termsVersion: documentVersions.termsVersion,
        consentVersion: documentVersions.consentVersion,
        metadata: {
          purchaseKind: "session",
          bookingId,
          currency: "RUB",
          ruOnlyPaymentPolicy: true,
          ...documentVersions,
        },
      },
    });
    await tx.payout.updateMany({
      where: heldPayoutWhere,
      data: { status: "PENDING", holdReason: "payout_delay" },
    });
  });

  // Баг 16: когда холд захвачен (деньги реально получены) — практик видит, что
  // оплата прошла. Уведомляем его событием PAYMENT_RECEIVED (→ /earnings).
  if (booking.practitioner?.userId) {
    notify({ userId: booking.practitioner.userId, event: "PAYMENT_RECEIVED", data: {
      amountRub: booking.priceRub.toLocaleString("ru-RU"), date: new Date().toLocaleDateString("ru-RU"),
    }}).catch((e: unknown) => log.warn("session-payment.capture_notify_failed", { bookingId, err: e }));
  }

  return { status: "charged", priceKopecks };
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
  await db.payment.update({
    where: { bookingId },
    data: { status: "CANCELLED", paymentDeclineReason: "provider_payment_canceled" },
  }).catch(() => {});
  return { status: "cancelled" };
}

/**
 * B481 — удержание при поздней отмене клиентом (<24ч), согласованной практиком
 * БЕЗ прощения. Если платёж ещё на холде — capture на сумму удержания (остаток
 * авторизации YooKassa освобождает автоматически); если уже захвачен —
 * возвращается разница. Полное прощение/возврат идут обычными путями
 * (cancelSessionHold / refundSessionForBooking).
 *
 * B567 (owner 2026-07-22): удержание = 100% цены, поэтому на практике разницы
 * не остаётся и возврат не выставляется — статус `retained` говорит об этом
 * прямо. Ветка частичного возврата сохранена: она отрабатывает прощённые и
 * пересчитанные суммы, и молчаливо ронять её ради текущего процента нельзя.
 */
export async function chargeCancellationPenalty(
  bookingId: string,
  penaltyKopecks: number,
): Promise<{ status: "charged" | "refund_issued" | "retained" | "noop" }> {
  if (penaltyKopecks <= 0) return { status: "noop" };
  const payment = await db.payment.findUnique({
    where: { bookingId },
    select: { externalId: true, status: true, amountKopecks: true },
  });
  if (!payment?.externalId) return { status: "noop" };

  if (payment.status === "PAID") {
    const refundKopecks = Math.max(0, payment.amountKopecks - penaltyKopecks);
    // Возвращать нечего — деньги удержаны целиком. Отдельный статус, а не
    // «refund_issued»: вызывающий код и логи не должны утверждать, что возврат
    // был, когда его не было.
    if (refundKopecks <= 0) return { status: "retained" };

    await createRefund({ paymentId: payment.externalId, amountKopecks: refundKopecks });
    await db.payment.update({
      where: { bookingId },
      data: { status: "REFUNDED", refundedAt: new Date() },
    }).catch(() => {});
    return { status: "refund_issued" };
  }

  const capped = Math.min(penaltyKopecks, payment.amountKopecks);
  await capturePayment(payment.externalId, capped);
  await db.payment.update({
    where: { bookingId },
    data: { status: "PAID", amountKopecks: capped },
  }).catch(() => {});
  return { status: "charged" };
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

/**
 * B425 — 24h dispute-window settlement. Captures still-held COMPLETED bookings
 * only after the client dispute window has elapsed and no open/reviewing
 * complaint exists. Idempotent — only PENDING payment rows are scanned.
 */
export async function captureGraceExpiredSessions(
  now: Date = new Date(),
  graceHours = 24,
): Promise<{ scanned: number; captured: number }> {
  const cutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);
  const due = await db.booking.findMany({
    where: {
      status: "COMPLETED",
      paymentId: { not: null },
      endedAt: { lte: cutoff },
      payment: { status: "PENDING" },
      complaints: { none: { status: { in: ["OPEN", "REVIEWING"] } } },
    },
    select: { id: true },
    take: 500,
  });

  let captured = 0;
  for (const booking of due) {
    const outcome = await settleSessionAfterDisputeWindow(booking.id).catch((err) => {
      log.warn("session-payment.grace_capture_failed", { bookingId: booking.id, err });
      return null;
    });
    if (outcome?.status === "charged") captured++;
  }
  return { scanned: due.length, captured };
}

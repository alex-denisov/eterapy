/**
 * B529 — обработка платёжных обновлений Telegram в вебхуке бота.
 *
 * Два события, и они принципиально разные по цене ошибки:
 *
 * 1. `pre_checkout_query` — последняя точка, где от платежа можно ОТКАЗАТЬСЯ
 *    бесплатно. Ответить обязаны за 10 секунд, иначе платёж падает у покупателя.
 * 2. `successful_payment` — звёзды УЖЕ списаны. Здесь нельзя «не начислить»:
 *    любая наша ошибка означает, что человек заплатил и не получил. Поэтому
 *    зачисление идёт тем же `creditSucceededPayment()`, что и остальные рельсы,
 *    а несовпадения логируются как инцидент, а не отбрасываются молча.
 */
import db from "@/lib/db";
import { creditSucceededPayment } from "@/lib/billing-credit";
import { log, serializeError } from "@/lib/logger";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "@/lib/webhook-idempotency";
import { buildStarsPayload, parseStarsPayload, verifyStarsCharge } from "./telegram-stars";
import { answerStarsPreCheckout } from "./telegram-stars-server";

export type TelegramPreCheckoutQuery = {
  id: string;
  from?: { id?: number };
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
};

export type TelegramSuccessfulPayment = {
  currency?: string;
  total_amount?: number;
  invoice_payload?: string;
  telegram_payment_charge_id?: string;
  provider_payment_charge_id?: string;
};

/** Сверяет счёт и отвечает Telegram. Возвращает исход для журнала вебхука. */
export async function handleStarsPreCheckout(query: TelegramPreCheckoutQuery): Promise<string> {
  const invoiceId = parseStarsPayload(query.invoice_payload);
  if (invoiceId === null) {
    await answerStarsPreCheckout({ queryId: query.id, ok: false, errorMessage: "Счёт не распознан. Откройте оплату заново." });
    log.warn("stars-precheckout-bad-payload", { payload: query.invoice_payload });
    return "precheckout:bad-payload";
  }

  const transaction = await db.transaction.findUnique({
    where: { invoiceId },
    select: { invoiceId: true, status: true, currency: true, userId: true, metadata: true },
  });

  const verdict = verifyStarsCharge({
    transaction: transaction
      ? { ...transaction, metadata: (transaction.metadata ?? null) as Record<string, unknown> | null }
      : null,
    chargedStars: Number(query.total_amount ?? 0),
  });

  if (!verdict.ok) {
    await answerStarsPreCheckout({ queryId: query.id, ok: false, errorMessage: verdict.reason });
    log.warn("stars-precheckout-declined", { invoiceId, reason: verdict.reason });
    return `precheckout:declined`;
  }

  await answerStarsPreCheckout({ queryId: query.id, ok: true });
  log.info("stars-precheckout-approved", { invoiceId });
  return "precheckout:approved";
}

/**
 * Зачисление после списания звёзд.
 *
 * Идемпотентность двойная: `claimWebhookEvent` отсекает повтор доставки, а
 * `creditSucceededPayment` не начисляет по транзакции, которая уже не PENDING.
 */
export async function handleStarsSuccessfulPayment({ payment, requestId }: {
  payment: TelegramSuccessfulPayment;
  requestId?: string;
}): Promise<string> {
  const invoiceId = parseStarsPayload(payment.invoice_payload);
  if (invoiceId === null) {
    // Деньги списаны, а счёт не наш или испорчен — это инцидент, а не шум.
    log.error("stars-payment-unknown-payload", { requestId, payload: payment.invoice_payload });
    return "payment:bad-payload";
  }

  const claim = await claimWebhookEvent({
    provider: "telegram_stars",
    eventId: `payment:${invoiceId}`,
    eventType: "payment.successful",
    resourceId: String(invoiceId),
    payload: {
      invoiceId,
      currency: payment.currency ?? null,
      totalAmount: payment.total_amount ?? null,
      telegramChargeId: payment.telegram_payment_charge_id ?? null,
    },
    requestId,
  });
  if (!claim.claimed || !claim.event) return "payment:duplicate";

  try {
    // Идентификатор списания нужен для возврата: без него refundStarPayment
    // вызвать нечем. Пишем ДО начисления — если упадёт зачисление, возврат
    // всё равно останется возможен.
    if (payment.telegram_payment_charge_id) {
      const existing = await db.transaction.findUnique({ where: { invoiceId }, select: { metadata: true } });
      const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;
      await db.transaction.update({
        where: { invoiceId },
        data: {
          metadata: {
            ...metadata,
            telegramChargeId: payment.telegram_payment_charge_id,
            starsCharged: payment.total_amount ?? null,
          },
        },
      });
    }

    const applied = await creditSucceededPayment(buildStarsPayload(invoiceId));
    await completeWebhookEvent(claim.event.id, { result: applied ? "credited" : "noop" });
    log.info("stars-payment-applied", { requestId, invoiceId, result: applied ? "credited" : "noop" });
    return applied ? "payment:credited" : "payment:noop";
  } catch (err) {
    await failWebhookEvent(claim.event.id, err).catch((updateErr) => {
      log.error("stars-payment-fail-update-failed", { requestId, invoiceId, error: serializeError(updateErr) });
    });
    // Звёзды списаны, выдача не прошла — громко, чтобы владелец узнал из
    // мониторинга, а не из обращения пользователя.
    log.error("stars-payment-credit-failed", { requestId, invoiceId, error: serializeError(err) });
    throw err;
  }
}

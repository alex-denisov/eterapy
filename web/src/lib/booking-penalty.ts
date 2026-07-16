/**
 * B481 — распределение штрафа за позднюю отмену клиентом.
 *
 * Политика (legal-pack, Документ 1 §7.5 и Документ 12): удержание до 50%
 * стоимости сессии за отмену <24ч; «удержанная сумма распределяется между
 * специалистом и платформой на общих условиях (вознаграждение специалиста и
 * комиссия платформы)». Т.е. штраф проходит ту же комиссионную матрицу, что и
 * обычная сессия: практик получает (штраф × (1 − комиссия%)), платформа —
 * комиссию. Размер — lateCancelPenaltyPercent (дефолт 50, env
 * BOOKING_LATE_CANCEL_PENALTY_PERCENT).
 *
 * Функция вызывается ПОСЛЕ approve-CANCEL: захватывает штраф у клиента
 * (частичный capture / refund остатка), затем пишет расходную Transaction
 * клиенту и Payout-долю практику. Обе записи идемпотентны по bookingId
 * (metadata.purchaseKind / holdReason-маркер).
 */
import db from "./db";
import { log } from "./logger";
import { notify } from "./notifications";
import { paymentDocumentVersionData } from "./billing-policy";
import { chargeCancellationPenalty } from "./session-payment";
import { resolvePractitionerPayoutPlanKey, payoutAvailableAt, PAYOUT_HOLD_DAYS_BY_PLAN } from "./payout-runs";

export const PENALTY_TRANSACTION_KIND = "late_cancel_penalty";
/** Маркер penalty-доли в Payout.holdReason — и причина, и идемпотентный ключ. */
export const PENALTY_PAYOUT_HOLD_REASON = "late_cancel_penalty_share";

/** Чистая математика доли практика — юнит-тестируемо. */
export function penaltyPractitionerShareKopecks(penaltyKopecks: number, commissionPercent: number): number {
  const percent = Number.isFinite(commissionPercent)
    ? Math.min(100, Math.max(0, commissionPercent))
    : 35;
  return Math.max(0, Math.round(penaltyKopecks * (1 - percent / 100)));
}

export type PenaltySettlementResult =
  | { status: "settled"; penaltyKopecks: number; practitionerShareKopecks: number }
  | { status: "noop" };

/**
 * Списывает штраф и раскладывает деньги: Transaction клиенту (аудит списания)
 * + Payout-доля практику по комиссионной матрице.
 */
export async function settleLateCancelPenalty(
  bookingId: string,
  penaltyKopecks: number,
): Promise<PenaltySettlementResult> {
  if (penaltyKopecks <= 0) return { status: "noop" };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientId: true,
      priceRub: true,
      commissionPercentApplied: true,
      payment: { select: { externalId: true } },
      practitioner: { select: { id: true, userId: true, commissionPercent: true } },
    },
  });
  if (!booking) return { status: "noop" };

  const charge = await chargeCancellationPenalty(bookingId, penaltyKopecks);
  if (charge.status === "noop") return { status: "noop" };

  const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
  const practitionerShareKopecks = penaltyPractitionerShareKopecks(penaltyKopecks, commissionPercent);
  const documentVersions = paymentDocumentVersionData();

  // Идемпотентность: одна penalty-транзакция и один penalty-payout на бронь.
  const [existingTransaction, existingPayout] = await Promise.all([
    db.transaction.findFirst({
      where: {
        userId: booking.clientId,
        metadata: { path: ["purchaseKind"], equals: PENALTY_TRANSACTION_KIND },
        AND: [{ metadata: { path: ["bookingId"], equals: bookingId } }],
      },
      select: { id: true },
    }),
    db.payout.findFirst({
      where: { bookingId, holdReason: PENALTY_PAYOUT_HOLD_REASON },
      select: { id: true },
    }),
  ]);

  const now = new Date();
  const planKey = await resolvePractitionerPayoutPlanKey(booking.practitioner.userId, db, now);

  await db.$transaction(async (tx) => {
    if (!existingTransaction) {
      await tx.transaction.create({
        data: {
          userId: booking.clientId,
          amount: -penaltyKopecks,
          currency: "RUB",
          status: "SUCCEEDED",
          provider: "yukassa",
          // providerPaymentId @unique — не занимаем id платежа, чтобы не
          // конфликтовать с транзакцией capture; он остаётся в metadata.
          providerPaymentId: null,
          description: `Удержание за позднюю отмену сессии ${bookingId}`,
          offerVersion: documentVersions.offerVersion,
          termsVersion: documentVersions.termsVersion,
          consentVersion: documentVersions.consentVersion,
          metadata: {
            purchaseKind: PENALTY_TRANSACTION_KIND,
            bookingId,
            penaltyKopecks,
            providerPaymentId: booking.payment?.externalId ?? null,
            currency: "RUB",
            ...documentVersions,
          },
        },
      });
    }
    if (!existingPayout && practitionerShareKopecks > 0) {
      await tx.payout.create({
        data: {
          practitionerId: booking.practitioner.id,
          bookingId,
          amountKopecks: practitionerShareKopecks,
          status: "PENDING",
          initiatedBy: booking.clientId,
          availableAt: payoutAvailableAt(planKey, now),
          holdReason: PENALTY_PAYOUT_HOLD_REASON,
          holdDays: PAYOUT_HOLD_DAYS_BY_PLAN[planKey],
          planKeyAtPayout: planKey,
          reserveKopecks: 0,
        },
      });
    }
  });

  if (practitionerShareKopecks > 0) {
    notify({
      userId: booking.practitioner.userId,
      event: "PAYMENT_RECEIVED",
      data: {
        amountRub: Math.round(practitionerShareKopecks / 100).toLocaleString("ru-RU"),
        date: now.toLocaleDateString("ru-RU"),
      },
      dedupeKey: `penalty-share:${bookingId}`,
    }).catch((e: unknown) => log.warn("booking-penalty.notify_failed", { bookingId, err: e }));
  }

  return { status: "settled", penaltyKopecks, practitionerShareKopecks };
}

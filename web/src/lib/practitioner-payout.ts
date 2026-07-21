/**
 * B352 / Баг 12 — исполнение выплаты практику через ЮKassa Payouts API.
 *
 * Раньше «Выплатить» только создавал запись Payout(PENDING) — деньги не двигались.
 * Теперь выплата реально отправляется в ЮKassa (тест-кабинет) по реквизитам
 * практика. Идемпотентность — по `Payout.id` (см. createPayout).
 *
 * Поддержка реквизитов: CARD (банковская карта) — авто-выплата. СБП/юр-лицо
 * требуют дополнительных данных (member-id СБП / b2b-договор) → пока вручную.
 */
import db from "./db";
import { log } from "./logger";
import { createPayout, type YukassaPayoutDestination } from "./yukassa";
import type { PayoutDetailsInput, PayoutProvider, SendPayoutResult } from "./payments/payout-provider";

export function payoutDestinationFromDetails(d: {
  type: string;
  accountNumber: string;
}): YukassaPayoutDestination | null {
  if (d.type === "CARD") return { type: "bank_card", cardNumber: d.accountNumber };
  // SBP requires a YooKassa member bank_id (not the stored BIK); ENTITY is a b2b
  // contract flow — both are executed manually for now.
  return null;
}

/** Тип переехал в провайдерный слой; реэкспорт — чтобы не трогать вызывающих. */
export type { SendPayoutResult };

/** Sends a payout for an already-created Payout(PENDING) record and updates its
 *  status from the provider response. Never throws — on any error the payout is
 *  marked FAILED (so the practitioner's balance is restored, see balance lib). */
export async function sendPractitionerPayout(
  payoutId: string,
  destination: YukassaPayoutDestination,
  amountKopecks: number,
  description?: string,
): Promise<SendPayoutResult> {
  try {
    const payout = await createPayout({ amountKopecks, payoutId, destination, description });
    if (payout.status === "canceled") {
      await db.payout.update({ where: { id: payoutId }, data: { status: "FAILED", externalId: payout.id } }).catch(() => {});
      return { status: "FAILED", externalId: payout.id, error: "ЮKassa отклонила выплату" };
    }
    const status = payout.status === "succeeded" ? "DONE" : "PROCESSING";
    await db.payout.update({
      where: { id: payoutId },
      data: { status, externalId: payout.id, processedAt: new Date() },
    });
    return { status, externalId: payout.id };
  } catch (e) {
    log.error("practitioner-payout.send_failed", { payoutId, err: e });
    await db.payout.update({ where: { id: payoutId }, data: { status: "FAILED" } }).catch(() => {});
    return { status: "FAILED", error: e instanceof Error ? e.message : "Ошибка провайдера выплат" };
  }
}

/**
 * B562 — тот же код за общим интерфейсом. Поведение ЮKassa-пути не изменилось:
 * это ровно обёртка над двумя функциями выше, чтобы вызывающий выбирал
 * провайдера, а не импортировал конкретного.
 */
export const yukassaPayoutProvider: PayoutProvider = {
  name: "yookassa",
  supportsAutoPayout: (details: PayoutDetailsInput) => payoutDestinationFromDetails(details) !== null,
  send: async ({ payoutId, details, amountKopecks, description }) => {
    const destination = payoutDestinationFromDetails(details);
    if (!destination) {
      // Досюда доходить не должно — маршрут спрашивает `supportsAutoPayout`
      // заранее. Но если дошло, лучше честный FAILED, чем брошенное исключение
      // над уже созданной записью Payout.
      return {
        status: "FAILED",
        error: "Авто-выплата поддерживает только банковскую карту. СБП/юр-лицо — вручную.",
      };
    }
    return sendPractitionerPayout(payoutId, destination, amountKopecks, description);
  },
};

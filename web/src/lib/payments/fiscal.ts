/**
 * Признаки расчёта для кассового чека (54-ФЗ, ФФД 1.2) — ОДНО место на все
 * платёжные рельсы.
 *
 * Owner-решение 2026-07-22, закрывает развилку B567: «платеж за сессии будет
 * как "предоплата 100%" … Баллы и подписки проводятся как полная оплата».
 *
 * ПОЧЕМУ отдельный модуль, а не строка в checkout.ts. Признак расчёта живёт
 * дольше, чем рельс: Robokassa, ЮKassa и будущий сессионный рельс обязаны
 * классифицировать одну и ту же продажу одинаково. Разъехавшись, они дадут два
 * разных чека на одну и ту же услугу — а чек фискальный документ, а не отчёт.
 *
 * ПОЧЕМУ баллы — полная оплата, а не аванс. Признак `advance` порождает
 * обязанность пробить ВТОРОЙ чек в момент, когда балл потрачен на услугу. У нас
 * его нечем посчитать: реестр баллов сливает лоты по `(source, expiresAt)` и
 * теряет связь с конкретной покупкой (разбор в work-log B567). Полная оплата
 * второго чека не требует: доступ к услугам выдаётся В МОМЕНТ зачисления
 * баллов, то есть услуга оказана сразу — ровно то, что уже написано в оферте
 * (§5.8: «доступ предоставляется в момент зачисления баллов»).
 *
 * ПОЧЕМУ сессия — предоплата, хотя баллы нет. Деньги вносятся до встречи, но
 * сумма ИЗВЕСТНА заранее (цена сессии) и относится к одной определённой услуге.
 * Закрывающий чек здесь исполним, в отличие от баллов; см.
 * `requiresClosingReceipt`.
 */

/** Что именно продаётся. Совпадает с `BillingPurchaseKind` + сессия. */
export type FiscalSettlementSubject =
  | "product"
  | "subscription"
  | "credits"
  | "practitioner_ai_topup"
  | "session";

export const FISCAL_SETTLEMENT_SUBJECTS: readonly FiscalSettlementSubject[] = [
  "product",
  "subscription",
  "credits",
  "practitioner_ai_topup",
  "session",
];

export interface FiscalSettlement {
  /** Предмет расчёта — всё, что мы продаём, является услугой. */
  paymentObject: "service";
  /** Признак способа расчёта по ФФД 1.2. */
  paymentMethod: "full_payment" | "full_prepayment";
}

const FULL_PAYMENT: FiscalSettlement = { paymentObject: "service", paymentMethod: "full_payment" };
const FULL_PREPAYMENT: FiscalSettlement = { paymentObject: "service", paymentMethod: "full_prepayment" };

/**
 * Признаки расчёта для чека. Возвращает новый объект: константы выше не должны
 * утечь наружу изменяемой ссылкой.
 */
export function fiscalSettlementFor(subject: FiscalSettlementSubject): FiscalSettlement {
  return { ...(subject === "session" ? FULL_PREPAYMENT : FULL_PAYMENT) };
}

/**
 * Порождает ли продажа обязанность пробить закрывающий чек в момент оказания
 * услуги. Верно только для предоплаты.
 *
 * ⚠ Сессионный рельс на кассе ещё не построен (B425/B535 ждут продуктового
 * решения по hold/capture). Когда он появится, закрывающий чек — часть его
 * контракта, а не отдельная задача: обязанность возникает вместе с первым
 * чеком, а не позже.
 */
export function requiresClosingReceipt(subject: FiscalSettlementSubject): boolean {
  return fiscalSettlementFor(subject).paymentMethod === "full_prepayment";
}

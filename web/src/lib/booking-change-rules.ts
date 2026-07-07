// B481/B484 — правила переноса/отмены подтверждённой сессии. Pure + time-
// injected (unit-tested).
//
// Owner-решения (B466 brainstorm, 2026-07-05/06):
//  • Клиент просит перенос/отмену → практик согласовывает. Отмена клиентом
//    МЕНЕЕ чем за 24 часа — со штрафом, который практик может простить
//    («Без штрафа»). Перенос за сутки — бесплатен (FAQ-политика).
//  • Практик предлагает перенос → клиент подтверждает (уведомление).
//  • B484: отмена ПРАКТИКОМ — клиенту всегда полный возврат; денежного штрафа
//    для практика нет (санкции = метрика надёжности/приоритет каталога).
//
// ⚠ Размер штрафа за позднюю отмену клиентом НЕ зафиксирован owner'ом —
// предложенный дефолт 50% (конфиг BOOKING_LATE_CANCEL_PENALTY_PERCENT),
// ждёт sign-off в B481.

export const LATE_CHANGE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_LATE_CANCEL_PENALTY_PERCENT = 50;

export type ChangeRequestType = "RESCHEDULE" | "CANCEL";
export type ChangeInitiator = "CLIENT" | "PRACTITIONER";

export function lateCancelPenaltyPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.BOOKING_LATE_CANCEL_PENALTY_PERCENT);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return Math.round(raw);
  return DEFAULT_LATE_CANCEL_PENALTY_PERCENT;
}

/** Меньше 24 часов до начала сессии? */
export function isLateChange(slotStartAt: Date, now: Date = new Date()): boolean {
  return slotStartAt.getTime() - now.getTime() < LATE_CHANGE_THRESHOLD_MS;
}

/**
 * Применяется ли штраф к запросу. Только клиентская ОТМЕНА <24ч до начала.
 * Перенос — бесплатен («перенос за сутки бесплатен»; поздний перенос практик
 * может отклонить, но штрафа за него нет). Запросы практика — без штрафа
 * клиенту (B484).
 */
export function penaltyAppliesFor({
  initiatedBy,
  type,
  slotStartAt,
  now = new Date(),
}: {
  initiatedBy: ChangeInitiator;
  type: ChangeRequestType;
  slotStartAt: Date | null;
  now?: Date;
}): boolean {
  if (initiatedBy !== "CLIENT" || type !== "CANCEL") return false;
  if (!slotStartAt) return false;
  return isLateChange(slotStartAt, now);
}

/** Копейки штрафа от цены сессии. */
export function penaltyKopecks(priceRub: number, env: NodeJS.ProcessEnv = process.env): number {
  return Math.round(priceRub * 100 * (lateCancelPenaltyPercent(env) / 100));
}

/**
 * Кто согласовывает запрос: всегда противоположная сторона.
 * CLIENT-запрос → PRACTITIONER решает (может простить штраф);
 * PRACTITIONER-перенос → CLIENT подтверждает.
 */
export function resolverFor(initiatedBy: ChangeInitiator): ChangeInitiator {
  return initiatedBy === "CLIENT" ? "PRACTITIONER" : "CLIENT";
}

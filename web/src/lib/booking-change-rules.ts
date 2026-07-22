// B481/B484 — правила переноса/отмены подтверждённой сессии. Pure + time-
// injected (unit-tested).
//
// Owner-решения (B466 brainstorm, 2026-07-05/06):
//  • Клиент просит перенос/отмену → практик согласовывает. Перенос за сутки —
//    бесплатен (FAQ-политика).
//  • Практик предлагает перенос → клиент подтверждает (уведомление).
//  • B484: отмена ПРАКТИКОМ — клиенту всегда полный возврат; денежного штрафа
//    для практика нет (санкции = метрика надёжности/приоритет каталога).
//
// Owner-решение 2026-07-22 (B567), дословно: «у нас нет частичного возврата за
// неявку клиента или позднюю отмену (позднее чем за 24 часа до начала сессии),
// возврат только при неявке специалиста».
//
// Отсюда 100%, а не «дефолт со ставкой в окружении». Прежний конфиг
// BOOKING_LATE_CANCEL_PENALTY_PERCENT снят намеренно: значение на хосте,
// делающее возврат частичным, разошлось бы с текстом оферты, который клиент
// принял, — и разошлось бы молча (готча B566: конфигурация мимо выкатки).
// Практик по-прежнему может отменить удержание ЦЕЛИКОМ («без штрафа») — это
// полный возврат, а не частичный, и правилу не противоречит.

export const LATE_CHANGE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Доля цены сессии, удерживаемая при поздней отмене или неявке клиента. */
export const LATE_CANCEL_RETENTION_PERCENT = 100;

export type ChangeRequestType = "RESCHEDULE" | "CANCEL";
export type ChangeInitiator = "CLIENT" | "PRACTITIONER";

/** Меньше 24 часов до начала сессии? */
export function isLateChange(slotStartAt: Date, now: Date = new Date()): boolean {
  return slotStartAt.getTime() - now.getTime() < LATE_CHANGE_THRESHOLD_MS;
}

/**
 * Применяется ли удержание к запросу. Только клиентская ОТМЕНА <24ч до начала.
 * Перенос — бесплатен («перенос за сутки бесплатен»; поздний перенос практик
 * может отклонить, но удержания за него нет). Запросы практика — без удержания
 * с клиента (B484).
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

/** Копейки удержания от цены сессии. */
export function penaltyKopecks(priceRub: number): number {
  return Math.round(priceRub * 100 * (LATE_CANCEL_RETENTION_PERCENT / 100));
}

/**
 * Кто согласовывает запрос: всегда противоположная сторона.
 * CLIENT-запрос → PRACTITIONER решает (может простить штраф);
 * PRACTITIONER-перенос → CLIENT подтверждает.
 */
export function resolverFor(initiatedBy: ChangeInitiator): ChangeInitiator {
  return initiatedBy === "CLIENT" ? "PRACTITIONER" : "CLIENT";
}

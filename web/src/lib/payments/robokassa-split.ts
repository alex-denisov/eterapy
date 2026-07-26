/**
 * B583 — модель выплат специалисту под ограничения Robokassa.
 *
 * Что сообщила Robokassa (владелец, 2026-07-26):
 *   1. Механизма ОТЛОЖЕННОЙ выплаты нет. Есть только холдирование платежа
 *      клиента.
 *   2. Сплитовать можно ТОЛЬКО на аккаунт Robokassa получателя. Значит
 *      специалист обязан завести аккаунт Robokassa и указать его у нас.
 *
 * Что из этого следует для нашей модели.
 *
 * Сейчас деньги клиента приходят платформе целиком, доля специалиста живёт
 * записью `Payout` и уходит отдельным переводом в календарный день (1-е и
 * 15-е, `payout-schedule.ts`), а до этого дня её удерживает `availableAt`:
 * окно диспута и `holdDays` по тарифу. То есть риск возврата платформа несёт
 * ЧУЖИМИ деньгами — долей специалиста, которая ещё у неё.
 *
 * В сплит-модели так нельзя: сплит происходит В МОМЕНТ снятия холда, и после
 * него доля специалиста уже не у платформы. Поэтому удержание переезжает
 * ВПЕРЁД — на холд клиентского платежа, — а выплата после снятия холда
 * становится безусловной. Это и есть решение владельца.
 *
 * ⚠ Чем за это платим — прямо, чтобы решение принималось с открытыми глазами:
 *
 *   • Потолок холда Robokassa — 7 суток (B425). Бронь дальше недели холдом не
 *     покрывается: к моменту сессии холд истечёт. Значит модель полностью
 *     закрывает только сессии, назначенные в пределах недели от оплаты.
 *   • После сплита возврат клиенту платформа делает СВОИМИ деньгами: доли
 *     специалиста у неё больше нет. Сегодня это покрывалось резервом
 *     (`reserveKopecks`) и окном диспута; в сплит-модели резерв удержать не
 *     из чего.
 *   • `holdDays` по тарифу теряют смысл: удержание больше не наше, а
 *     провайдерское, и его длина — не наша настройка.
 *
 * Поэтому здесь описана ГОТОВНОСТЬ к сплиту и правило удержания, но само
 * движение денег по-прежнему не реализовано: контракта API выплат/сплита у
 * агента нет (B562, шаг 2). Провайдер выплат продолжает падать закрыто.
 */

/** Потолок холдирования у Robokassa. Дальше холд снимается сам. */
export const ROBOKASSA_HOLD_MAX_DAYS = 7;

export interface SplitReadinessInput {
  /** Идентификатор аккаунта Robokassa специалиста. */
  robokassaAccount?: string | null;
  /** Налоговый статус подтверждён — без него нельзя пробить чек и отчитаться. */
  taxVerified: boolean;
  /** Профиль специалиста активен (не на модерации, не заблокирован). */
  practitionerActive: boolean;
}

export type SplitReadinessReason =
  | "no_robokassa_account"
  | "tax_not_verified"
  | "practitioner_inactive";

export interface SplitReadiness {
  ready: boolean;
  reasons: SplitReadinessReason[];
}

export const SPLIT_READINESS_LABELS: Record<SplitReadinessReason, string> = {
  no_robokassa_account: "Не указан аккаунт Robokassa — сплит адресовать некуда",
  tax_not_verified: "Налоговый статус не подтверждён",
  practitioner_inactive: "Профиль специалиста неактивен",
};

/**
 * Нормализация идентификатора аккаунта Robokassa.
 *
 * Точный формат в контракте не зафиксирован, поэтому проверка НАМЕРЕННО
 * консервативная: убираем пробелы и регистр, требуем непустую строку из
 * латиницы/цифр/`-`/`_`/`.` длиной 3–64. Придумывать более строгий формат по
 * догадке нельзя — отвергнутый валидный аккаунт стоит специалисту выплаты.
 */
export function normalizeRobokassaAccount(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(trimmed)) return null;
  return trimmed;
}

export function evaluateSplitReadiness(input: SplitReadinessInput): SplitReadiness {
  const reasons: SplitReadinessReason[] = [];
  if (!normalizeRobokassaAccount(input.robokassaAccount)) reasons.push("no_robokassa_account");
  if (!input.taxVerified) reasons.push("tax_not_verified");
  if (!input.practitionerActive) reasons.push("practitioner_inactive");
  return { ready: reasons.length === 0, reasons };
}

/**
 * Покрывается ли бронь холдом клиентского платежа.
 *
 * Это тот самый разрыв, из-за которого сплит-модель не закрывает всё: при
 * оплате сильно заранее холд истечёт раньше сессии, и к моменту снятия
 * холдировать будет нечего. Такие брони обязаны идти прежним путём (полная
 * оплата вперёд + выплата записью `Payout`), а не молча проваливаться.
 */
export function holdCoversBooking(paidAt: Date, sessionStartsAt: Date): boolean {
  const days = (sessionStartsAt.getTime() - paidAt.getTime()) / 86_400_000;
  return days >= 0 && days <= ROBOKASSA_HOLD_MAX_DAYS;
}

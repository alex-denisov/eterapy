/**
 * B586 — имена событий, через которые клиентский код разговаривает с внешними
 * счётчиками. Отдельный модуль, потому что их слушает `components/analytics.tsx`,
 * а отправляют страницы: строковый литерал в двух местах уже однажды разъехался.
 *
 * Почему не звать `window.ym` напрямую: счётчик поднимается только после
 * согласия на cookies, то есть на большинстве загрузок его нет вовсе. Событие
 * дешевле проверки — если слушателя нет, оно просто никуда не приходит.
 */

/** Продуктовое событие для внешних счётчиков (Метрика: `reachGoal`). */
export const ANALYTICS_EVENT = "eterapy:analytics";

/** Кто это — внутренний id пользователя (Метрика: `setUserID`). */
export const ANALYTICS_IDENTIFY_EVENT = "eterapy:analytics-identify";

/**
 * Цель «регистрация завершена». Тот же идентификатор заведён целью в Метрике
 * (JavaScript-событие `signup`): без цели `reachGoal` уходит в пустоту, а
 * регистрация не видна в отчётах вовсе — ровно это и наблюдал владелец.
 */
export const SIGNUP_GOAL = "signup";

export function reportAnalyticsGoal(goal: string, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANALYTICS_EVENT, { detail: { event: goal, ...params } }));
}

/**
 * Ключ, под которым личность лежит на `window`.
 *
 * ⚠ Событие само по себе НЕ работает, и это проверено на живом проде: эффекты
 * React выполняются снизу вверх, поэтому `<AnalyticsIdentity>` (ребёнок) успевает
 * отправить событие ДО того, как счётчик (родитель в корневом layout) подпишется
 * на него. Слушателя нет — событие уходит в пустоту, и `setUserID` не вызывается
 * никогда. Первая версия этой правки именно так и не работала.
 *
 * Поэтому личность не только объявляется событием, но и КЛАДЁТСЯ на `window`:
 * событие — для того, кто уже слушает, значение — для того, кто подпишется позже
 * или дождётся согласия на cookies.
 */
export const ANALYTICS_USER_ID_KEY = "__eterapyAnalyticsUserId";

/**
 * Сообщить счётчику, какой это пользователь. Уходит только наш внутренний
 * идентификатор (cuid) — ни почты, ни имени: он нужен, чтобы найти в Метрике
 * сессии конкретного человека, и сам по себе о нём ничего не говорит.
 */
export function identifyAnalyticsUser(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  (window as unknown as Record<string, string>)[ANALYTICS_USER_ID_KEY] = userId;
  window.dispatchEvent(new CustomEvent(ANALYTICS_IDENTIFY_EVENT, { detail: { userId } }));
}

/** Личность, объявленная страницей, независимо от порядка подписки. */
export function readAnalyticsUserId(): string | null {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as Record<string, unknown>)[ANALYTICS_USER_ID_KEY];
  return typeof value === "string" && value ? value : null;
}

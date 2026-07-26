"use client";

import { useEffect } from "react";
import { identifyAnalyticsUser } from "@/lib/analytics-events";

/**
 * B586 — сообщает внешнему счётчику, чья это сессия.
 *
 * Владелец: «есть новый пользователь и даже регистрация от него, но нет ничего
 * по нему в метрике». Визиты были — не было связи визита с человеком: Метрика
 * без `setUserID` знает только браузер. Компонент рендерится там, где сессия
 * уже известна серверу (кабинет), и уходит только внутренний cuid — ни почты,
 * ни имени. Если счётчик ещё не поднят (согласие не дано), событие никуда не
 * приходит и повторяется само, когда согласие появится.
 */
export function AnalyticsIdentity({ userId }: { userId: string }) {
  useEffect(() => {
    identifyAnalyticsUser(userId);
  }, [userId]);
  return null;
}

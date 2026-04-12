/**
 * Система уведомлений — Email + Telegram
 * Читает NotificationPreference пользователя перед отправкой.
 */
import db from "@/lib/db";
import { sendEmail } from "@/lib/email-send";
import { sendTelegram } from "@/lib/telegram";

export type NotifEvent =
  | "BOOKING_REQUESTED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REMINDER"
  | "SESSION_STARTED"
  | "SESSION_COMPLETED"
  | "REVIEW_REQUESTED"
  | "NEW_REVIEW"
  | "PAYMENT_RECEIVED";

export interface NotifPayload {
  userId: string;
  event: NotifEvent;
  /** Переменные для шаблона */
  data: Record<string, string>;
}

/** Проверяет, включён ли канал для пользователя */
async function isEnabled(userId: string, event: NotifEvent, channel: "EMAIL" | "TELEGRAM"): Promise<boolean> {
  // Если пользователь ещё не настроил, используем дефолт
  const pref = await db.notificationPreference.findUnique({
    where: { userId_event_channel: { userId, event, channel } },
  });
  if (!pref) return channel === "EMAIL"; // Email включён по умолчанию, Telegram — нет
  return pref.enabled;
}

/** Отправляет уведомление через все включённые каналы */
export async function notify(payload: NotifPayload) {
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, name: true, telegramId: true },
  });
  if (!user || !user.email) return;

  const [emailEnabled, telegramEnabled] = await Promise.all([
    isEnabled(payload.userId, payload.event, "EMAIL"),
    isEnabled(payload.userId, payload.event, "TELEGRAM"),
  ]);

  const promises: Promise<void>[] = [];

  if (emailEnabled) {
    promises.push(
      sendEmail({
        to: user.email,
        event: payload.event,
        name: user.name,
        data: payload.data,
      }).catch(e => console.error("Email notify error:", e))
    );
  }

  if (telegramEnabled && user.telegramId) {
    const text = formatTelegramMessage(payload.event, user.name, payload.data);
    promises.push(
      sendTelegram(user.telegramId, text).catch(e => console.error("Telegram notify error:", e))
    );
  }

  await Promise.allSettled(promises);
}

/** Форматирует сообщение Telegram */
function formatTelegramMessage(event: NotifEvent, name: string, data: Record<string, string>): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  switch (event) {
    case "BOOKING_REQUESTED":
      return `📅 Новая запись\nКлиент ${data.clientName} хочет записаться на ${data.date} в ${data.time}.\n<a href="${baseUrl}/cabinet/practitioner/clients">Подтвердить →</a>`;
    case "BOOKING_CONFIRMED":
      return `✅ Запись подтверждена\nВаша сессия${data.clientName ? ` с ${data.clientName}` : ""} подтверждена на ${data.date} в ${data.time}.\n${data.sessionUrl ? `<a href="${data.sessionUrl}">Войти в видеочат →</a>` : `<a href="${baseUrl}/cabinet/bookings">Перейти к записям →</a>`}`;
    case "BOOKING_CANCELLED":
      return `❌ Запись отменена\nСессия на ${data.date} отменена${data.reason ? `: ${data.reason}` : ""}.`;
    case "BOOKING_REMINDER":
      return `⏰ Напоминание о сессии\nВаша сессия ${data.withName ? `с ${data.withName} ` : ""}начнётся ${data.in}.\n<a href="${baseUrl}/session/${data.bookingId}">Открыть видеочат →</a>`;
    case "SESSION_STARTED":
      return `🎥 Сессия началась\n<a href="${baseUrl}/session/${data.bookingId}">Войти в видеочат →</a>`;
    case "SESSION_COMPLETED":
      return `🏁 Сессия завершена\nСпасибо за сессию! ${data.reviewUrl ? `<a href="${data.reviewUrl}">Оставить отзыв →</a>` : ""}`;
    case "REVIEW_REQUESTED":
      return `⭐ Оставьте отзыв\nКак прошла сессия с ${data.practitionerName}?\n<a href="${data.reviewUrl}">Написать отзыв →</a>`;
    case "NEW_REVIEW":
      return `⭐ Новый отзыв\nКлиент ${data.clientName} оставил отзыв ${data.rating}/5.\n"${data.text}"`;
    case "PAYMENT_RECEIVED":
      return `💰 Платёж получен\n${data.amountRub} ₽ за сессию ${data.date}.`;
    default:
      return `ETerapy: уведомление`;
  }
}

/** Возвращает настройки уведомлений пользователя (для страницы настроек) */
export async function getUserNotificationPrefs(userId: string) {
  const prefs = await db.notificationPreference.findMany({ where: { userId } });
  return prefs;
}

/** Дефолтные настройки для нового пользователя */
export const DEFAULT_EMAIL_EVENTS: NotifEvent[] = [
  "BOOKING_REQUESTED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_REMINDER",
  "SESSION_COMPLETED",
  "REVIEW_REQUESTED",
];

export const DEFAULT_TELEGRAM_EVENTS: NotifEvent[] = [];

export const ALL_EVENTS: Array<{ event: NotifEvent; label: string; description: string }> = [
  { event: "BOOKING_REQUESTED", label: "Новая запись",         description: "Когда клиент запросил сессию" },
  { event: "BOOKING_CONFIRMED", label: "Запись подтверждена",  description: "Когда практик подтвердил вашу запись" },
  { event: "BOOKING_CANCELLED", label: "Запись отменена",      description: "Когда сессия была отменена" },
  { event: "BOOKING_REMINDER",  label: "Напоминание о сессии", description: "За N часов до начала сессии" },
  { event: "SESSION_STARTED",   label: "Сессия началась",      description: "Когда открыт видеочат" },
  { event: "SESSION_COMPLETED", label: "Сессия завершена",     description: "После окончания сессии" },
  { event: "REVIEW_REQUESTED",  label: "Просьба оставить отзыв", description: "После завершённой сессии" },
  { event: "NEW_REVIEW",        label: "Новый отзыв",          description: "Когда клиент оставил отзыв (для практика)" },
  { event: "PAYMENT_RECEIVED",  label: "Платёж получен",       description: "Подтверждение оплаты" },
];

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
  | "PAYMENT_RECEIVED"
  | "PAYOUT_SCHEDULED";

export interface NotifPayload {
  userId: string;
  event: NotifEvent;
  /** Переменные для шаблона */
  data: Record<string, string>;
}

/** Проверяет, включён ли канал для пользователя */
async function isEnabled(userId: string, event: NotifEvent, channel: "EMAIL" | "TELEGRAM" | "WEB"): Promise<boolean> {
  const pref = await db.notificationPreference.findUnique({
    where: { userId_event_channel: { userId, event, channel } },
  });
  // Дефолты: EMAIL on, WEB on (in-cabinet bell), TELEGRAM off.
  if (!pref) return channel !== "TELEGRAM";
  return pref.enabled;
}

/** Отправляет уведомление через все включённые каналы */
export async function notify(payload: NotifPayload) {
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { email: true, name: true, telegramId: true },
  });
  if (!user || !user.email) return;

  const [emailEnabled, telegramEnabled, webEnabled] = await Promise.all([
    isEnabled(payload.userId, payload.event, "EMAIL"),
    isEnabled(payload.userId, payload.event, "TELEGRAM"),
    isEnabled(payload.userId, payload.event, "WEB"),
  ]);

  const promises: Promise<unknown>[] = [];

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

  if (webEnabled) {
    const web = formatWebNotification(payload.event, payload.data);
    promises.push(
      db.notification.create({
        data: {
          userId: payload.userId,
          event: payload.event,
          title: web.title,
          body: web.body,
          href: web.href ?? null,
        },
      }).catch(e => console.error("Web notify persist error:", e))
    );
  }

  await Promise.allSettled(promises);
}

/** Формирует заголовок + подпись для дропдауна колокольчика */
function formatWebNotification(event: NotifEvent, data: Record<string, string>): { title: string; body: string; href?: string } {
  switch (event) {
    case "BOOKING_REQUESTED":
      return { title: "Новая запись", body: `${data.clientName} — ${data.date}, ${data.time}`, href: "/cabinet/practitioner/clients" };
    case "BOOKING_CONFIRMED":
      return { title: "Запись подтверждена", body: `${data.date} в ${data.time}`, href: data.sessionUrl ?? "/cabinet/bookings" };
    case "BOOKING_CANCELLED":
      return { title: "Запись отменена", body: `${data.date}${data.reason ? ` — ${data.reason}` : ""}`, href: "/cabinet/bookings" };
    case "BOOKING_REMINDER":
      return { title: "Напоминание о сессии", body: `Через ${data.in}`, href: data.bookingId ? `/session/${data.bookingId}` : "/cabinet/bookings" };
    case "SESSION_STARTED":
      return { title: "Сессия началась", body: "Видеочат открыт", href: data.bookingId ? `/session/${data.bookingId}` : undefined };
    case "SESSION_COMPLETED":
      return { title: "Сессия завершена", body: data.reviewUrl ? "Оставьте отзыв" : "Спасибо за сессию", href: data.reviewUrl };
    case "REVIEW_REQUESTED":
      return { title: "Оставьте отзыв", body: `Сессия с ${data.practitionerName}`, href: data.reviewUrl };
    case "NEW_REVIEW":
      return { title: "Новый отзыв", body: `${data.clientName}: ${data.rating}/5`, href: "/cabinet/practitioner/reviews" };
    case "PAYMENT_RECEIVED":
      return { title: "Платёж получен", body: `${data.amountRub} ₽ — ${data.date}`, href: "/cabinet/practitioner/earnings" };
    case "PAYOUT_SCHEDULED":
      return { title: "Запланированная выплата", body: `${data.date}: ${data.totalRub} ₽ (${data.practitionerCount})`, href: "/admin/payouts" };
    default:
      return { title: "Уведомление", body: "" };
  }
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
    case "PAYOUT_SCHEDULED":
      return `🏦 Запланированная выплата\n${data.date}: ${data.totalRub} ₽ для ${data.practitionerCount} практиков.`;
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

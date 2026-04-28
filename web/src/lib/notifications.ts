/**
 * Система уведомлений — Email + Telegram
 * Читает NotificationPreference пользователя перед отправкой.
 */
import db from "@/lib/db";
import { log } from "@/lib/logger";
import {
  logNotificationDeliveryQueueFailure,
  queueNotificationDelivery,
  type NotificationDeliveryChannel,
} from "@/lib/notification-delivery";

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
  | "PAYOUT_SCHEDULED"
  | "BALANCE_TOPUP"
  | "CARD_LINKED"
  | "CARD_REMOVED";

export interface NotifPayload {
  userId: string;
  event: NotifEvent;
  /** Переменные для шаблона */
  data: Record<string, string>;
  requestId?: string;
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
  if (!user || !user.email) {
    log.warn("notification-user-missing", {
      requestId: payload.requestId,
      event: payload.event,
      userId: payload.userId,
      hasUser: Boolean(user),
    });
    return;
  }

  const [emailEnabled, telegramEnabled, webEnabled] = await Promise.all([
    isEnabled(payload.userId, payload.event, "EMAIL"),
    isEnabled(payload.userId, payload.event, "TELEGRAM"),
    isEnabled(payload.userId, payload.event, "WEB"),
  ]);

  const channels: NotificationDeliveryChannel[] = [];
  if (emailEnabled) channels.push("EMAIL");
  if (telegramEnabled && user.telegramId) channels.push("TELEGRAM");
  if (webEnabled) channels.push("WEB");

  await Promise.all(channels.map(async (channel) => {
    const delivery = {
      userId: payload.userId,
      event: payload.event,
      channel,
      data: payload.data,
      recipient: {
        email: user.email,
        name: user.name,
        telegramId: user.telegramId,
      },
      requestId: payload.requestId,
    };

    try {
      await queueNotificationDelivery(delivery);
    } catch (err) {
      logNotificationDeliveryQueueFailure(delivery, err);
    }
  }));

  log.info("notification-deliveries-queued", {
    requestId: payload.requestId,
    event: payload.event,
    userId: payload.userId,
    channels: {
      email: emailEnabled,
      telegram: telegramEnabled && Boolean(user.telegramId),
      web: webEnabled,
    },
    queued: channels,
  });
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
  { event: "BALANCE_TOPUP",     label: "Пополнение баланса",   description: "Успешное пополнение кошелька" },
  { event: "CARD_LINKED",       label: "Карта привязана",      description: "Новая карта добавлена для быстрой оплаты" },
  { event: "CARD_REMOVED",      label: "Карта отвязана",       description: "Привязанная карта удалена" },
];

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
import type { NotifEvent } from "@/lib/notification-events";
import { getQuietHoursDelayMs, getUserQuietHours } from "@/lib/notification-preference-settings";

export { ALL_EVENTS, DEFAULT_EMAIL_EVENTS, type NotifEvent } from "@/lib/notification-events";

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
    select: { email: true, name: true, telegramId: true, timezone: true },
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
  const quietHours = await getUserQuietHours(payload.userId, user.timezone);
  const quietDelayMs = getQuietHoursDelayMs(quietHours);
  const runAfter = quietDelayMs > 0 ? new Date(Date.now() + quietDelayMs) : undefined;

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
      runAfter: channel === "WEB" ? undefined : runAfter,
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
    quietHours: {
      enabled: quietHours.enabled,
      delayedUntil: runAfter?.toISOString(),
    },
  });
}

/** Возвращает настройки уведомлений пользователя (для страницы настроек) */
export async function getUserNotificationPrefs(userId: string) {
  const prefs = await db.notificationPreference.findMany({ where: { userId } });
  return prefs;
}

export const DEFAULT_TELEGRAM_EVENTS: NotifEvent[] = [];

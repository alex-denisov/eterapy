/**
 * Список событий уведомлений — только статика, без серверных зависимостей.
 * Импортируется в клиентские компоненты.
 */

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

export const ALL_EVENTS: Array<{ event: NotifEvent; label: string; description: string }> = [
  { event: "BOOKING_REQUESTED", label: "Новая запись",             description: "Когда клиент запросил сессию (для практика)" },
  { event: "BOOKING_CONFIRMED", label: "Запись подтверждена",      description: "Когда практик подтвердил запись (для клиента)" },
  { event: "BOOKING_CANCELLED", label: "Запись отменена",          description: "Когда сессия была отменена любой стороной" },
  { event: "BOOKING_REMINDER",  label: "Напоминание о сессии",     description: "За N часов до начала сессии" },
  { event: "SESSION_STARTED",   label: "Сессия началась",          description: "Когда открыт видеочат" },
  { event: "SESSION_COMPLETED", label: "Сессия завершена",         description: "После окончания сессии" },
  { event: "REVIEW_REQUESTED",  label: "Просьба оставить отзыв",  description: "После завершённой сессии (для клиента)" },
  { event: "NEW_REVIEW",        label: "Новый отзыв",              description: "Когда клиент оставил отзыв (для практика)" },
  { event: "PAYMENT_RECEIVED",  label: "Платёж получен",           description: "Подтверждение оплаты" },
];

export const DEFAULT_EMAIL_EVENTS: NotifEvent[] = [
  "BOOKING_REQUESTED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_REMINDER",
  "SESSION_COMPLETED",
  "REVIEW_REQUESTED",
];

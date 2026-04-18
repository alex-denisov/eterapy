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
  | "PAYMENT_RECEIVED"
  | "PAYOUT_SCHEDULED"
  | "BALANCE_TOPUP"
  | "CARD_LINKED"
  | "CARD_REMOVED";

export type UserRole = "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN" | "MODERATOR";

export const ALL_EVENTS: Array<{
  event: NotifEvent;
  label: string;
  description: string;
  roles: UserRole[];
}> = [
  {
    event: "BOOKING_REQUESTED",
    label: "Новая запись",
    description: "Когда клиент запросил сессию",
    roles: ["PRACTITIONER"],
  },
  {
    event: "BOOKING_CONFIRMED",
    label: "Запись подтверждена",
    description: "Когда практик подтвердил запись",
    roles: ["CLIENT"],
  },
  {
    event: "BOOKING_CANCELLED",
    label: "Запись отменена",
    description: "Когда сессия была отменена любой стороной",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "BOOKING_REMINDER",
    label: "Напоминание о сессии",
    description: "До начала сессии",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SESSION_STARTED",
    label: "Сессия началась",
    description: "Когда открыт видеочат",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SESSION_COMPLETED",
    label: "Сессия завершена",
    description: "После окончания сессии",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "REVIEW_REQUESTED",
    label: "Просьба оставить отзыв",
    description: "После завершённой сессии",
    roles: ["CLIENT"],
  },
  {
    event: "NEW_REVIEW",
    label: "Новый отзыв",
    description: "Когда клиент оставил отзыв",
    roles: ["PRACTITIONER"],
  },
  {
    event: "PAYMENT_RECEIVED",
    label: "Платёж получен",
    description: "Подтверждение оплаты",
    roles: ["PRACTITIONER"],
  },
  {
    event: "PAYOUT_SCHEDULED",
    label: "Запланированная выплата",
    description: "Сводка по выплатам практикам на 1-е и 15-е число",
    roles: ["SUPERADMIN"],
  },
  {
    event: "BALANCE_TOPUP",
    label: "Пополнение баланса",
    description: "Успешное пополнение кошелька",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "CARD_LINKED",
    label: "Карта привязана",
    description: "Новая карта добавлена для быстрой оплаты",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "CARD_REMOVED",
    label: "Карта отвязана",
    description: "Привязанная карта удалена",
    roles: ["CLIENT", "PRACTITIONER"],
  },
];

/** Фильтрация событий по роли пользователя */
export function getEventsForRole(role: UserRole) {
  return ALL_EVENTS.filter((e) => e.roles.includes(role));
}

export const DEFAULT_EMAIL_EVENTS: NotifEvent[] = [
  "BOOKING_REQUESTED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_REMINDER",
  "SESSION_COMPLETED",
  "REVIEW_REQUESTED",
];

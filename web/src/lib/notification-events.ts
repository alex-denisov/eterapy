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
  | "PRODUCT_UNLOCKED"
  | "SUBSCRIPTION_STARTED"
  | "SUBSCRIPTION_RENEWAL"
  | "SUBSCRIPTION_CANCELLED"
  | "SUBSCRIPTION_PAYMENT_FAILED"
  | "CARD_LINKED"
  | "CARD_REMOVED"
  | "DAILY_CARD"
  | "ABANDONED_CHECKOUT"
  | "REPORT_READY"
  | "PARTNER_COMPLETED"
  | "CIRCLE_READY"
  | "ROUTE_REMINDER"
  | "WEEKLY_DIGEST"
  | "PRACTITIONER_DIGEST"
  | "COMPLIANCE_ALERT"
  | "CREDITS_EXPIRING"
  | "STREAK_AT_RISK"
  | "MOMENT_OF_NEED"
  | "WELCOME_CREDITS"
  | "WELCOME_CREDITS_REMINDER";

export type UserRole = "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN" | "MODERATOR";
export type NotificationCategory = "booking" | "session" | "reviews" | "payments" | "retention" | "system";

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, { label: string; description: string }> = {
  booking: {
    label: "Записи",
    description: "Создание, подтверждение, отмена и напоминания по сессиям.",
  },
  session: {
    label: "Сессии",
    description: "Начало и завершение видео-сессии.",
  },
  reviews: {
    label: "Отзывы",
    description: "Просьбы оставить отзыв и новые отзывы клиентов.",
  },
  payments: {
    label: "Платежи",
    description: "Баланс, карты, выплаты и платежные события.",
  },
  retention: {
    label: "Практики ясности",
    description: "Карта дня, маршруты и бережные напоминания.",
  },
  system: {
    label: "Системные",
    description: "Операционные уведомления для администраторов.",
  },
};

export const ALL_EVENTS: Array<{
  event: NotifEvent;
  category: NotificationCategory;
  label: string;
  description: string;
  roles: UserRole[];
}> = [
  {
    event: "BOOKING_REQUESTED",
    category: "booking",
    label: "Новая запись",
    description: "Когда клиент запросил сессию",
    roles: ["PRACTITIONER"],
  },
  {
    event: "BOOKING_CONFIRMED",
    category: "booking",
    label: "Запись подтверждена",
    description: "Когда практик подтвердил запись",
    roles: ["CLIENT"],
  },
  {
    event: "BOOKING_CANCELLED",
    category: "booking",
    label: "Запись отменена",
    description: "Когда сессия была отменена любой стороной",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "BOOKING_REMINDER",
    category: "booking",
    label: "Напоминание о сессии",
    description: "До начала сессии",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SESSION_STARTED",
    category: "session",
    label: "Сессия началась",
    description: "Когда открыт видеочат",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SESSION_COMPLETED",
    category: "session",
    label: "Сессия завершена",
    description: "После окончания сессии",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "REVIEW_REQUESTED",
    category: "reviews",
    label: "Просьба оставить отзыв",
    description: "После завершённой сессии",
    roles: ["CLIENT"],
  },
  {
    event: "NEW_REVIEW",
    category: "reviews",
    label: "Новый отзыв",
    description: "Когда клиент оставил отзыв",
    roles: ["PRACTITIONER"],
  },
  {
    event: "PAYMENT_RECEIVED",
    category: "payments",
    label: "Платёж получен",
    description: "Подтверждение оплаты",
    roles: ["PRACTITIONER"],
  },
  {
    event: "PAYOUT_SCHEDULED",
    category: "system",
    label: "Запланированная выплата",
    description: "Сводка по выплатам практикам на 1-е и 15-е число",
    roles: ["SUPERADMIN"],
  },
  {
    event: "BALANCE_TOPUP",
    category: "payments",
    label: "Пополнение баланса",
    description: "Успешное пополнение кошелька",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "PRODUCT_UNLOCKED",
    category: "payments",
    label: "Продукт открыт",
    description: "После успешной оплаты углубления или отчета",
    roles: ["CLIENT"],
  },
  {
    event: "SUBSCRIPTION_STARTED",
    category: "payments",
    label: "Подписка активна",
    description: "После старта пробного периода или оплаты подписки",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SUBSCRIPTION_RENEWAL",
    category: "payments",
    label: "Скоро автопродление",
    description: "За 3 дня до автоматического продления подписки",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SUBSCRIPTION_CANCELLED",
    category: "payments",
    label: "Подписка отменена",
    description: "После отмены подписки",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "SUBSCRIPTION_PAYMENT_FAILED",
    category: "payments",
    label: "Платеж подписки не прошел",
    description: "Когда продление подписки требует внимания",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "CARD_LINKED",
    category: "payments",
    label: "Карта привязана",
    description: "Новая карта добавлена для быстрой оплаты",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "CARD_REMOVED",
    category: "payments",
    label: "Карта отвязана",
    description: "Привязанная карта удалена",
    roles: ["CLIENT", "PRACTITIONER"],
  },
  {
    event: "DAILY_CARD",
    category: "retention",
    label: "Карта дня",
    description: "Один бережный фокус на день",
    roles: ["CLIENT"],
  },
  {
    event: "ABANDONED_CHECKOUT",
    category: "payments",
    label: "Незавершенная оплата",
    description: "Мягкое возвращение к оплате продукта или подписки",
    roles: ["CLIENT"],
  },
  {
    event: "REPORT_READY",
    category: "retention",
    label: "Отчет готов",
    description: "Платный отчет или углубление готово к чтению",
    roles: ["CLIENT"],
  },
  {
    event: "PARTNER_COMPLETED",
    category: "retention",
    label: "Партнер завершил часть",
    description: "Второй участник завершил совместный сценарий",
    roles: ["CLIENT"],
  },
  {
    event: "CIRCLE_READY",
    category: "retention",
    label: "Круг собран",
    description: "Достаточно ответов для отчета Круга ясности",
    roles: ["CLIENT"],
  },
  {
    event: "ROUTE_REMINDER",
    category: "retention",
    label: "Напоминание по маршруту",
    description: "Бережное возвращение к маршруту или практике",
    roles: ["CLIENT"],
  },
  {
    event: "WEEKLY_DIGEST",
    category: "retention",
    label: "Недельный дайджест",
    description: "Недельная сводка вопросов, практик и мягких выводов",
    roles: ["CLIENT"],
  },
  {
    event: "PRACTITIONER_DIGEST",
    category: "retention",
    label: "Дайджест специалиста",
    description: "Сводка заявок, встреч, выплат и отзывов",
    roles: ["PRACTITIONER"],
  },
  {
    event: "COMPLIANCE_ALERT",
    category: "system",
    label: "Комплаенс-сигнал",
    description: "Риск-флаг по сессии или жалобе для проверки человеком",
    roles: ["ADMIN", "SUPERADMIN", "MODERATOR"],
  },
  {
    event: "CREDITS_EXPIRING",
    category: "retention",
    label: "Баллы скоро сгорят",
    description: "Бережное напоминание за 2-3 дня до сгорания баллов",
    roles: ["CLIENT"],
  },
  {
    event: "STREAK_AT_RISK",
    category: "retention",
    label: "Ритм практики",
    description: "Мягкое возвращение к практике, когда вчера был стрик",
    roles: ["CLIENT"],
  },
  {
    event: "MOMENT_OF_NEED",
    category: "retention",
    label: "Момент нужды",
    description: "Редкое возвращение к сохраненной теме после паузы",
    roles: ["CLIENT"],
  },
  {
    event: "WELCOME_CREDITS",
    category: "retention",
    label: "Приветственные баллы",
    description: "Когда приветственные баллы начислены",
    roles: ["CLIENT"],
  },
  {
    event: "WELCOME_CREDITS_REMINDER",
    category: "retention",
    label: "Приветственные баллы ждут",
    description: "Напоминание о неиспользованных приветственных баллах",
    roles: ["CLIENT"],
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
  "SUBSCRIPTION_RENEWAL",
  // B358 / Баг 9: payment confirmations email by default — card linked,
  // subscription started, balance/credit top-up. Web (bell) is always on and
  // Telegram follows prefs (all-on after linking), so these now reach all three.
  "CARD_LINKED",
  "SUBSCRIPTION_STARTED",
  "BALANCE_TOPUP",
  "DAILY_CARD",
  "ABANDONED_CHECKOUT",
  "REPORT_READY",
  "PARTNER_COMPLETED",
  "CIRCLE_READY",
  "ROUTE_REMINDER",
  "WEEKLY_DIGEST",
  "PRACTITIONER_DIGEST",
  "COMPLIANCE_ALERT",
  "CREDITS_EXPIRING",
  "STREAK_AT_RISK",
  "MOMENT_OF_NEED",
  "WELCOME_CREDITS",
  "WELCOME_CREDITS_REMINDER",
];

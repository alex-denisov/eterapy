/**
 * Shared display helpers + types for the unified users registry (admin/users).
 *
 * U1: statuses, channels and roles are rendered as COLORED TEXT (no badges /
 * pills) — see colorOf* helpers. Kept in one place so the read-only table
 * (users-control-panel) and the edit modal (user-edit-modal) stay consistent.
 */

export type UserRole = "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN";

export type Specialty = "TAROT" | "ASTROLOGY" | "NUMEROLOGY" | "PSYCHIC" | "RUNES" | "DREAMS";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  emailVerified: boolean;
  deletedAt: string | null;
  blockedAt: string | null;
  freeToolsLimit: number | null;
  balance: number; // kopecks
  clarityCredits: number;
  provider: string | null;
  telegramUsername: string | null;
  practitioner: {
    id: string;
    status: string;
    title: string;
    commissionPercent: number;
    specialties: Specialty[];
    tags: string[];
    pricePerSession: number;
    sessionDuration: number;
  } | null;
  moderatorPermissions: string[];
  moderatorPermissionsCount: number;
  bookingsCount: number;
  entitlementsCount: number;
  subscriptionsCount: number;
  // U5 (antifraud): registration source + last-session provenance from logs.
  registrationSource: string | null;
  lastLogin: {
    at: string;
    ip: string | null;
    device: string | null;
    channel: string | null;
  } | null;
}

export interface UserPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canBlock: boolean;
  canResetPassword: boolean;
  canImpersonate: boolean;
  canManageRoles: boolean;
  canManageBalance: boolean;
  canManageRights: boolean;
  canSetPassword: boolean;
  canManagePractitioners: boolean;
  canDelete: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Модератор",
  SUPERADMIN: "Суперадмин",
};

/** Colored text class per role (U1 — text, not badge). */
export function roleColor(role: UserRole): string {
  switch (role) {
    case "PRACTITIONER": return "text-[var(--soft-bordeaux)]";
    case "ADMIN": return "text-amber-700";
    case "SUPERADMIN": return "text-red-700";
    default: return "text-[var(--soft-ink-strong)]";
  }
}

// T4: acquisition channel derived from User.provider (already persisted).
export type Channel = "web" | "app" | "telegram" | "vk" | "manual";

const CHANNEL_LABELS: Record<Channel, string> = {
  web: "Web", app: "App", telegram: "Telegram", vk: "VK", manual: "Manual",
};

export function channelOf(provider: string | null): Channel {
  switch ((provider ?? "").toLowerCase()) {
    case "vk": return "vk";
    case "telegram": case "max": return "telegram";
    case "ios": case "android": return "app";
    case "web": case "google": case "mobile_web": return "web";
    default: return "manual";
  }
}

export function channelLabel(provider: string | null): string {
  return CHANNEL_LABELS[channelOf(provider)];
}

/** Colored text class per channel (U1 — text, not badge). */
export function channelColor(provider: string | null): string {
  switch (channelOf(provider)) {
    case "web": return "text-sky-600";
    case "app": return "text-violet-600";
    case "telegram": return "text-blue-500";
    case "vk": return "text-indigo-600";
    default: return "text-[var(--soft-ink-faint)]";
  }
}

export interface StatusView {
  label: string;
  className: string;
}

/** Status as colored text (U1 — text, not badge). */
export function statusOf(row: Pick<AdminUserRow, "deletedAt" | "blockedAt" | "emailVerified">): StatusView {
  if (row.deletedAt) return { label: "Удалён", className: "text-red-600" };
  if (row.blockedAt) return { label: "Заблокирован", className: "text-red-600" };
  if (!row.emailVerified) return { label: "Email не подтверждён", className: "text-amber-600" };
  return { label: "Активен", className: "text-emerald-600" };
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  TAROT: "Таро",
  ASTROLOGY: "Астрология",
  NUMEROLOGY: "Нумерология",
  PSYCHIC: "Экстрасенсорика",
  RUNES: "Руны",
  DREAMS: "Сны",
};

export const SPECIALTY_ORDER: Specialty[] = [
  "TAROT", "ASTROLOGY", "NUMEROLOGY", "PSYCHIC", "RUNES", "DREAMS",
];

export const SESSION_DURATIONS = [15, 30, 45, 60, 90, 120];

/** Permission groups + RU labels for the in-modal rights matrix (U4). */
export const PERMISSION_GROUPS: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  {
    group: "Пользователи",
    items: [
      { key: "users.view", label: "Просмотр пользователей" },
      { key: "users.create", label: "Создание пользователей" },
      { key: "users.edit", label: "Редактирование" },
      { key: "users.delete", label: "Удаление" },
      { key: "users.block", label: "Блокировка" },
      { key: "users.reset_password", label: "Сброс пароля" },
      { key: "users.set_password", label: "Назначение пароля" },
      { key: "users.impersonate", label: "Имперсонация" },
    ],
  },
  {
    group: "Клиенты",
    items: [
      { key: "clients.view", label: "Просмотр клиентов" },
      { key: "clients.create", label: "Создание клиентов" },
      { key: "clients.edit", label: "Редактирование имени" },
      { key: "clients.block", label: "Блокировка/разблокировка" },
      { key: "clients.delete", label: "Удаление клиентов" },
      { key: "clients.reset_password", label: "Сброс пароля" },
      { key: "clients.set_password", label: "Назначение пароля" },
      { key: "clients.view_sessions", label: "Просмотр сессий" },
      { key: "clients.view_events", label: "Просмотр событий (лог)" },
    ],
  },
  {
    group: "Практики",
    items: [
      { key: "practitioners.view", label: "Просмотр практиков" },
      { key: "practitioners.create", label: "Создание аккаунта" },
      { key: "practitioners.edit", label: "Редактирование данных" },
      { key: "practitioners.block", label: "Блокировка" },
      { key: "practitioners.reset_password", label: "Сброс пароля" },
      { key: "practitioners.set_password", label: "Назначение пароля" },
      { key: "practitioners.set_rates", label: "Управление тарифами" },
      { key: "practitioners.set_schedule", label: "Управление расписанием" },
      { key: "practitioners.view_earnings", label: "Просмотр выплат" },
      { key: "practitioners.payout", label: "Инициация выплат" },
      { key: "practitioners.verify", label: "Верификация практиков" },
    ],
  },
  {
    group: "Продукт v5",
    items: [
      { key: "dialogues.view", label: "Просмотр диалогов" },
      { key: "reports.view", label: "Просмотр отчётов" },
      { key: "library.moderate", label: "Модерация библиотеки" },
      { key: "safety.review", label: "Разбор safety-событий" },
      { key: "practitioner_pro.manage", label: "Практик Pro" },
      { key: "content.configure", label: "Контентные настройки" },
      { key: "seo.manage", label: "SEO-настройки" },
    ],
  },
  {
    group: "Финансы",
    items: [
      { key: "payments.refund", label: "Возвраты платежей" },
      { key: "subscriptions.manage", label: "Управление подписками" },
      { key: "antifraud.review", label: "Антифрод" },
    ],
  },
  {
    group: "Система",
    items: [
      { key: "analytics.view", label: "Аналитика" },
      { key: "ai.configure", label: "AI-настройки" },
      { key: "notifications.diagnose", label: "Диагностика уведомлений" },
      { key: "system.read", label: "Статус системы" },
      { key: "system.operate", label: "Операции системы" },
    ],
  },
];

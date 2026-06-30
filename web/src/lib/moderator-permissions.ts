/**
 * Утилиты для работы с полномочиями модератора.
 * Используется на сервере (layout, страницы) и через API.
 */
import db from "@/lib/db";

/** Все полномочия SUPERADMIN — полный доступ */
export const ALL_PERMISSIONS = [
  "users.view", "users.create", "users.edit", "users.delete", "users.block",
  "users.reset_password", "users.set_password", "users.impersonate",
  "clients.view", "clients.create", "clients.edit", "clients.delete", "clients.block",
  "clients.reset_password", "clients.set_password",
  "clients.view_sessions", "clients.view_events",
  "practitioners.view", "practitioners.create", "practitioners.edit",
  "practitioners.block", "practitioners.reset_password", "practitioners.set_password",
  "practitioners.set_rates", "practitioners.set_schedule", "practitioners.view_earnings",
  "practitioners.payout", "practitioners.verify", "practitioners.manage_reports",
  "practitioners.manage_documents",
  "dialogues.view", "reports.view", "library.moderate", "safety.review", "antifraud.review",
  "payments.refund", "subscriptions.manage", "notifications.diagnose",
  "practitioner_pro.manage", "content.configure", "seo.manage",
  "analytics.view", "ai.configure", "legal.cross_border.manage", "system.read", "system.operate",
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export const V5_REQUIRED_PERMISSIONS: Permission[] = [
  "users.view", "users.create", "users.edit", "users.delete", "users.block",
  "dialogues.view", "reports.view", "library.moderate", "safety.review", "antifraud.review",
  "analytics.view", "payments.refund", "subscriptions.manage",
  "notifications.diagnose", "practitioners.verify", "practitioners.manage_reports",
  "practitioners.manage_documents", "practitioner_pro.manage",
  "content.configure", "ai.configure", "legal.cross_border.manage", "seo.manage", "system.read", "system.operate",
];

/** Минимальный набор для ADMIN без явных полномочий */
export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [
  "clients.view",
  "practitioners.view",
];

/**
 * Возвращает список разрешённых полномочий для пользователя.
 * - SUPERADMIN → ALL_PERMISSIONS
 * - ADMIN → читает ModeratorPermission из БД
 */
export async function getUserPermissions(userId: string, role: string): Promise<Permission[]> {
  if (role === "SUPERADMIN") return [...ALL_PERMISSIONS];

  const rows = await db.moderatorPermission.findMany({
    where: { moderatorId: userId, granted: true },
    select: { permission: true },
  });

  if (rows.length === 0) return DEFAULT_ADMIN_PERMISSIONS;
  return rows.map(r => r.permission as Permission);
}

/** Проверяет одно полномочие */
export function can(permissions: Permission[], perm: Permission): boolean {
  return permissions.includes(perm);
}

/** Проверяет доступ к разделу — если нет ни одного полномочия из раздела */
export function canAccessSection(permissions: Permission[], section: "clients" | "practitioners"): boolean {
  return permissions.some(p => p.startsWith(section + "."));
}

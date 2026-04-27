/**
 * Утилиты для работы с полномочиями модератора.
 * Используется на сервере (layout, страницы) и через API.
 */
import db from "@/lib/db";

export type Permission =
  | "clients.view"
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  | "clients.block"
  | "clients.reset_password"
  | "clients.set_password"
  | "clients.view_sessions"
  | "clients.view_events"
  | "practitioners.view"
  | "practitioners.create"
  | "practitioners.edit"
  | "practitioners.block"
  | "practitioners.reset_password"
  | "practitioners.set_password"
  | "practitioners.set_rates"
  | "practitioners.set_schedule"
  | "practitioners.view_earnings"
  | "practitioners.payout"
  | "system.read";

/** Все полномочия SUPERADMIN — полный доступ */
export const ALL_PERMISSIONS: Permission[] = [
  "clients.view", "clients.create", "clients.edit", "clients.delete", "clients.block",
  "clients.reset_password", "clients.set_password",
  "clients.view_sessions", "clients.view_events",
  "practitioners.view", "practitioners.create", "practitioners.edit",
  "practitioners.block", "practitioners.reset_password", "practitioners.set_password",
  "practitioners.set_rates", "practitioners.set_schedule", "practitioners.view_earnings",
  "practitioners.payout",
  "system.read",
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
  if (role === "SUPERADMIN") return ALL_PERMISSIONS;

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

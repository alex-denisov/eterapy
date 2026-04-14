"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Permission } from "@/lib/moderator-permissions";
import { adminUrl, mainUrl } from "@/lib/subdomain";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** Если задано — показывать только при наличии этого полномочия */
  permission?: Permission;
  /** Только для суперадмина */
  superadminOnly?: boolean;
}

const BASE_NAV: NavItem[] = [
  { href: adminUrl("/admin"),              icon: "🏠", label: "Обзор" },
  { href: adminUrl("/admin/clients"),      icon: "👤", label: "Клиенты",      permission: "clients.view" },
  { href: adminUrl("/admin/practitioners"),icon: "🔮", label: "Практики",     permission: "practitioners.view" },
  { href: adminUrl("/admin/applications"), icon: "📋", label: "Заявки",        permission: "practitioners.view" },
  { href: adminUrl("/admin/bookings"),     icon: "📅", label: "Бронирования" },
  { href: adminUrl("/admin/complaints"),   icon: "⚠️", label: "Жалобы" },
];

const SUPERADMIN_EXTRA: NavItem[] = [
  { href: adminUrl("/admin/metrics"),    icon: "📊", label: "Метрики",          superadminOnly: true },
  { href: adminUrl("/admin/pricing"),    icon: "💰", label: "Цены и тарифы",    superadminOnly: true },
  { href: adminUrl("/admin/moderators"), icon: "🛡️", label: "Модераторы",       superadminOnly: true },
  { href: adminUrl("/admin/users"),      icon: "🗂️", label: "Все пользователи", superadminOnly: true },
  { href: adminUrl("/admin/payments"),   icon: "💳", label: "Выплаты",          superadminOnly: true },
  { href: adminUrl("/admin/files"),      icon: "📁", label: "Файлы",            superadminOnly: true },
  { href: adminUrl("/admin/sessions"),   icon: "🔐", label: "Сессии",           superadminOnly: true },
  { href: adminUrl("/admin/logs"),       icon: "📋", label: "Логи",             superadminOnly: true },
  { href: adminUrl("/admin/system"),     icon: "⚙️", label: "Система",          superadminOnly: true },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

export function AdminShell({
  user,
  role,
  permissions,
  children,
}: {
  user: { name?: string | null; email?: string | null } | undefined;
  role: string;
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSuperAdmin = role === "SUPERADMIN";

  const allNavItems = isSuperAdmin ? [...BASE_NAV, ...SUPERADMIN_EXTRA] : BASE_NAV;

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = allNavItems.filter(item => {
    if (item.superadminOnly && !isSuperAdmin) return false;
    if (item.permission && !permissions.includes(item.permission)) return false;
    return true;
  });

  function isActive(href: string) {
    const itemPath = new URL(href).pathname;
    if (itemPath === "/admin") return pathname === itemPath;
    return pathname.startsWith(itemPath);
  }

  return (
    <div className="min-h-screen flex">
      <aside
        className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6 sticky h-[calc(100vh-var(--header-height))] overflow-y-auto"
        style={{ top: "var(--header-height)" }}
      >
        <div className="mb-6 px-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {ROLE_LABELS[role] ?? "Администратор"}
          </p>
          <p className="font-medium text-sm truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border/20 pt-2 mt-2">
          <Link href={adminUrl("/admin/settings")}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <span className="text-base">⚙️</span>
            Настройки
          </Link>
          <button onClick={() => signOut({ callbackUrl: mainUrl("/") })}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <span className="text-base">🚪</span>
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

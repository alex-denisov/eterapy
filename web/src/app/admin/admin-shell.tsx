"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  BrainCircuit,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  MessageSquareWarning,
  Settings,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  UserRound,
  WalletCards,
  Wrench,
  LogOut,
  FileText,
  ListTodo,
} from "lucide-react";
import type { Permission } from "@/lib/moderator-permissions";
import { adminUrl, logoutUrl, toPathname } from "@/lib/subdomain";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { BrandSignature } from "@/components/brand/brand-mark";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  /** Если задано — показывать только при наличии этого полномочия */
  permission?: Permission;
  /** Только для суперадмина */
  superadminOnly?: boolean;
}

// Unified nav order — single source of truth for both ADMIN and SUPERADMIN.
// Order:
//   1. Dashboard
//   2. Role sections: Clients → Practitioners → Moderators (per backlog 11.1)
//   3. Workflow: Applications → Bookings → Complaints
//   4. Finance & analytics: Payouts → Pricing → Metrics
//   5. Records & diagnostics: Sessions → Files → Logs → All users
//   6. System (ops) — last
const NAV_ITEMS: NavItem[] = [
  { href: adminUrl("/admin"),              icon: LayoutDashboard,      label: "Обзор" },

  { href: adminUrl("/admin/clients"),      icon: Users,                label: "Клиенты",          permission: "clients.view" },
  { href: adminUrl("/admin/practitioners"),icon: BriefcaseBusiness,    label: "Практики",         permission: "practitioners.view" },
  { href: adminUrl("/admin/moderators"),   icon: Shield,               label: "Модераторы",       superadminOnly: true },

  { href: adminUrl("/admin/applications"), icon: FileText,             label: "Заявки",           permission: "practitioners.view" },
  { href: adminUrl("/admin/bookings"),     icon: CalendarDays,         label: "Бронирования" },
  { href: adminUrl("/admin/complaints"),   icon: MessageSquareWarning, label: "Жалобы" },
  { href: adminUrl("/admin/antifraud"),     icon: ShieldAlert,          label: "Антифрод",         permission: "antifraud.review" },

  { href: adminUrl("/admin/payments"),     icon: WalletCards,          label: "Выплаты",          superadminOnly: true },
  { href: adminUrl("/admin/pricing"),      icon: SlidersHorizontal,    label: "Цены и тарифы",    superadminOnly: true },
  { href: adminUrl("/admin/metrics"),      icon: BarChart3,            label: "Метрики",          superadminOnly: true },
  { href: adminUrl("/admin/ai"),           icon: BrainCircuit,         label: "AI-центр",         permission: "ai.configure" },
  { href: adminUrl("/admin/notifications"),icon: BellRing,             label: "Уведомления",      permission: "notifications.diagnose" },

  { href: adminUrl("/admin/sessions"),     icon: Gauge,                label: "Сессии",           superadminOnly: true },
  { href: adminUrl("/admin/files"),        icon: FolderOpen,           label: "Файлы",            superadminOnly: true },
  { href: adminUrl("/admin/logs"),         icon: BookOpenText,         label: "Логи",             superadminOnly: true },
  { href: adminUrl("/admin/users"),        icon: UserRound,            label: "Все пользователи", superadminOnly: true },

  { href: adminUrl("/admin/jobs"),         icon: ListTodo,             label: "Задачи (очередь)", permission: "system.read" },
  { href: adminUrl("/admin/system"),       icon: Wrench,               label: "Система",          permission: "system.read" },
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
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = NAV_ITEMS.filter(item => {
    if (item.superadminOnly && !isSuperAdmin) return false;
    if (item.permission && !permissions.includes(item.permission)) return false;
    return true;
  });

  // Для мобильного навигации — первые 4 пункта
  const mobileNav = nav.slice(0, 4);

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/admin") return pathname === itemPath;
    return pathname.startsWith(itemPath);
  }

  const navLabelByPath = new Map(nav.map((item) => [toPathname(item.href), item.label]));
  const breadcrumbItems = pathname
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((segment, index, segments) => {
      const fullPath = `/admin/${segments.slice(0, index + 1).join("/")}`;
      const label = navLabelByPath.get(fullPath)
        ?? segment
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");
      const isLast = index === segments.length - 1;
      return {
        label,
        href: isLast ? undefined : adminUrl(fullPath),
      };
    });

  return (
    <div data-testid="admin-shell" data-shell-role={role} className="soft-clarity-page soft-admin-shell flex min-h-screen">
      <aside
        data-testid="admin-shell-sidebar"
        className="soft-admin-sidebar sticky hidden h-[calc(100vh-var(--header-height))] w-64 shrink-0 flex-col overflow-y-auto px-3 py-5 md:flex"
        style={{ top: "var(--header-height)" }}
      >
        <div className="mb-5 border-b border-[var(--soft-paper-edge)] px-2 pb-4">
          <BrandSignature compact theme="light" />
        </div>
        <div className="mb-5 px-2" data-testid="admin-shell-user">
          <div className="flex items-center gap-3">
            <div className="soft-app-avatar flex h-10 w-10 shrink-0 items-center justify-center text-sm font-semibold">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name ?? "Пользователь"}</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">{ROLE_LABELS[role] ?? "Администратор"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
            <Link key={item.href} href={item.href}
              data-testid="admin-shell-nav-item"
              className={`soft-admin-nav-link flex min-h-10 items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                isActive(item.href)
                  ? "is-active font-medium"
                  : ""
              }`}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )})}
        </nav>

        <div className="mt-2 border-t border-[var(--soft-paper-edge)] pt-2">
          <Link href={adminUrl("/admin/settings")}
            className="soft-admin-nav-link flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)]">
            <Settings className="h-4 w-4 shrink-0" />
            Настройки
          </Link>
          <button onClick={() => { window.location.href = logoutUrl(); }}
            className="soft-admin-nav-link flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)]">
            <LogOut className="h-4 w-4 shrink-0" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div data-testid="admin-shell-mobile-nav" className="soft-admin-mobile-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors duration-[var(--motion-base)] ${
                isActive(item.href) ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]"
              }`}>
              <Icon className="h-5 w-5" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      <main data-testid="admin-shell-main" className="min-w-0 flex-1 pb-20 md:pb-0">
        {breadcrumbItems.length > 0 && (
          <div className="px-4 pt-6 sm:px-6">
            <Breadcrumb homeHref={adminUrl("/admin")} items={breadcrumbItems} className="mb-0" />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

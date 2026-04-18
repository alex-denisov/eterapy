"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  MessageSquareWarning,
  Settings,
  Shield,
  SlidersHorizontal,
  Users,
  UserRound,
  WalletCards,
  Wrench,
  LogOut,
  FileText,
} from "lucide-react";
import type { Permission } from "@/lib/moderator-permissions";
import { adminUrl, logoutUrl, toPathname } from "@/lib/subdomain";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  /** Если задано — показывать только при наличии этого полномочия */
  permission?: Permission;
  /** Только для суперадмина */
  superadminOnly?: boolean;
}

const BASE_NAV: NavItem[] = [
  { href: adminUrl("/admin"),              icon: LayoutDashboard,   label: "Обзор" },
  { href: adminUrl("/admin/clients"),      icon: Users,             label: "Клиенты",      permission: "clients.view" },
  { href: adminUrl("/admin/practitioners"),icon: BriefcaseBusiness, label: "Практики",     permission: "practitioners.view" },
  { href: adminUrl("/admin/applications"), icon: FileText,          label: "Заявки",       permission: "practitioners.view" },
  { href: adminUrl("/admin/bookings"),     icon: CalendarDays,      label: "Бронирования" },
  { href: adminUrl("/admin/complaints"),   icon: MessageSquareWarning, label: "Жалобы" },
];

const SUPERADMIN_EXTRA: NavItem[] = [
  { href: adminUrl("/admin/metrics"),    icon: BarChart3,         label: "Метрики",          superadminOnly: true },
  { href: adminUrl("/admin/pricing"),    icon: SlidersHorizontal, label: "Цены и тарифы",    superadminOnly: true },
  { href: adminUrl("/admin/moderators"), icon: Shield,            label: "Модераторы",       superadminOnly: true },
  { href: adminUrl("/admin/users"),      icon: UserRound,         label: "Все пользователи", superadminOnly: true },
  { href: adminUrl("/admin/payments"),   icon: WalletCards,       label: "Выплаты",          superadminOnly: true },
  { href: adminUrl("/admin/files"),      icon: FolderOpen,        label: "Файлы",            superadminOnly: true },
  { href: adminUrl("/admin/sessions"),   icon: Gauge,             label: "Сессии",           superadminOnly: true },
  { href: adminUrl("/admin/logs"),       icon: BookOpenText,      label: "Логи",             superadminOnly: true },
  { href: adminUrl("/admin/system"),     icon: Wrench,            label: "Система",          superadminOnly: true },
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

  const allNavItems = isSuperAdmin ? [...BASE_NAV, ...SUPERADMIN_EXTRA] : BASE_NAV;

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = allNavItems.filter(item => {
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
    <div className="min-h-screen flex">
      <aside
        className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6 sticky h-[calc(100vh-var(--header-height))] overflow-y-auto"
        style={{ top: "var(--header-height)" }}
      >
        <div className="mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name ?? "Пользователь"}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] ?? "Администратор"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )})}
        </nav>

        <div className="border-t border-border/20 pt-2 mt-2">
          <Link href={adminUrl("/admin/settings")}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <Settings className="h-4 w-4 shrink-0" />
            Настройки
          </Link>
          <button onClick={() => { window.location.href = logoutUrl(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <LogOut className="h-4 w-4 shrink-0" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/20 bg-navy/95 backdrop-blur-sm">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
                isActive(item.href) ? "text-primary" : "text-muted-foreground"
              }`}>
              <Icon className="h-5 w-5" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
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

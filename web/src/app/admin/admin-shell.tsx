"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  BrainCircuit,
  BookOpenText,
  CalendarDays,
  Database,
  FileSearch,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareWarning,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Users,
  WalletCards,
  Wrench,
  LogOut,
  FileText,
  ListTodo,
  ServerCog,
  BarChart3,
  ReceiptText,
  Landmark,
  FileSpreadsheet,
  Coins,
} from "lucide-react";
import type { Permission } from "@/lib/moderator-permissions";
import { adminUrl, logoutUrl, toPathname } from "@/lib/subdomain";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface NavItem {
  type?: "item";
  href: string;
  icon: React.ElementType;
  label: string;
  /** Если задано — показывать только при наличии этого полномочия */
  permission?: Permission;
  /** Только для суперадмина */
  superadminOnly?: boolean;
}

interface NavGroup {
  type: "group";
  key: string;
  label: string;
}

type NavEntry = NavItem | NavGroup;

// Unified nav order — single source of truth for both ADMIN and SUPERADMIN.
// User management is intentionally merged into /admin/users; role-specific
// pages remain reachable as drill-downs from the unified table.
const NAV_ITEMS: NavEntry[] = [
  { type: "group", key: "workspace", label: "Рабочий стол" },
  { href: adminUrl("/admin"),              icon: LayoutDashboard,      label: "Обзор" },

  { type: "group", key: "product", label: "Продукт и клиенты" },
  { href: adminUrl("/admin/product"),      icon: BarChart3,            label: "Центр продукта" },
  { href: adminUrl("/admin/product/users"),icon: Users,                label: "Пользователи и сегменты" },
  { href: adminUrl("/admin/product/funnel"), icon: BarChart3,          label: "Воронка и конверсии" },
  { href: adminUrl("/admin/product/results"), icon: FileSearch,        label: "Продукты и результаты" },
  { href: adminUrl("/admin/product/sessions"), icon: Gauge,            label: "Сессии и транскрипты", superadminOnly: true },
  { href: adminUrl("/admin/product/subscriptions"), icon: Coins,       label: "Подписки, баллы и рефералы" },
  { href: adminUrl("/admin/product/quality"), icon: ShieldAlert,       label: "Операции и качество" },
  { href: adminUrl("/admin/applications"), icon: FileText,             label: "Заявки",           permission: "practitioners.view" },
  { href: adminUrl("/admin/bookings"),     icon: CalendarDays,         label: "Бронирования" },
  { href: adminUrl("/admin/sessions"),     icon: Gauge,                label: "Сессии",           superadminOnly: true },
  { href: adminUrl("/admin/complaints"),   icon: MessageSquareWarning, label: "Жалобы" },
  { href: adminUrl("/admin/reviews"),      icon: Star,                 label: "Отзывы",           permission: "safety.review" },
  { href: adminUrl("/admin/antifraud"),     icon: ShieldAlert,          label: "Антифрод",         permission: "antifraud.review" },

  { type: "group", key: "finance", label: "Финансы" },
  { href: adminUrl("/admin/finance"),      icon: WalletCards,          label: "Финансовый центр", superadminOnly: true },
  { href: adminUrl("/admin/finance/receipts"), icon: ReceiptText,      label: "Поступления и чеки", superadminOnly: true },
  { href: adminUrl("/admin/finance/payouts"), icon: Landmark,          label: "Выплаты практикам", superadminOnly: true },
  { href: adminUrl("/admin/finance/reports"), icon: FileSpreadsheet,   label: "Отчеты практиков", superadminOnly: true },
  { href: adminUrl("/admin/finance/points"), icon: Coins,              label: "Баллы", superadminOnly: true },
  { href: adminUrl("/admin/finance/reconciliation"), icon: FileSearch, label: "Сверка и импорт", superadminOnly: true },
  { href: adminUrl("/admin/finance/unit-economics"), icon: BarChart3,  label: "Юнит-экономика", superadminOnly: true },
  { href: adminUrl("/admin/pricing"),      icon: SlidersHorizontal,    label: "Цены и тарифы",    superadminOnly: true },
  { href: adminUrl("/admin/finance/controls"), icon: FileSearch,       label: "Контроль и журналы", superadminOnly: true },

  { type: "group", key: "ops", label: "Система, AI и журналы" },
  { href: adminUrl("/admin/ops"),          icon: ServerCog,            label: "Операционный центр", permission: "system.read" },
  { href: adminUrl("/admin/ops/ai-cost"),  icon: BrainCircuit,         label: "AI-затраты и токены", permission: "ai.configure" },
  { href: adminUrl("/admin/ai"),           icon: BrainCircuit,         label: "Провайдеры и модели", permission: "ai.configure" },
  { href: adminUrl("/admin/notifications"),icon: BellRing,             label: "Уведомления",      permission: "notifications.diagnose" },
  { href: adminUrl("/admin/files"),        icon: FolderOpen,           label: "Файлы",            superadminOnly: true },
  { href: adminUrl("/admin/database"),     icon: Database,             label: "База данных",      permission: "system.read" },
  { href: adminUrl("/admin/system"),       icon: Wrench,               label: "Надежность сервисов", permission: "system.read" },
  { href: adminUrl("/admin/jobs"),         icon: ListTodo,             label: "Очереди и задачи", permission: "system.read" },
  { href: adminUrl("/admin/logs"),         icon: BookOpenText,         label: "Журналы и аудит",  superadminOnly: true },
  { href: adminUrl("/admin/ops/security"), icon: FileSearch,           label: "Безопасность и инциденты", permission: "system.read" },

  { type: "group", key: "support", label: "Поддержка" },
  { href: adminUrl("/admin/support"),      icon: LifeBuoy,             label: "Поддержка" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

// X9: section key for the sidebar unread badge, derived from the nav href.
function navCountKey(href: string): string | null {
  if (href.endsWith("/admin/applications")) return "applications";
  if (href.endsWith("/admin/bookings")) return "bookings";
  if (href.endsWith("/admin/complaints")) return "complaints";
  if (href.endsWith("/admin/reviews")) return "reviews";
  return null;
}

function isNavItem(entry: NavEntry): entry is NavItem {
  return entry.type !== "group";
}

function canShowNavItem(item: NavItem, permissions: Permission[], isSuperAdmin: boolean) {
  if (item.superadminOnly && !isSuperAdmin) return false;
  if (item.permission && !permissions.includes(item.permission)) return false;
  return true;
}

function visibleNavEntries(entries: NavEntry[], permissions: Permission[], isSuperAdmin: boolean) {
  const visible: NavEntry[] = [];
  let pendingGroup: NavGroup | null = null;

  function pushGroupIfNeeded() {
    if (pendingGroup) {
      visible.push(pendingGroup);
      pendingGroup = null;
    }
  }

  for (const entry of entries) {
    if (!isNavItem(entry)) {
      pendingGroup = entry;
      continue;
    }
    if (canShowNavItem(entry, permissions, isSuperAdmin)) {
      pushGroupIfNeeded();
      visible.push(entry);
    }
  }
  return visible;
}

export function AdminShell({
  user,
  role,
  permissions,
  counts,
  children,
}: {
  user: { name?: string | null; email?: string | null } | undefined;
  role: string;
  permissions: Permission[];
  counts?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSuperAdmin = role === "SUPERADMIN";
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = visibleNavEntries(NAV_ITEMS, permissions, isSuperAdmin);
  const navItems = nav.filter(isNavItem);

  // Для мобильного навигации — первые 4 пункта
  const mobileNav = navItems.slice(0, 4);

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/admin") return pathname === itemPath;
    if (itemPath === "/admin/ops") return pathname === itemPath;
    return pathname.startsWith(itemPath);
  }

  const navLabelByPath = new Map(navItems.map((item) => [toPathname(item.href), item.label]));
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
        className="admin-shell-sidebar soft-admin-sidebar sticky hidden h-[calc(100vh-var(--header-height))] w-64 shrink-0 flex-col overflow-y-auto px-3 py-5 md:flex"
        style={{ top: "var(--header-height)" }}
      >
        {/* T10: logo intentionally omitted here — the public-shell-header
            already renders the brand mark, so a second copy in the sidebar
            duplicated it on every admin page. */}
        <div className="mb-5 mt-1 px-2" data-testid="admin-shell-user">
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
            if (!isNavItem(item)) {
              return (
                <div
                  key={item.key}
                  className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--soft-ink-faint)]"
                  data-testid="admin-shell-nav-group"
                >
                  {item.label}
                </div>
              );
            }
            const Icon = item.icon;
            const countKey = navCountKey(item.href);
            const count = countKey ? (counts?.[countKey] ?? 0) : 0;
            return (
            <Link key={item.href} href={item.href}
              data-testid="admin-shell-nav-item"
              className={`admin-shell-item soft-admin-nav-link flex min-h-10 items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                isActive(item.href)
                  ? "is-active font-medium"
                  : ""
              }`}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
              {count > 0 && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] px-1.5 text-[11px] font-bold text-[var(--soft-bordeaux)] tabular-nums"
                  data-testid="admin-nav-counter"
                  aria-label={`${count} новых`}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
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

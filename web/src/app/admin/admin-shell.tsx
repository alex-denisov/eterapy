"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  BrainCircuit,
  BookOpenText,
  Database,
  FileSearch,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  WalletCards,
  Wrench,
  LogOut,
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
  href: string;
  icon: React.ElementType;
  label: string;
  section: "workspace" | "product" | "finance" | "ops" | "support";
  level?: 0 | 1;
  /** Если задано — показывать только при наличии этого полномочия */
  permission?: Permission;
  /** Только для суперадмина */
  superadminOnly?: boolean;
}

// Unified nav order — single source of truth for both ADMIN and SUPERADMIN.
// User management is intentionally merged into /admin/product/users. Legacy
// role-specific routes stay as compatibility entry points until every action
// from their old panels is migrated into the unified modal.
const NAV_ITEMS: NavItem[] = [
  { href: adminUrl("/admin"),              icon: LayoutDashboard,      label: "Обзор", section: "workspace", level: 0 },

  { href: adminUrl("/admin/product"),      icon: BarChart3,            label: "Продукт и клиенты", section: "product", level: 0 },
  { href: adminUrl("/admin/product/users"), icon: Users,               label: "Пользователи и сегменты", section: "product", level: 1 },
  { href: adminUrl("/admin/product/funnel"), icon: BarChart3,          label: "Воронка и конверсии", section: "product", level: 1 },
  { href: adminUrl("/admin/product/results"), icon: FileSearch,        label: "Продукты и результаты", section: "product", level: 1 },
  { href: adminUrl("/admin/product/sessions"), icon: Gauge,            label: "Сессии и транскрипты", section: "product", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/product/subscriptions"), icon: Coins,       label: "Подписки, баллы и рефералы", section: "product", level: 1 },
  { href: adminUrl("/admin/product/quality"), icon: ShieldAlert,       label: "Операции и качество", section: "product", level: 1 },

  { href: adminUrl("/admin/finance"),      icon: WalletCards,          label: "Финансы", section: "finance", level: 0, superadminOnly: true },
  { href: adminUrl("/admin/finance/receipts"), icon: ReceiptText,      label: "Поступления и чеки", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/payouts"), icon: Landmark,          label: "Выплаты практикам", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/reports"), icon: FileSpreadsheet,   label: "Отчеты практиков", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/points"), icon: Coins,              label: "Баллы", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/reconciliation"), icon: FileSearch, label: "Сверка и импорт", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/unit-economics"), icon: BarChart3,  label: "Юнит-экономика", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/pricing"), icon: SlidersHorizontal, label: "Цены и тарифы", section: "finance", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/finance/controls"), icon: FileSearch,       label: "Контроль и журналы", section: "finance", level: 1, superadminOnly: true },

  { href: adminUrl("/admin/ops"),          icon: ServerCog,            label: "Система, AI и журналы", section: "ops", level: 0, permission: "system.read" },
  { href: adminUrl("/admin/ops/ai-cost"),  icon: BrainCircuit,         label: "AI-затраты и токены", section: "ops", level: 1, permission: "ai.configure" },
  { href: adminUrl("/admin/ops/ai"),       icon: BrainCircuit,         label: "Провайдеры и модели", section: "ops", level: 1, permission: "ai.configure" },
  { href: adminUrl("/admin/ops/notifications"), icon: BellRing,        label: "Уведомления", section: "ops", level: 1, permission: "notifications.diagnose" },
  { href: adminUrl("/admin/ops/files"),    icon: FolderOpen,           label: "Файлы", section: "ops", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/ops/database"), icon: Database,             label: "База данных", section: "ops", level: 1, permission: "system.read" },
  { href: adminUrl("/admin/ops/system"),   icon: Wrench,               label: "Надежность сервисов", section: "ops", level: 1, permission: "system.read" },
  { href: adminUrl("/admin/ops/jobs"),     icon: ListTodo,             label: "Очереди и задачи", section: "ops", level: 1, permission: "system.read" },
  { href: adminUrl("/admin/ops/logs"),     icon: BookOpenText,         label: "Журналы и аудит", section: "ops", level: 1, superadminOnly: true },
  { href: adminUrl("/admin/ops/security"), icon: FileSearch,           label: "Безопасность и инциденты", section: "ops", level: 1, permission: "system.read" },

  { href: adminUrl("/admin/support"),      icon: LifeBuoy,             label: "Поддержка", section: "support", level: 0 },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

const LEGACY_CANONICAL_PATHS: Record<string, string> = {
  "/admin/applications": "/admin/product/quality",
  "/admin/users": "/admin/product/users",
  "/admin/clients": "/admin/product/users",
  "/admin/practitioners": "/admin/product/users",
  "/admin/complaints": "/admin/product/quality",
  "/admin/reviews": "/admin/product/quality",
  "/admin/antifraud": "/admin/product/quality",
  "/admin/quality": "/admin/product/quality",
  "/admin/bookings": "/admin/product/sessions",
  "/admin/sessions": "/admin/product/sessions",
  "/admin/pricing": "/admin/finance/pricing",
  "/admin/payments": "/admin/finance/payouts",
  "/admin/payouts": "/admin/finance/payouts",
  "/admin/ai": "/admin/ops/ai",
  "/admin/notifications": "/admin/ops/notifications",
  "/admin/files": "/admin/ops/files",
  "/admin/database": "/admin/ops/database",
  "/admin/system": "/admin/ops/system",
  "/admin/jobs": "/admin/ops/jobs",
  "/admin/logs": "/admin/ops/logs",
};

function canonicalAdminPath(pathname: string) {
  return LEGACY_CANONICAL_PATHS[pathname] ?? pathname;
}

// X9: section key for the sidebar unread badge, derived from the nav href.
function navCountKey(href: string): string | null {
  if (href.endsWith("/admin/product/quality")) return "quality";
  if (href.endsWith("/admin/product/sessions")) return "bookings";
  return null;
}

function canShowNavItem(item: NavItem, permissions: Permission[], isSuperAdmin: boolean) {
  if (item.superadminOnly && !isSuperAdmin) return false;
  if (item.permission && !permissions.includes(item.permission)) return false;
  return true;
}

function visibleNavEntries(entries: NavItem[], permissions: Permission[], isSuperAdmin: boolean) {
  return entries.filter((entry) => canShowNavItem(entry, permissions, isSuperAdmin));
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
  const activePathname = canonicalAdminPath(pathname);
  const isSuperAdmin = role === "SUPERADMIN";
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = visibleNavEntries(NAV_ITEMS, permissions, isSuperAdmin);
  const navItems = nav;

  // Для мобильной навигации — основные разделы, без вложенных страниц.
  const mobileNav = navItems.filter((item) => (item.level ?? 0) === 0).slice(0, 4);

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/admin") return activePathname === itemPath;
    if (itemPath === "/admin/ops") return activePathname === itemPath;
    return activePathname.startsWith(itemPath);
  }

  function isExactActive(href: string) {
    return activePathname === toPathname(href);
  }

  function isSectionActive(item: NavItem) {
    if ((item.level ?? 0) !== 0 || item.section === "workspace") return false;
    return navItems.some((candidate) => candidate.section === item.section && isActive(candidate.href));
  }

  const navLabelByPath = new Map(navItems.map((item) => [toPathname(item.href), item.label]));
  const breadcrumbItems = activePathname
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
            const Icon = item.icon;
            const countKey = navCountKey(item.href);
            const count = countKey ? (counts?.[countKey] ?? 0) : 0;
            const depth = item.level ?? 0;
            const exactActive = isExactActive(item.href);
            const active = isActive(item.href);
            const parentActive = isSectionActive(item) && !exactActive;
            const navActive = active || ((item.level ?? 0) === 0 && parentActive);
            return (
            <Link key={item.href} href={item.href}
              data-testid="admin-shell-nav-item"
              data-depth={depth}
              aria-current={exactActive ? "page" : undefined}
              className={`admin-shell-item soft-admin-nav-link flex items-center rounded-[var(--radius-control)] transition-colors duration-[var(--motion-base)] ${
                depth === 1
                  ? "ml-5 min-h-8 gap-2 px-2 py-1.5 text-xs"
                  : "mt-2 min-h-10 gap-2.5 px-3 py-2 text-sm font-semibold"
              } ${
                navActive
                  ? "is-active font-medium"
                  : parentActive
                    ? "is-section-active"
                    : ""
              }`}>
              <Icon className={`${depth === 1 ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0`} />
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
            aria-current={pathname === "/admin/settings" ? "page" : undefined}
            className={`soft-admin-nav-link flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
              activePathname === "/admin/settings" ? "is-active font-medium" : ""
            }`}>
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

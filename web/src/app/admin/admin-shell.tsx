"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  ChevronDown,
} from "lucide-react";
import type { Permission } from "@/lib/moderator-permissions";
import { useAdminNavCounts } from "./use-admin-nav-counts";
import { adminUrl, logoutUrl, toPathname } from "@/lib/subdomain";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  ADMIN_CURRENCY_STORAGE_KEY,
  ADMIN_PERIOD_STORAGE_KEY,
  adminNavigationPreferenceParams,
  appendAdminNavigationParams,
  restoreAdminCurrencyPreference,
  restoreAdminPeriodPreference,
  type AdminPeriodPreference,
} from "./admin-navigation-preferences";

interface NavItem {
  href: string;
  icon: ElementType;
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

  { href: adminUrl("/admin/support"),      icon: LifeBuoy,             label: "Поддержка", section: "support", level: 0, permission: "support.manage" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

const LEGACY_CANONICAL_PATHS: Record<string, string> = {
};

function canonicalAdminPath(pathname: string) {
  return LEGACY_CANONICAL_PATHS[pathname] ?? pathname;
}

// X9: section key for the sidebar unread badge, derived from the nav href.
function navCountKey(href: string): string | null {
  if (href.endsWith("/admin/support")) return "support";
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

const ADMIN_PREFERENCE_STORAGE_KEYS = [ADMIN_PERIOD_STORAGE_KEY, ADMIN_CURRENCY_STORAGE_KEY] as const;

function adminPreferenceSnapshot() {
  return JSON.stringify({
    period: restoreAdminPeriodPreference(),
    currency: restoreAdminCurrencyPreference(),
  });
}

function subscribeAdminPreferenceChanges(callback: () => void) {
  function handlePreferenceChange(event?: StorageEvent | Event) {
    if (
      event instanceof StorageEvent
      && event.key
      && !ADMIN_PREFERENCE_STORAGE_KEYS.includes(event.key as (typeof ADMIN_PREFERENCE_STORAGE_KEYS)[number])
    ) return;
    callback();
  }

  window.addEventListener("storage", handlePreferenceChange);
  window.addEventListener("eterapy-admin-preferences", handlePreferenceChange);
  return () => {
    window.removeEventListener("storage", handlePreferenceChange);
    window.removeEventListener("eterapy-admin-preferences", handlePreferenceChange);
  };
}

function useAdminNavigationHref() {
  const searchParams = useSearchParams();
  const preferenceSnapshot = useSyncExternalStore(subscribeAdminPreferenceChanges, adminPreferenceSnapshot, () => "{}");
  const preferences = useMemo(() => {
    try {
      return JSON.parse(preferenceSnapshot) as { period?: AdminPeriodPreference | null; currency?: "RUB" | "USD" | null };
    } catch {
      return {};
    }
  }, [preferenceSnapshot]);

  return useMemo(() => {
    const params = adminNavigationPreferenceParams(new URLSearchParams(searchParams.toString()), preferences.period ?? null, preferences.currency ?? null);
    return (href: string) => appendAdminNavigationParams(href, params);
  }, [preferences.currency, preferences.period, searchParams]);
}

export function AdminShell({
  user,
  role,
  permissions,
  counts: initialCounts,
  children,
}: {
  user: { name?: string | null; email?: string | null } | undefined;
  role: string;
  permissions: Permission[];
  counts?: Record<string, number>;
  children: ReactNode;
}) {
  // INC-065 (round 2): keep the sidebar badges live — the SSR value is only
  // the first paint; mutations, tab focus and a backstop poll re-sync it.
  const counts = useAdminNavCounts(initialCounts);
  const pathname = usePathname();
  const hrefForNav = useAdminNavigationHref();
  const activePathname = canonicalAdminPath(pathname);
  const isSuperAdmin = role === "SUPERADMIN";
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  // Фильтруем: суперадмин-only скрываем для ADMIN; permission-protected скрываем если нет полномочия
  const nav = visibleNavEntries(NAV_ITEMS, permissions, isSuperAdmin);
  const navItems = nav;

  const mobileSectionNav = navItems.filter((item) => (item.level ?? 0) === 0);

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/admin") return activePathname === itemPath;
    if (itemPath === "/admin/ops") return activePathname === itemPath;
    return activePathname === itemPath || activePathname.startsWith(`${itemPath}/`);
  }

  function isExactActive(href: string) {
    return activePathname === toPathname(href);
  }

  function isSectionActive(item: NavItem) {
    if ((item.level ?? 0) !== 0 || item.section === "workspace") return false;
    return navItems.some((candidate) => candidate.section === item.section && isActive(candidate.href));
  }

  const topLevelNav = navItems.filter((item) => (item.level ?? 0) === 0);
  const activeSectionKey = navItems.find((item) => item.section !== "workspace" && isActive(item.href))?.section
    ?? navItems.find((item) => isExactActive(item.href))?.section
    ?? "workspace";
  const [openSections, setOpenSections] = useState<Set<NavItem["section"]>>(() => new Set(["workspace", activeSectionKey]));

  function toggleSection(section: NavItem["section"]) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const navLabelByPath = new Map(navItems.map((item) => [toPathname(item.href), item.label]));
  const currentTopLevelItem = mobileSectionNav.find((item) => item.section !== "workspace" && isActive(item.href))
    ?? mobileSectionNav.find((item) => isExactActive(item.href))
    ?? mobileSectionNav[0];
  const mobilePageNav = currentTopLevelItem
    ? navItems.filter((item) => item.section === currentTopLevelItem.section)
    : navItems.filter((item) => (item.level ?? 0) === 0);
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
        className="admin-shell-sidebar soft-admin-sidebar hidden h-[calc(100vh-var(--header-height))] w-64 shrink-0 overflow-hidden px-3 py-5 md:fixed md:bottom-0 md:left-0 md:top-[var(--header-height)] md:z-30 md:flex md:flex-col"
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

        <nav data-testid="admin-shell-nav-scroll" className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {topLevelNav.map((item) => {
            const Icon = item.icon;
            const countKey = navCountKey(item.href);
            const count = countKey ? (counts?.[countKey] ?? 0) : 0;
            const exactActive = isExactActive(item.href);
            const active = isActive(item.href);
            const parentActive = isSectionActive(item) && !exactActive;
            const navActive = active || parentActive;
            const childrenForSection = navItems.filter((candidate) => candidate.section === item.section && (candidate.level ?? 0) === 1);
            const expanded = childrenForSection.length === 0 || openSections.has(item.section) || item.section === activeSectionKey;
            return (
              <div key={item.href} className="space-y-0.5">
                <Link key={item.href} href={hrefForNav(item.href)}
                  data-testid={childrenForSection.length > 0 ? "admin-shell-nav-section-toggle" : "admin-shell-nav-item"}
                  data-depth={0}
                  aria-current={exactActive ? "page" : undefined}
                  aria-expanded={childrenForSection.length > 0 ? expanded : undefined}
                  onClick={() => {
                    if (childrenForSection.length > 0) toggleSection(item.section);
                  }}
                  className={`admin-shell-item soft-admin-nav-link mt-2 flex min-h-10 items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition-colors duration-[var(--motion-base)] ${
                    navActive
                      ? "is-active font-medium"
                      : parentActive
                        ? "is-section-active"
                        : ""
                  }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] px-1.5 text-[11px] font-bold text-[var(--soft-bordeaux)] tabular-nums"
                      data-testid="admin-nav-counter"
                      aria-label={`${count} новых`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                  {childrenForSection.length > 0 ? (
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-[var(--motion-base)] ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                  ) : null}
                </Link>
                {childrenForSection.length > 0 && expanded ? (
                  <div className="space-y-0.5 pb-1" data-testid="admin-shell-nav-section-items">
                    {childrenForSection.map((child) => {
                      const ChildIcon = child.icon;
                      const childCountKey = navCountKey(child.href);
                      const childCount = childCountKey ? (counts?.[childCountKey] ?? 0) : 0;
                      const childExactActive = isExactActive(child.href);
                      const childActive = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={hrefForNav(child.href)}
                          data-testid="admin-shell-nav-item"
                          data-depth={1}
                          aria-current={childExactActive ? "page" : undefined}
                          className={`admin-shell-item soft-admin-nav-link ml-5 flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-xs transition-colors duration-[var(--motion-base)] ${
                            childActive ? "is-active font-medium" : ""
                          }`}
                        >
                          <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{child.label}</span>
                          {childCount > 0 && (
                            <span
                              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] px-1.5 text-[11px] font-bold text-[var(--soft-bordeaux)] tabular-nums"
                              data-testid="admin-nav-counter"
                              aria-label={`${childCount} новых`}
                            >
                              {childCount > 99 ? "99+" : childCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
          )})}
        </nav>

        <div data-testid="admin-shell-sidebar-footer" className="mt-auto shrink-0 border-t border-[var(--soft-paper-edge)] pt-2">
          <Link href={hrefForNav(adminUrl("/admin/settings"))}
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
        {mobileSectionNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={hrefForNav(item.href)}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors duration-[var(--motion-base)] ${
                isActive(item.href) ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]"
              }`}>
              <Icon className="h-5 w-5" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      <main data-testid="admin-shell-main" className="min-w-0 flex-1 pb-20 md:pl-64 md:pb-0">
        <div className="border-b border-[var(--soft-paper-edge)] bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">
              <span>Текущий раздел</span>
              <select
                data-testid="admin-shell-mobile-section-select"
                aria-label="Текущий раздел"
                className="h-10 rounded-[var(--radius-control)] border border-[var(--soft-paper-edge)] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[var(--soft-ink)] shadow-[var(--soft-shadow-sm)]"
                value={currentTopLevelItem ? toPathname(currentTopLevelItem.href) : ""}
                onChange={(event) => {
                  if (event.target.value) window.location.href = hrefForNav(adminUrl(event.target.value));
                }}
              >
                {mobileSectionNav.map((item) => (
                  <option key={item.href} value={toPathname(item.href)}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">
              <span>Страница раздела</span>
              <select
                data-testid="admin-shell-mobile-page-select"
                aria-label="Страница раздела"
                className="h-10 rounded-[var(--radius-control)] border border-[var(--soft-paper-edge)] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[var(--soft-ink)] shadow-[var(--soft-shadow-sm)]"
                value={mobilePageNav.some((item) => isExactActive(item.href)) ? activePathname : (currentTopLevelItem ? toPathname(currentTopLevelItem.href) : "")}
                onChange={(event) => {
                  if (event.target.value) window.location.href = hrefForNav(adminUrl(event.target.value));
                }}
              >
                {mobilePageNav.map((item) => (
                  <option key={item.href} value={toPathname(item.href)}>
                    {(item.level ?? 0) === 1 ? `- ${item.label}` : item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
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

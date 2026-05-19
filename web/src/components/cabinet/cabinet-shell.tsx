"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Compass,
  Sparkles,
  MessageCircle,
  History,
  Wallet,
  Settings,
  UserPen,
  Star,
  Banknote,
  Bookmark,
  Lock,
  LogOut,
} from "lucide-react";
import { BrandSignature } from "@/components/brand/brand-mark";
import { appUrl, logoutUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const CLIENT_NAV: NavItem[] = [
  { href: appUrl("/cabinet"), icon: LayoutDashboard, label: "Главная" },
  { href: appUrl("/cabinet/action-history"), icon: Compass, label: "Моя карта" },
  { href: appUrl("/cabinet/questions"), icon: History, label: "История разборов" },
  { href: appUrl("/cabinet/bookings"), icon: CalendarDays, label: "Записи" },
  { href: appUrl("/cabinet/billing#credits"), icon: Sparkles, label: "Кредиты ясности" },
  { href: appUrl("/cabinet/billing"), icon: Wallet, label: "Подписка и оплата" },
  { href: appUrl("/cabinet/settings"), icon: Settings, label: "Настройки" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: appUrl("/cabinet/practitioner"), icon: LayoutDashboard, label: "Сводка" },
  { href: appUrl("/cabinet/practitioner/profile"), icon: UserPen, label: "Мой профиль" },
  { href: appUrl("/cabinet/practitioner/services"), icon: Bookmark, label: "Услуги и цены" },
  { href: appUrl("/cabinet/practitioner/schedule"), icon: CalendarDays, label: "Расписание" },
  { href: appUrl("/cabinet/practitioner/requests"), icon: MessageCircle, label: "Заявки" },
  { href: appUrl("/cabinet/practitioner/clients"), icon: Users, label: "Клиенты" },
  { href: appUrl("/cabinet/practitioner/earnings"), icon: Banknote, label: "Выплаты" },
  { href: appUrl("/cabinet/practitioner/reviews"), icon: Star, label: "Отзывы" },
  { href: appUrl("/cabinet/practitioner/ethics"), icon: Lock, label: "Этический кодекс" },
];

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Администратор",
};

export function CabinetShell({
  role,
  user,
  children,
}: {
  role: string;
  user: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = (role === "ADMIN" || role === "SUPERADMIN")
    ? []
    : role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV;
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  const activePathname = toCabinetPathname(pathname);

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/cabinet" || itemPath === "/cabinet/practitioner") return activePathname === itemPath;
    return activePathname.startsWith(itemPath);
  }

  // Для мобильной навигации — первые 4 пункта.
  const mobileNav = nav.slice(0, 4);

  return (
    <div data-testid="app-shell" data-shell-role={role} className="soft-clarity-page soft-app-shell min-h-screen">
      <div className="soft-shell soft-app-layout">
      {/* Sidebar — v4 card-style navigation */}
      <aside
        data-testid="app-shell-sidebar"
        data-shell-role={role}
        className="sticky top-16 hidden shrink-0 self-start md:flex"
      >
        <div className="soft-app-sidebar-card flex flex-col overflow-y-auto p-3.5">
          <div className="mb-4 border-b border-[var(--soft-paper-edge,rgba(60,30,20,0.1))] px-2 pb-4">
            <BrandSignature compact theme="light" />
          </div>

          {/* User badge */}
          <div className="mb-4 border-b border-[var(--soft-paper-edge,rgba(60,30,20,0.1))] px-2 pb-4" data-testid="app-shell-user">
            <div className="flex items-center gap-3">
              <div className="soft-app-avatar flex h-10 w-10 shrink-0 items-center justify-center text-sm font-semibold">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.name ?? "Мой кабинет"}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}
                  data-testid="app-shell-nav-item"
                  className={`soft-app-nav-link flex min-h-11 items-center gap-2.5 rounded-[var(--soft-radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                    isActive(item.href)
                      ? "is-active font-medium"
                      : ""
                  }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Sign out */}
          <div className="mt-2 border-t border-border/20 pt-2">
            <button
              onClick={() => { window.location.href = logoutUrl(); }}
              className="soft-app-nav-link flex min-h-11 w-full items-center gap-2.5 rounded-[var(--soft-radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)]"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile nav */}
      <div data-testid="app-shell-mobile-nav" className="soft-app-mobile-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden">
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

      {/* Main */}
      <main data-testid="app-shell-main" className="soft-app-main min-w-0 pb-20 md:pb-0">
        {children}
      </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Compass,
  History,
  Wallet,
  Settings,
  UserPen,
  Star,
  Banknote,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { appUrl, logoutUrl, toPathname } from "@/lib/subdomain";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const CLIENT_NAV: NavItem[] = [
  { href: appUrl("/cabinet"), icon: LayoutDashboard, label: "Обзор" },
  { href: appUrl("/cabinet/practitioners"), icon: Users, label: "Практики" },
  { href: appUrl("/cabinet/bookings"), icon: CalendarDays, label: "Мои записи" },
  { href: appUrl("/cabinet/modalities"), icon: Compass, label: "Направления" },
  { href: appUrl("/cabinet/action-history"), icon: History, label: "История действий" },
  { href: appUrl("/cabinet/billing"), icon: Wallet, label: "Баланс и оплата" },
  { href: appUrl("/help"), icon: HelpCircle, label: "Помощь" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: appUrl("/cabinet/practitioner"), icon: LayoutDashboard, label: "Обзор" },
  { href: appUrl("/cabinet/practitioner/profile"), icon: UserPen, label: "Мой профиль" },
  { href: appUrl("/cabinet/practitioner/schedule"), icon: CalendarDays, label: "Расписание" },
  { href: appUrl("/cabinet/practitioner/clients"), icon: Users, label: "Клиенты" },
  { href: appUrl("/cabinet/practitioner/reviews"), icon: Star, label: "Отзывы" },
  { href: appUrl("/cabinet/practitioner/earnings"), icon: Banknote, label: "Выплаты" },
  { href: appUrl("/help"), icon: HelpCircle, label: "Помощь" },
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

  function isActive(href: string) {
    const itemPath = toPathname(href);
    if (itemPath === "/cabinet" || itemPath === "/cabinet/practitioner") return pathname === itemPath;
    return pathname.startsWith(itemPath);
  }

  // Для мобильного навигации — первые 4 пункта + Баланс (5)
  const mobileNav = nav.slice(0, 4);

  return (
    <div data-testid="app-shell" className="flex min-h-screen bg-background">
      {/* Sidebar — sticky, own scroll */}
      <aside
        data-testid="app-shell-sidebar"
        className="sticky hidden h-[calc(100vh-var(--header-height))] w-56 shrink-0 flex-col overflow-y-auto border-r border-border/20 bg-card/45 px-3 py-6 shadow-[var(--shadow-surface)] md:flex"
        style={{ top: "var(--header-height)" }}
      >
        {/* User badge + Notifications */}
        <div className="mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-warm-gold/15 text-sm font-semibold text-brand-soft-gold">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name ?? "Пользователь"}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                data-testid="app-shell-nav-item"
                className={`flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                  isActive(item.href)
                    ? "bg-brand-warm-gold/12 text-brand-soft-gold font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Divider + Settings + Sign out */}
        <div className="mt-2 border-t border-border/20 pt-2">
          <Link
            href={appUrl("/cabinet/settings")}
            className={`flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
              isActive(appUrl("/cabinet/settings"))
                ? "bg-brand-warm-gold/12 text-brand-soft-gold font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Настройки
          </Link>
          <button
            onClick={() => { window.location.href = logoutUrl(); }}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted-foreground transition-colors duration-[var(--motion-base)] hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile nav */}
      <div data-testid="app-shell-mobile-nav" className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/20 bg-navy/95 backdrop-blur-sm md:hidden">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors duration-[var(--motion-base)] ${
                isActive(item.href) ? "text-brand-soft-gold" : "text-muted-foreground"
              }`}>
              <Icon className="h-5 w-5" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      {/* Main */}
      <main data-testid="app-shell-main" className="min-w-0 flex-1 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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
import { NotificationBell } from "@/components/notification-bell";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const CLIENT_NAV: NavItem[] = [
  { href: "/cabinet", icon: LayoutDashboard, label: "Обзор" },
  { href: "/cabinet/practitioners", icon: Users, label: "Практики" },
  { href: "/cabinet/bookings", icon: CalendarDays, label: "Мои записи" },
  { href: "/cabinet/modalities", icon: Compass, label: "Направления" },
  { href: "/cabinet/action-history", icon: History, label: "История действий" },
  { href: "/cabinet/billing", icon: Wallet, label: "Баланс и оплата" },
  { href: "/help", icon: HelpCircle, label: "Помощь" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: "/cabinet/practitioner", icon: LayoutDashboard, label: "Обзор" },
  { href: "/cabinet/practitioner/profile", icon: UserPen, label: "Мой профиль" },
  { href: "/cabinet/practitioner/schedule", icon: CalendarDays, label: "Расписание" },
  { href: "/cabinet/practitioner/clients", icon: Users, label: "Клиенты" },
  { href: "/cabinet/practitioner/reviews", icon: Star, label: "Отзывы" },
  { href: "/cabinet/practitioner/earnings", icon: Banknote, label: "Выплаты" },
  { href: "/help", icon: HelpCircle, label: "Помощь" },
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
    if (href === "/cabinet" || href === "/cabinet/practitioner") return pathname === href;
    return pathname.startsWith(href);
  }

  // Для мобильного навигации — первые 4 пункта + Баланс (5)
  const mobileNav = nav.slice(0, 4);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — sticky, own scroll */}
      <aside
        className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6 sticky h-[calc(100vh-var(--header-height))] overflow-y-auto"
        style={{ top: "var(--header-height)" }}
      >
        {/* User badge + Notifications */}
        <div className="mb-6 px-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.name ?? "Пользователь"}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
              </div>
            </div>
            <NotificationBell variant="cabinet" />
          </div>
        </div>

        {/* Nav */}
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
            );
          })}
        </nav>

        {/* Divider + Settings + Sign out */}
        <div className="mt-2 border-t border-border/20 pt-2">
          <Link
            href="/cabinet/settings"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors w-full ${
              isActive("/cabinet/settings")
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Настройки
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors w-full"
          >
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

      {/* Main */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}

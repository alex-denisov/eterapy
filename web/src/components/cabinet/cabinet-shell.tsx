"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface NavItem { href: string; icon: string; label: string; }

const CLIENT_NAV: NavItem[] = [
  { href: "/cabinet", icon: "🏠", label: "Обзор" },
  { href: "/cabinet/practitioners", icon: "🔮", label: "Практики" },
  { href: "/cabinet/bookings", icon: "📅", label: "Мои записи" },
  { href: "/cabinet/tools", icon: "✦", label: "Инструменты" },
  { href: "/cabinet/billing", icon: "💳", label: "Оплата и тарифы" },
  { href: "/cabinet/settings", icon: "⚙️", label: "Настройки" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: "/cabinet/practitioner", icon: "🏠", label: "Обзор" },
  { href: "/cabinet/practitioner/schedule", icon: "📅", label: "Расписание" },
  { href: "/cabinet/practitioner/clients", icon: "👤", label: "Клиенты" },
  { href: "/cabinet/practitioner/reviews", icon: "★", label: "Отзывы" },
  { href: "/cabinet/practitioner/earnings", icon: "💰", label: "Выплаты" },
  { href: "/cabinet/settings", icon: "⚙️", label: "Настройки" },
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
  // ADMIN и SUPERADMIN не должны видеть клиентскую навигацию — их страница /admin
  const nav = (role === "ADMIN" || role === "SUPERADMIN")
    ? []
    : role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV;
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  function isActive(href: string) {
    if (href === "/cabinet" || href === "/cabinet/practitioner") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — sticky, own scroll */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        {/* User badge */}
        <div className="mb-6 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold text-sm">
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

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors mt-2">
          <span className="text-base">🚪</span>
          Выйти
        </button>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-border/20 bg-navy/95 backdrop-blur-sm">
        {nav.slice(0, 4).map((item) => (
          <Link key={item.href} href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
              isActive(item.href) ? "text-primary" : "text-muted-foreground"
            }`}>
            <span className="text-lg">{item.icon}</span>
            {item.label.split(" ")[0]}
          </Link>
        ))}
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}

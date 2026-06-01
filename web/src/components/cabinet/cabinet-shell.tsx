"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Leaf,
  Crown,
} from "lucide-react";
import { appUrl, logoutUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const CLIENT_NAV: NavItem[] = [
  { href: appUrl("/"), icon: LayoutDashboard, label: "Главная" },
  { href: appUrl("/action-history"), icon: Compass, label: "Моя карта" },
  { href: appUrl("/questions"), icon: History, label: "История разборов" },
  { href: appUrl("/bookings"), icon: CalendarDays, label: "Записи" },
  { href: appUrl("/credits"), icon: Sparkles, label: "Кредиты ясности" },
  { href: appUrl("/practice"), icon: Leaf, label: "Практика ясности" },
  { href: appUrl("/billing"), icon: Wallet, label: "Подписка и оплата" },
  { href: appUrl("/settings"), icon: Settings, label: "Настройки" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: appUrl("/practitioner"), icon: LayoutDashboard, label: "Сводка" },
  { href: appUrl("/practitioner/profile"), icon: UserPen, label: "Настройки" },
  { href: appUrl("/practitioner/services"), icon: Bookmark, label: "Услуги и цены" },
  { href: appUrl("/practitioner/schedule"), icon: CalendarDays, label: "Расписание" },
  { href: appUrl("/practitioner/requests"), icon: MessageCircle, label: "Заявки" },
  { href: appUrl("/practitioner/clients"), icon: Users, label: "Клиенты" },
  { href: appUrl("/practitioner/earnings"), icon: Banknote, label: "Баланс" },
  { href: appUrl("/practitioner/subscription"), icon: Crown, label: "Подписка" },
  { href: appUrl("/practitioner/reviews"), icon: Star, label: "Отзывы" },
  { href: appUrl("/practitioner/ethics"), icon: Lock, label: "Этический кодекс" },
];

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Администратор",
};

export function CabinetShell({
  role,
  user,
  subscriptionLabel,
  children,
}: {
  role: string;
  user: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  subscriptionLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = (role === "ADMIN" || role === "SUPERADMIN")
    ? []
    : role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV;
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  // Wait until after hydration before reading usePathname(): on the
  // app subdomain SSR sees the proxy-rewritten "/cabinet" path while
  // the client's URL bar is "/", so any sidebar Link styled with
  // `is-active` on the server flipped class names on hydration and
  // caused React #418. Once mounted the proxy contract guarantees
  // both server and client converge on the cabinet pathname.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Intentional post-mount flip — see header.tsx comment. Required
    // to keep `usePathname()` consistent between SSR (proxy-rewritten
    // /cabinet) and the first client render (URL bar "/") and avoid
    // React #418.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  const activePathname = hydrated ? toCabinetPathname(pathname) : "";

  const [fetchedSubLabel, setFetchedSubLabel] = useState<string | null>(null);
  useEffect(() => {
    if (subscriptionLabel !== undefined) return;
    const RU_M = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    fetch("/api/billing/subscriptions")
      .then((r) => r.json())
      .then((data) => {
        const now = new Date();
        const active = (data.subscriptions ?? []).find((s: { status: string; currentPeriodEnd?: string | null }) =>
          ["TRIALING", "ACTIVE"].includes(s.status) &&
          (!s.currentPeriodEnd || new Date(s.currentPeriodEnd) > now),
        );
        if (!active) { setFetchedSubLabel("Бесплатный"); return; }
        const plan = (data.plans ?? []).find((p: { key: string; name: string }) => p.key === active.planKey);
        const name: string = plan?.name ?? active.planKey;
        if (active.currentPeriodEnd) {
          const d = new Date(active.currentPeriodEnd);
          setFetchedSubLabel(`${name} · до ${d.getDate()} ${RU_M[d.getMonth()]}`);
        } else {
          setFetchedSubLabel(name);
        }
      })
      .catch(() => setFetchedSubLabel(null));
  }, [subscriptionLabel]);

  const displaySubLabel = subscriptionLabel ?? fetchedSubLabel ?? ROLE_LABELS[role] ?? role;

  function isActive(href: string) {
    if (!hydrated || !activePathname) return false;
    const itemPath = toPathname(href);
    // Normalize both sides: incoming href may be "/" (root cabinet) or
    // "/X" (no /cabinet prefix), while activePathname comes from
    // toCabinetPathname() which still adds the /cabinet/ form for the
    // server-rendered pathname. Reduce both to the bare /X form first.
    const stripCabinet = (path: string) => path === "/cabinet" ? "/" : path.startsWith("/cabinet/") ? path.slice("/cabinet".length) : path;
    const normItem = stripCabinet(itemPath);
    const normActive = stripCabinet(activePathname);
    if (normItem === "/" || normItem === "/practitioner") return normActive === normItem;
    return normActive.startsWith(normItem);
  }

  // Для мобильной навигации — первые 4 пункта.
  const mobileNav = nav.slice(0, 4);

  return (
    <div data-testid="app-shell" data-shell-role={role} className="soft-clarity-page soft-app-shell min-h-screen">
      <div className="soft-shell soft-app-layout">
      {/* Sidebar — v4.2 card-style navigation */}
      <aside
        data-testid="app-shell-sidebar"
        data-shell-role={role}
        className="sticky top-16 hidden shrink-0 self-start md:flex"
      >
        <div className="soft-app-sidebar-card flex flex-col overflow-y-auto p-3.5">
          {/* User badge */}
          <div className="mb-4 border-b border-[var(--soft-paper-edge,rgba(60,30,20,0.1))] px-2 pb-4" data-testid="app-shell-user">
            <div className="flex items-center gap-3">
              <div className="soft-app-avatar flex h-10 w-10 shrink-0 items-center justify-center text-base font-semibold" style={{ fontFamily: "var(--font-heading-v4)" }}>
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Мой кабинет</p>
                <p className="text-xs text-muted-foreground">{displaySubLabel}</p>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  CalendarDays,
  MessageCircle,
  Wallet,
  Settings,
  UserPen,
  Star,
  Banknote,
  Bookmark,
  Lock,
  LogOut,
  LifeBuoy,
  Gift,
  Crown,
  Handshake,
} from "lucide-react";
import { appUrl, logoutUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";
import {
  CLIENT_MOBILE_TABS,
  CLIENT_MORE_ITEMS,
  MORE_LABEL,
  LOGOUT_LABEL,
} from "@/lib/nav-model";
import { NAV_ICONS } from "@/components/nav/nav-icons";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

interface MobileRenderTab {
  href: string;
  label: string;
  Icon: React.ElementType;
  isMore: boolean;
  activeHrefs?: string[];
}

// B464 IB0 — 6-item client cabinet sidebar. «Подписка и оплата» merged into
// «Кошелёк» (IB3); «Приглашения» added; distinct icons (no Wallet duplicate).
// The cross-shell «Услуги/Специалисты/Библиотека» links live in the header
// bridge, not the sidebar. «Помощь»/«Выйти» render as utility rows below.
const CLIENT_NAV: NavItem[] = [
  { href: appUrl("/"), icon: LayoutDashboard, label: "Главная" },
  // M26/B369: «Моя карта» + «История разборов» слиты в один пункт «Дневник».
  { href: appUrl("/diary"), icon: BookOpen, label: "Дневник" },
  // B349/Механика 2: /credits merged into /wallet — one «Кошелёк» nav item.
  { href: appUrl("/wallet"), icon: Wallet, label: "Кошелёк" },
  { href: appUrl("/bookings"), icon: CalendarDays, label: "Записи" },
  { href: appUrl("/invite"), icon: Gift, label: "Приглашения" },
  { href: appUrl("/settings"), icon: Settings, label: "Настройки" },
];

const PRACTITIONER_NAV: NavItem[] = [
  { href: appUrl("/practitioner"), icon: LayoutDashboard, label: "Сводка" },
  { href: appUrl("/practitioner/services"), icon: Bookmark, label: "Услуги и цены" },
  { href: appUrl("/practitioner/schedule"), icon: CalendarDays, label: "Расписание" },
  { href: appUrl("/practitioner/requests"), icon: MessageCircle, label: "Заявки" },
  { href: appUrl("/practitioner/clients"), icon: Users, label: "Клиенты" },
  { href: appUrl("/practitioner/earnings"), icon: Banknote, label: "Баланс" },
  { href: appUrl("/practitioner/invite"), icon: Handshake, label: "Приведите клиента" },
  { href: appUrl("/practitioner/subscription"), icon: Crown, label: "Подписка" },
  { href: appUrl("/practitioner/reviews"), icon: Star, label: "Отзывы" },
  { href: appUrl("/practitioner/ethics"), icon: Lock, label: "Этический кодекс" },
  // X7: «Настройки» sits at the bottom of the nav, matching the client cabinet.
  { href: appUrl("/practitioner/profile"), icon: UserPen, label: "Настройки" },
];

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Администратор",
};

// X10: section key for the practitioner sidebar «непрочитанные» badge.
function navCountKey(href: string): string | null {
  if (href.endsWith("/practitioner/requests")) return "requests";
  if (href.endsWith("/practitioner/clients")) return "clients";
  if (href.endsWith("/practitioner/reviews")) return "reviews";
  return null;
}

export function CabinetShell({
  role,
  user,
  subscriptionLabel,
  counts,
  children,
}: {
  role: string;
  user: { name?: string | null; email?: string | null; image?: string | null } | undefined;
  subscriptionLabel?: string;
  counts?: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isClient = role === "CLIENT";
  const nav = (role === "ADMIN" || role === "SUPERADMIN")
    ? []
    : role === "PRACTITIONER" ? PRACTITIONER_NAV : CLIENT_NAV;
  const diaryHref = appUrl("/diary");
  const supportHref = appUrl("/support");
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";
  // Wait until after hydration before reading usePathname(): on the
  // app subdomain SSR sees the proxy-rewritten "/cabinet" path while
  // the client's URL bar is "/", so any sidebar Link styled with
  // `is-active` on the server flipped class names on hydration and
  // caused React #418. Once mounted the proxy contract guarantees
  // both server and client converge on the cabinet pathname.
  const [hydrated, setHydrated] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
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

  // B464 IB0 — the client mobile bar is sourced from the shared nav-model so it
  // is byte-identical to the landing bar; practitioner/admin keep their first-4
  // nav items. The «Ещё» tab opens a bottom sheet instead of navigating.
  const mobileTabs: MobileRenderTab[] = isClient
    ? CLIENT_MOBILE_TABS.map((t) => ({
        href: t.href,
        label: t.label,
        Icon: NAV_ICONS[t.iconKey],
        isMore: t.label === MORE_LABEL,
        activeHrefs:
          t.label === MORE_LABEL
            ? CLIENT_MORE_ITEMS.map((m) => m.href).filter(Boolean)
            : undefined,
      }))
    : nav.filter((_, index) => index < 4).map((n) => ({
        href: n.href,
        label: n.label,
        Icon: n.icon,
        isMore: false,
      }));

  function isMobileActive(item: MobileRenderTab) {
    if (item.isMore) return (item.activeHrefs ?? []).some((href) => isActive(href));
    if (!item.href) return false;
    return isActive(item.href);
  }

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
              const countKey = navCountKey(item.href);
              const count = countKey ? (counts?.[countKey] ?? 0) : 0;
              // B464 round-2 #4: the «Дневник» item carries a small lock glyph
              // inviting the user to set their own PIN (device-level privacy).
              const isDiary = isClient && item.href === diaryHref;
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
                  {isDiary && (
                    <Lock
                      className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--soft-ink-faint)]"
                      aria-label="Можно закрыть PIN-кодом"
                      data-testid="app-shell-diary-lock"
                    />
                  )}
                  {count > 0 && (
                    <span
                      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] px-1.5 text-[11px] font-bold text-[var(--soft-bordeaux)] tabular-nums"
                      data-testid="app-nav-counter"
                      aria-label={`${count} новых`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Utility rows — Помощь + Выйти, present on every cabinet page (B464 #9/#10) */}
          <div className="mt-2 space-y-1 border-t border-border/20 pt-2">
            {isClient && (
              <Link
                href={supportHref}
                data-testid="app-shell-nav-help"
                className={`soft-app-nav-link flex min-h-11 items-center gap-2.5 rounded-[var(--soft-radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                  isActive(supportHref) ? "is-active font-medium" : ""
                }`}
              >
                <LifeBuoy className="h-4 w-4 shrink-0" />
                Помощь
              </Link>
            )}
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

      {/* Mobile «Ещё» bottom sheet — client only */}
      {isClient && moreOpen && (
        <>
          <button
            type="button"
            aria-label="Закрыть меню"
            className="fixed inset-0 z-40 bg-[rgba(60,30,20,0.28)] md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div
            data-testid="app-shell-mobile-sheet"
            className="soft-mobile-sheet fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-50 md:hidden"
          >
            {CLIENT_MORE_ITEMS.map((item) => {
              const Icon = NAV_ICONS[item.iconKey];
              if (item.label === LOGOUT_LABEL) {
                return (
                  <button
                    key="more-logout"
                    type="button"
                    onClick={() => { setMoreOpen(false); window.location.href = logoutUrl(); }}
                    className="soft-mobile-sheet-row flex w-full items-center gap-3"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
                    {item.label}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="soft-mobile-sheet-row flex items-center gap-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Mobile nav */}
      <div data-testid="app-shell-mobile-nav" className="soft-app-mobile-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden">
        {mobileTabs.map((item) => {
          const Icon = item.Icon;
          const activeClass = isMobileActive(item) ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]";
          const base = `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors duration-[var(--motion-base)] ${activeClass}`;
          if (item.isMore) {
            return (
              <button
                key="more"
                type="button"
                data-testid="app-shell-mobile-more"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                className={base}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid="app-shell-mobile-tab"
              onClick={() => setMoreOpen(false)}
              className={base}
            >
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

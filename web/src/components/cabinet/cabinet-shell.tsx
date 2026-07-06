"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Wallet,
  Settings,
  CalendarDays,
  Lock,
  LockOpen,
  LogOut,
  CircleHelp,
  Gift,
} from "lucide-react";
import { appUrl, logoutUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";
import { DIARY_PIN_CHANGED_EVENT, hasDiaryPinStored } from "@/lib/diary-pin";
import {
  CLIENT_MOBILE_TABS,
  CLIENT_MORE_ITEMS,
  PRACTITIONER_TABS,
  PRACTITIONER_MORE_HREFS,
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

// B466 — «Practice cockpit» IA: the practitioner sidebar mirrors the 5-tab
// model (Сегодня · Клиенты · Календарь · Финансы · Ещё) from nav-model, the
// same source that drives the mobile bar, so desktop and mobile can't drift.
// Every former flat page lives on under «Ещё» (hub page + sub-routes).
const PRACTITIONER_NAV: NavItem[] = PRACTITIONER_TABS.map((tab) => ({
  href: tab.href,
  icon: NAV_ICONS[tab.iconKey],
  label: tab.label,
}));

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Администратор",
};

// X10: section key for the practitioner sidebar «непрочитанные» badge.
// B466: заявки live inside «Календарь», new reviews surface on «Ещё» (hub row).
function navCountKey(href: string): string | null {
  if (href.endsWith("/practitioner/calendar")) return "requests";
  if (href.endsWith("/practitioner/clients")) return "clients";
  if (href.endsWith("/practitioner/more")) return "reviews";
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

  // B464 round-4 #8: the Дневник lock mirrors the device PIN — open when no
  // PIN is set, closed once it is. localStorage is client-only, so SSR and the
  // first client render agree on `false` (open) and the real state lands
  // post-mount; PIN set/disable surfaces dispatch DIARY_PIN_CHANGED_EVENT.
  const [diaryPinSet, setDiaryPinSet] = useState(false);
  useEffect(() => {
    const sync = () => setDiaryPinSet(hasDiaryPinStored());
    sync();
    window.addEventListener(DIARY_PIN_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DIARY_PIN_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
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

  // B466: the practitioner «Ещё» sidebar item is an umbrella — it lights up on
  // the hub page and on every sub-section that lives under it.
  function isNavActive(item: { href: string; label: string }) {
    if (role === "PRACTITIONER" && item.label === MORE_LABEL) {
      return PRACTITIONER_MORE_HREFS.some((href) => isActive(href));
    }
    return isActive(item.href);
  }

  // B464 IB0 — the client mobile bar is sourced from the shared nav-model so it
  // is byte-identical to the landing bar. B466 — the practitioner bar carries
  // the full 5-tab «Practice cockpit» model; its «Ещё» navigates to the hub
  // page (with umbrella active-state) instead of opening a sheet.
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
    : role === "PRACTITIONER"
    ? PRACTITIONER_TABS.map((t) => ({
        href: t.href,
        label: t.label,
        Icon: NAV_ICONS[t.iconKey],
        isMore: false,
        activeHrefs: t.label === MORE_LABEL ? PRACTITIONER_MORE_HREFS : undefined,
      }))
    : nav.filter((_, index) => index < 4).map((n) => ({
        href: n.href,
        label: n.label,
        Icon: n.icon,
        isMore: false,
      }));

  function isMobileActive(item: MobileRenderTab) {
    if (item.activeHrefs?.length) return item.activeHrefs.some((href) => isActive(href));
    if (item.isMore || !item.href) return false;
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
              // B464 round-4 #8: the «Дневник» row carries a LIVE lock — open
              // (LockOpen) until the user sets a device PIN, closed (Lock) once
              // set. The glyph is its own link straight into the PIN setup.
              const isDiary = isClient && item.href === diaryHref;
              if (isDiary) {
                return (
                  <div key={item.href}
                    data-testid="app-shell-nav-item"
                    className={`soft-app-nav-link flex min-h-11 items-center rounded-[var(--soft-radius-md)] text-sm transition-colors duration-[var(--motion-base)] ${
                      isActive(item.href) ? "is-active font-medium" : ""
                    }`}>
                    <Link href={item.href} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                    <Link
                      href={appUrl("/diary?pin=setup")}
                      data-testid="app-shell-diary-lock"
                      data-pin-set={diaryPinSet ? "1" : "0"}
                      aria-label={diaryPinSet ? "Дневник закрыт PIN-кодом — настроить" : "Закрыть Дневник PIN-кодом"}
                      title={diaryPinSet ? "Дневник закрыт PIN-кодом — настроить" : "Закрыть Дневник PIN-кодом"}
                      className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-faint)] transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)]"
                    >
                      {diaryPinSet
                        ? <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        : <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                    </Link>
                  </div>
                );
              }
              return (
                <Link key={item.href} href={item.href}
                  data-testid="app-shell-nav-item"
                  className={`soft-app-nav-link flex min-h-11 items-center gap-2.5 rounded-[var(--soft-radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                    isNavActive(item)
                      ? "is-active font-medium"
                      : ""
                  }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
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

          {/* Utility rows — Помощь + Выйти, present on every cabinet page (B464 #9/#10).
              B466: the practitioner sidebar carries Помощь too (approved desktop mockup). */}
          <div className="mt-2 space-y-1 border-t border-border/20 pt-2">
            {(isClient || role === "PRACTITIONER") && (
              <Link
                href={supportHref}
                data-testid="app-shell-nav-help"
                className={`soft-app-nav-link flex min-h-11 items-center gap-2.5 rounded-[var(--soft-radius-md)] px-3 py-2 text-sm transition-colors duration-[var(--motion-base)] ${
                  isActive(supportHref) ? "is-active font-medium" : ""
                }`}
              >
                <CircleHelp className="h-4 w-4 shrink-0" />
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

      {/* Main — reserve the bottom bar height + the iPhone home-indicator inset
          so no content hides behind the frosted tab bar (audit A2). */}
      <main data-testid="app-shell-main" className="soft-app-main min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        {children}
      </main>
      </div>
    </div>
  );
}

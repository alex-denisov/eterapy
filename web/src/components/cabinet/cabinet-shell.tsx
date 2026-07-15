"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Mail,
  Wallet,
  Settings,
  CalendarDays,
  Lock,
  LockOpen,
  LogOut,
  CircleHelp,
  Gift,
  Sun,
  Users,
  UserRound,
  Briefcase,
  Sparkles,
  Star,
  ShieldCheck,
} from "lucide-react";
import { appUrl, logoutUrl, mainUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";
import { DIARY_PIN_CHANGED_EVENT, hasDiaryPinStored } from "@/lib/diary-pin";
import {
  CLIENT_MOBILE_TABS,
  CLIENT_MORE_HREFS,
  PRACTITIONER_TABS,
  PRACTITIONER_MORE_HREFS,
  MORE_LABEL,
} from "@/lib/nav-model";
import { NAV_ICONS } from "@/components/nav/nav-icons";
import { NotificationBell } from "@/components/notification-bell";
import { ClientBalanceChip } from "@/components/cabinet/client-balance-chip";
import { VectorBrandLogo } from "@/components/brand/brand-mark";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

interface MobileRenderTab {
  href: string;
  label: string;
  Icon: React.ElementType;
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
  // B478: односторонние материалы от специалиста (после «Записей»).
  { href: appUrl("/messages"), icon: Mail, label: "Сообщения" },
  { href: appUrl("/invite"), icon: Gift, label: "Приглашения" },
  { href: appUrl("/settings"), icon: Settings, label: "Настройки" },
];

interface NavGroup {
  heading?: string;
  items: NavItem[];
}

// B466 R9-5 — the practitioner DESKTOP sidebar is the owner-approved expanded
// cockpit: sections are NOT hidden under «Ещё» (there is room on desktop). The
// mobile bar stays the 5-tab model (PRACTITIONER_TABS → «Ещё» hub); only the
// desktop sidebar fans out into these three groups (1-to-1 with the approved
// `practitioner-desktop-today-v2` mockup + the `practitioner-more-hub` groups).
const PRACTITIONER_DESKTOP_GROUPS: NavGroup[] = [
  {
    items: [
      { href: appUrl("/practitioner"), icon: Sun, label: "Сегодня" },
      { href: appUrl("/practitioner/clients"), icon: Users, label: "Клиенты" },
      { href: appUrl("/practitioner/calendar"), icon: CalendarDays, label: "Календарь" },
      { href: appUrl("/practitioner/finance"), icon: Wallet, label: "Финансы" },
    ],
  },
  {
    heading: "Практика",
    items: [
      { href: appUrl("/practitioner/profile"), icon: UserRound, label: "Профиль" },
      { href: appUrl("/practitioner/services"), icon: Briefcase, label: "Услуги" },
      { href: appUrl("/practitioner/ai-usage"), icon: Sparkles, label: "Разборы и AI" },
      { href: appUrl("/practitioner/reviews"), icon: Star, label: "Отзывы" },
      { href: appUrl("/practitioner/invite"), icon: Gift, label: "Приглашения" },
    ],
  },
  {
    heading: "Аккаунт",
    items: [
      { href: appUrl("/practitioner/settings"), icon: Settings, label: "Настройки" },
      { href: appUrl("/practitioner/ethics"), icon: ShieldCheck, label: "Этика и безопасность" },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Администратор",
};

// B466 R9-5 — «проваливание» на уровень ниже: страницы, у которых нет своего
// пункта в сайдбаре, но которые логически принадлежат разделу, подсвечивают
// этот раздел активным (напр. /sessions/[id] открывается из «Клиентов»,
// /verification — из «Профиля», /crisis — из «Этики»). Путь → родительский href.
const PRACTITIONER_SUBROUTE_PARENTS: Array<[string, string]> = [
  ["/practitioner/sessions", "/practitioner/clients"],
  ["/practitioner/verification", "/practitioner/profile"],
  ["/practitioner/crisis", "/practitioner/ethics"],
];

// X10: section key for the practitioner sidebar «непрочитанные» badge.
// B466 R9-5: заявки live inside «Календарь»; the expanded desktop sidebar
// surfaces new reviews directly on «Отзывы» (the mobile «Ещё» hub still shows
// them on its own row). The «Ещё» hub key stays mapped for the mobile bar.
function navCountKey(href: string): string | null {
  if (href.endsWith("/practitioner/calendar")) return "requests";
  if (href.endsWith("/practitioner/clients")) return "clients";
  if (href.endsWith("/practitioner/reviews")) return "reviews";
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
  const isPractitionerBar = role === "PRACTITIONER";
  // Flat sidebar list for the client (the practitioner desktop sidebar is
  // grouped — see PRACTITIONER_DESKTOP_GROUPS — and admin has its own shell).
  const nav = role === "CLIENT" ? CLIENT_NAV : [];
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
    let normActive = stripCabinet(activePathname);
    // Drill-down pages без своего пункта в сайдбаре подсвечивают родительский
    // раздел (B466): /sessions→Клиенты, /verification→Профиль, /crisis→Этика.
    if (role === "PRACTITIONER") {
      for (const [child, parent] of PRACTITIONER_SUBROUTE_PARENTS) {
        if (normActive === child || normActive.startsWith(`${child}/`)) {
          normActive = parent;
          break;
        }
      }
    }
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
  // is byte-identical to the landing bar. B466/B512 — BOTH bars now navigate
  // from «Ещё» to a real hub page (/practitioner/more, /cabinet/more) with an
  // umbrella active-state; the client bottom-sheet is gone (owner: page).
  const mobileTabs: MobileRenderTab[] = isClient
    ? CLIENT_MOBILE_TABS.map((t) => ({
        href: t.href,
        label: t.label,
        Icon: NAV_ICONS[t.iconKey],
        isMore: false,
        activeHrefs: t.label === MORE_LABEL ? CLIENT_MORE_HREFS : undefined,
      }))
    : role === "PRACTITIONER"
    ? PRACTITIONER_TABS.map((t) => ({
        href: t.href,
        label: t.label,
        Icon: NAV_ICONS[t.iconKey],
        activeHrefs: t.label === MORE_LABEL ? PRACTITIONER_MORE_HREFS : undefined,
      }))
    : nav.filter((_, index) => index < 4).map((n) => ({
        href: n.href,
        label: n.label,
        Icon: n.icon,
      }));

  function isMobileActive(item: MobileRenderTab) {
    if (item.activeHrefs?.length) return item.activeHrefs.some((href) => isActive(href));
    if (!item.href) return false;
    return isActive(item.href);
  }

  // Shared sidebar row renderer — used flat for the client and per-group for
  // the practitioner (PRACTITIONER_DESKTOP_GROUPS). Keeps the diary PIN-lock
  // special-case and the «непрочитанные» count badge identical across both.
  function renderNavRow(item: NavItem) {
    const Icon = item.icon;
    const countKey = navCountKey(item.href);
    const count = countKey ? (counts?.[countKey] ?? 0) : 0;
    // B464 round-4 #8: the «Дневник» row carries a LIVE lock — open (LockOpen)
    // until the user sets a device PIN, closed (Lock) once set. The glyph is
    // its own link straight into the PIN setup.
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
  }

  return (
    <div data-testid="app-shell" data-shell-role={role} className="soft-clarity-page soft-app-shell min-h-screen">
      <div className="soft-shell soft-app-layout">
      {/* Sidebar — v4.2 card-style navigation. B466 owner-fix #1 + B512 R1-4:
          BOTH cabinets get the full-bleed column glued to the header, the left
          screen edge and the footer (the grid row stretches to the layout
          height); the nav itself stays sticky inside it. */}
      <aside
        data-testid="app-shell-sidebar"
        data-shell-role={role}
        className="soft-app-sidebar-col hidden shrink-0 md:block"
      >
        <div className="soft-app-sidebar-card sticky top-16 flex flex-col overflow-hidden p-3.5">
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

          {/* Nav — client = flat CLIENT_NAV; practitioner = the expanded
              «Practice cockpit» groups approved for desktop (B466 R9-5). */}
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="app-shell-nav">
            {isPractitionerBar
              ? PRACTITIONER_DESKTOP_GROUPS.map((group, gi) => (
                  <div
                    key={group.heading ?? `nav-group-${gi}`}
                    data-testid="app-shell-nav-group"
                    className={gi > 0 ? "space-y-1 pt-3" : "space-y-1"}
                  >
                    {group.heading && (
                      <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--soft-ink-faint)]">
                        {group.heading}
                      </p>
                    )}
                    {group.items.map(renderNavRow)}
                  </div>
                ))
              : nav.map(renderNavRow)}
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

      {/* Mobile nav. B466 R9-4: у практика бар получает pcab-tabbar — вид
          1-в-1 из мобильных макетов (непрозрачная карточка, edge-бордер,
          10.5px подписи, активная вкладка бордо); клиентский бар не тронут. */}
      <div
        data-testid="app-shell-mobile-nav"
        className={`soft-app-mobile-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden${isPractitionerBar ? " pcab-tabbar" : ""}`}
      >
        {mobileTabs.map((item) => {
          const Icon = item.Icon;
          const base = isPractitionerBar
            ? `pcab-tab${isMobileActive(item) ? " is-active" : ""}`
            : `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors duration-[var(--motion-base)] ${
                isMobileActive(item) ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]"
              }`;
          // X10/B466 round-8 #4: surface «требует внимания» counters on the mobile
          // bar too (e.g. new booking request on «Календарь») — same source as the
          // desktop sidebar badges so they can't drift.
          const countKey = navCountKey(item.href);
          const count = countKey ? (counts?.[countKey] ?? 0) : 0;
          const iconWithBadge = (
            <span className="relative">
              <Icon className={isPractitionerBar ? "h-[22px] w-[22px]" : "h-5 w-5"} />
              {count > 0 && (
                <span
                  data-testid="app-mobile-nav-counter"
                  aria-label={`${count} новых`}
                  className={`absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--soft-terracotta)] px-1 text-[9px] font-bold leading-none text-[#FBF1E4] tabular-nums${isPractitionerBar ? " pcab-count" : ""}`}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid="app-shell-mobile-tab"
              className={base}
            >
              {iconWithBadge}
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>

      {/* Main — reserve the bottom bar height + the iPhone home-indicator inset
          so no content hides behind the frosted tab bar (audit A2). */}
      {/* B466 owner-fix #1: with the practitioner layout full-bleed the main
          column carries its own vertical rhythm (md:pt-8/md:pb-20) — the
          layout padding that used to provide it is zeroed for practitioners. */}
      <main
        data-testid="app-shell-main"
        className={`soft-app-main min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] ${
          isPractitionerBar ? "md:pb-20 md:pt-8" : "md:pb-0"
        }`}
      >
        {/* B512 §3.3 — клиентский мобильный «верх» по утверждённому макету v3:
            логотип слева, справа — persistent чип баллов (Sparkles) + колокол-
            квадрат (r12, как практикский .iconbtn). Публичный nav-хедер на
            мобиле скрыт (data-cabinet-mobile-top); десктоп не тронут
            (md:hidden), у практика — свои per-screen appbar'ы. */}
        {isClient && (
          <div
            data-cabinet-mobile-top
            data-testid="client-mobile-appbar"
            className="client-mobile-appbar mb-4 flex items-center gap-2.5 md:hidden"
          >
            <Link href={mainUrl("/")} aria-label="ETerapy — на сайт" className="flex shrink-0 items-center">
              <VectorBrandLogo height={24} theme="light" />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ClientBalanceChip />
              <NotificationBell variant="header" settingsHref={appUrl("/settings#settings-notifications")} />
            </div>
          </div>
        )}
        {children}
      </main>
      </div>
    </div>
  );
}

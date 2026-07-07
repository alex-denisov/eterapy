"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { appUrl, adminUrl, getSubdomain, logoutUrl, mainUrl, toCabinetPathname, toPathname } from "@/lib/subdomain";
import { formatPoints } from "@/lib/points";
import { BALANCE_CHANGED_EVENT } from "@/lib/balance-events";
import { NotificationBell } from "@/components/notification-bell";
import { useMiniApp } from "@/components/miniapp-provider";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  Sparkles,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import { VectorBrandLogo } from "@/components/brand/brand-mark";
import {
  LANDING_NAV,
  CABINET_BRIDGE,
  CLIENT_MOBILE_TABS,
  GUEST_MOBILE_TABS,
  CLIENT_MORE_ITEMS,
  GUEST_MORE_ITEMS,
  MORE_LABEL,
  LOGOUT_LABEL,
} from "@/lib/nav-model";
import { NAV_ICONS } from "@/components/nav/nav-icons";

function useHostname() {
  const [hostname, setHostname] = useState("");
  useEffect(() => {
    // Intentional post-mount sync — keeps SSR snapshot ("") aligned
    // with the first client render and only reveals the real hostname
    // after hydration. Required to avoid React #418 between
    // eterapy.com / app.eterapy.com / admin.eterapy.com branches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHostname(window.location.hostname);
  }, []);
  return hostname;
}

function usePractitionerBalance(userId: string | null | undefined, enabled: boolean) {
  const [practitionerBalanceKopecks, setPractitionerBalanceKopecks] = useState(0);

  useEffect(() => {
    if (!userId || !enabled) {
      return;
    }
    let cancelled = false;
    fetch("/api/practitioner/balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !cancelled) setPractitionerBalanceKopecks(d.currentBalanceKopecks ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, userId]);

  return userId && enabled ? practitionerBalanceKopecks : 0;
}

function useClarityCreditBalance(userId: string | null | undefined, enabled = true) {
  const [credits, setCredits] = useState(0);

  const refresh = useCallback(() => {
    if (!userId || !enabled) return;
    fetch("/api/billing/transactions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const balance = Array.isArray(d?.clarityCredits)
          ? d.clarityCredits
              .filter((entry: { status?: string }) => entry.status === "confirmed")
              .reduce((sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0), 0)
          : 0;
        setCredits(Math.max(0, balance));
      })
      .catch(() => {});
  }, [enabled, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userId || !enabled || typeof window === "undefined") return;
    const handler = () => refresh();
    window.addEventListener(BALANCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handler);
  }, [refresh, userId, enabled]);

  return userId && enabled ? credits : 0;
}

function formatBalanceRub(balanceKopecks: number) {
  return (balanceKopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function BalanceSummaryLink({
  clarityCredits,
  className,
}: {
  clarityCredits: number;
  className?: string;
}) {
  // Z1-Ф1: the client ₽ balance rail is gone — this pill now shows only the
  // clarity-credit balance. B349/Механика 2: routes to /wallet (top-up page),
  // so the "Пополнить" cue at zero credits lands on пополнение, not spending.
  return (
    <Link
      href={appUrl("/wallet")}
      prefetch={false}
      aria-label={`Баланс: ${formatPoints(clarityCredits)}`}
      className={cn(
        "hidden h-7 items-center gap-1 overflow-hidden rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 text-[12px] font-semibold tabular-nums text-[var(--soft-terracotta-dark)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:bg-[color-mix(in_srgb,var(--soft-paper-card)_92%,white)]",
        className,
      )}
      data-testid="header-balance-summary"
    >
      <Sparkles className="size-3" aria-hidden="true" />
      {/* N8 quick win: at zero credits the pill turns into a top-up cue
          instead of a dead "0" — it already routes to /credits. */}
      {clarityCredits > 0 ? (
        <span className="whitespace-nowrap text-center">{formatPoints(clarityCredits)}</span>
      ) : (
        <span className="text-[11px]" data-testid="header-credits-topup">Пополнить</span>
      )}
    </Link>
  );
}

function MoneyBalanceLink({
  balanceKopecks,
  href,
  label = "Баланс",
  className,
}: {
  balanceKopecks: number;
  href: string;
  label?: string;
  className?: string;
}) {
  const rub = formatBalanceRub(balanceKopecks);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={`${label}: ${rub} ₽`}
      className={cn(
        "hidden h-7 items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 text-[12px] font-semibold tabular-nums text-[var(--soft-bordeaux)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors hover:bg-[color-mix(in_srgb,var(--soft-paper-card)_92%,white)]",
        className,
      )}
      data-testid="header-money-balance"
    >
      <CreditCard className="size-3" aria-hidden="true" />
      <span className="min-w-[2.25rem] text-right">{rub}</span>
      <span className="opacity-70">₽</span>
    </Link>
  );
}

function UserMenu({ session, cabinetDoor, className }: { session: NonNullable<ReturnType<typeof useSession>["data"]>; cabinetDoor?: { href: string }; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const role: string = session.user?.role ?? "CLIENT";
  const name = session.user?.name?.split(" ")[0] ?? session.user?.email ?? "Пользователь";
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // B324: menu items aligned with actual /cabinet/* routes that exist on
  // disk (see web/src/app/cabinet/**). Practitioner gets the full
  // practitioner sub-area; admin/superadmin get the canonical admin entry
  // points. Client gets every cabinet surface they can actually navigate.
  // T11: dropdown sections must mirror the actual cabinet sidebars
  // (CLIENT_NAV / PRACTITIONER_NAV in components/cabinet/cabinet-shell.tsx)
  // one-to-one, including order, labels and icons. Admin/superadmin use a
  // curated subset of the admin shell entry points.
  const menuItems = role === "PRACTITIONER" ? [
    // B466: mirrors the «Practice cockpit» sidebar (PRACTITIONER_TABS) one-to-one.
    { href: appUrl("/practitioner"), label: "Сегодня", icon: Sun },
    { href: appUrl("/practitioner/clients"), label: "Клиенты", icon: Users },
    { href: appUrl("/practitioner/calendar"), label: "Календарь", icon: CalendarDays },
    { href: appUrl("/practitioner/finance"), label: "Финансы", icon: Wallet },
    { href: appUrl("/practitioner/more"), label: "Ещё", icon: LayoutGrid },
  ] : role === "SUPERADMIN" ? [
    { href: adminUrl("/admin"), label: "Обзор", icon: LayoutDashboard },
    { href: adminUrl("/admin/product/users"), label: "Все пользователи", icon: Users },
    { href: adminUrl("/admin/finance/pricing"), label: "Цены и тарифы", icon: CreditCard },
    { href: adminUrl("/admin/ops/ai"), label: "AI-центр", icon: Sparkles },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : role === "ADMIN" ? [
    { href: adminUrl("/admin"), label: "Обзор", icon: LayoutDashboard },
    { href: adminUrl("/admin/product/users"), label: "Все пользователи", icon: Users },
    { href: adminUrl("/admin/product/quality"), label: "Заявки", icon: BookOpen },
    { href: adminUrl("/admin/product/sessions"), label: "Бронирования", icon: CalendarDays },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : [
    // T11/B464 IB0: mirrors CLIENT_NAV (cabinet-shell) one-to-one. «Подписка и
    // оплата» merged into «Кошелёк» (IB3); «Приглашения» added.
    { href: appUrl(""), label: "Главная", icon: LayoutDashboard },
    { href: appUrl("/diary"), label: "Дневник", icon: BookOpen },
    { href: appUrl("/wallet"), label: "Кошелёк", icon: Wallet },
    { href: appUrl("/bookings"), label: "Записи", icon: CalendarDays },
    { href: appUrl("/invite"), label: "Приглашения", icon: Gift },
    { href: appUrl("/settings"), label: "Настройки", icon: Settings },
  ];

  const allItems = [...menuItems, { href: "#signout", label: "Выйти из аккаунта" } as const];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  // Arrow key navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % allItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(allItems.length - 1);
    }
  }

  // Focus management
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keeps roving focus index aligned with menu visibility.
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (open && focusedIndex >= 0) {
      const links = menuRef.current?.querySelectorAll("a, button") as NodeListOf<HTMLElement> | undefined;
      links?.[focusedIndex]?.focus();
    }
  }, [focusedIndex, open]);

  function closeAndFocus() {
    setOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <div ref={ref} className={cn("relative flex items-center gap-1", className)} onKeyDown={handleKeyDown}>
      {/* B464 IB0: on the landing a client gets a labeled «Кабинет» DOOR (click →
          cabinet) plus a chevron that opens the quick-jump dropdown. Elsewhere
          (inside the cabinet, or for practitioner/staff) the pill keeps the
          account-menu behaviour and shows the user's name. */}
      {cabinetDoor ? (
        <>
          <Link
            href={cabinetDoor.href}
            prefetch={false}
            className="soft-user-pill"
            data-testid="header-cabinet-door"
          >
            <span className="-ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] text-[11px] font-bold text-[var(--soft-bordeaux)]">
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden md:block">Кабинет</span>
          </Link>
          <button
            ref={triggerRef}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Меню кабинета"
            className="soft-user-icon"
          >
            <ChevronDown className={cn("size-3.5 text-[var(--soft-ink-faint)] transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Меню пользователя"
          className="soft-user-pill"
        >
          <span className="-ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--soft-apricot)] text-[11px] font-bold text-[var(--soft-bordeaux)]">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden md:block">{name}</span>
          <ChevronDown className={cn("size-3.5 text-[var(--soft-ink-faint)] transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu"
          className="soft-user-menu absolute right-0 top-full z-50 mt-2 min-w-[260px] text-[var(--soft-ink)] outline-none"
        >
          {/* B324: header pill already shows balance + credits; do not
              repeat them inside the dropdown — keeps the menu focused on
              navigation, not state. */}
          <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(140deg,#E8C4B8,#F4D5C8)] text-sm font-bold text-[var(--soft-bordeaux)]">
                {name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{session.user?.name ?? name}</p>
                <p className="truncate text-xs text-[var(--soft-ink-faint)]">{session.user?.email}</p>
              </div>
            </div>
          </div>
          <div className="py-1">
            {menuItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  role="menuitem"
                  tabIndex={focusedIndex === i ? 0 : -1}
                  onClick={() => closeAndFocus()}
                  onFocus={() => setFocusedIndex(i)}
                  className="flex min-h-11 items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--soft-ink-soft)] outline-none transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)] focus:bg-[var(--soft-paper-deep)] focus:text-[var(--soft-bordeaux)]"
                >
                  <Icon className="size-4 text-[var(--soft-ink-faint)]" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-[var(--soft-paper-edge)] py-1">
            <button
              role="menuitem"
              tabIndex={focusedIndex === allItems.length - 1 ? 0 : -1}
              onClick={() => { closeAndFocus(); window.location.href = logoutUrl(); }}
              onFocus={() => setFocusedIndex(allItems.length - 1)}
              className="flex w-full min-h-11 items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[var(--soft-ink-soft)] outline-none transition-colors hover:bg-[var(--soft-paper-deep)] hover:text-[var(--soft-bordeaux)] focus:bg-[var(--soft-paper-deep)] focus:text-[var(--soft-bordeaux)]"
            >
              <LogOut className="size-4 text-[var(--soft-ink-faint)]" aria-hidden="true" />
              Выйти из аккаунта
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { data: session, status } = useSession();
  const { isMiniApp } = useMiniApp();
  const livePathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hostname = useHostname();
  // The proxy rewrites app.eterapy.com/* to /cabinet/* on the server, so SSR
  // and the URL-bar-aware client `usePathname()` disagree until hydration.
  // Lock the public header to the "/" branch on the first paint (matching the
  // empty hostname/mounted=false branches) and only consult the real pathname
  // after mount.
  const pathname = mounted ? livePathname : "/";
  const cabinetPathname = toCabinetPathname(pathname);
  const isAuthenticated = mounted && status === "authenticated" && !!session;
  const role: string = session?.user?.role ?? "CLIENT";
  const isStaff = role === "ADMIN" || role === "SUPERADMIN" || role === "MODERATOR";
  const isPractitioner = role === "PRACTITIONER";
  const balanceUserId = session?.user?.id ?? null;
  const practitionerBalanceKopecks = usePractitionerBalance(balanceUserId, isPractitioner);
  const clarityCredits = useClarityCreditBalance(balanceUserId, !isStaff && !isPractitioner);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // B381: inside a messenger mini-app the shell draws its own native header —
  // hiding the site header avoids the "double header". The pre-paint inline
  // script (data-miniapp) hides it via CSS before this unmount lands.
  if (isMiniApp) return null;

  // Скрываем header на странице видеосессии
  if (mounted && livePathname.startsWith("/session")) return null;

  // B464 round-4 #1: resolve the host against the CONFIGURED domains
  // (NEXT_PUBLIC_APP_DOMAIN / NEXT_PUBLIC_ADMIN_DOMAIN) instead of a
  // "app."/"admin." prefix — `staging.app.eterapy.com` fails the prefix
  // check, which stripped the cabinet bridge on staging.
  const subdomain = mounted ? getSubdomain(hostname) : "main";
  const isAdminArea = pathname.startsWith("/admin");
  const isSessionArea = pathname.startsWith("/session");
  const isAdminHost = subdomain === "admin";

  // B305: header is now visible on admin too — user wanted consistency
  // across all cabinets (client, practitioner, admin). Only hide it on
  // the videocall surface where the header would intrude.
  const shouldHideHeader = isSessionArea;

  if (shouldHideHeader) return null;

  const isAppHost = subdomain === "app";
  // N7: /help on eterapy.com is a PUBLIC page — it must keep the landing nav
  // menu like every other non-cabinet surface. (It used to be bucketed as an
  // "app area", which stripped its navigation.) The cabinet/app/admin hosts
  // still suppress the public nav.
  const isAppArea = cabinetPathname.startsWith("/cabinet") || isAppHost || isAdminArea || isAdminHost;
  const showPublicNav = !isAppArea;
  const nav = showPublicNav ? LANDING_NAV.map(item => ({ ...item, href: mainUrl(item.href) })) : [];

  // B464 IB0 — the platform header is now continuous across landing ↔ cabinet:
  //   • in the cabinet a client sees a cross-shell service BRIDGE in the centre
  //     (the previously-empty nav track);
  //   • ONE state-aware mobile bottom bar replaces the burger on the landing
  //     (the cabinet shell renders its own bar inside /cabinet, so the header
  //     bar is landing-only to avoid a double bar).
  const isClientPersona = !isAuthenticated || (!isStaff && !isPractitioner);
  const showCabinetBridge = isAuthenticated && !isStaff && !isPractitioner && isAppArea;
  const showMobileBar = showPublicNav && isClientPersona;
  const mobileTabs = isAuthenticated ? CLIENT_MOBILE_TABS : GUEST_MOBILE_TABS;
  const moreItems = isAuthenticated ? CLIENT_MORE_ITEMS : GUEST_MORE_ITEMS;
  const tabActive = (href: string) => {
    const p = toPathname(href);
    return p !== "/" && (pathname === p || pathname.startsWith(`${p}/`));
  };

  // Keep the soft-paper styling on every surface — including admin —
  // so the visual baseline is identical across all logged-in areas.
  const softPublicHeader = true;
  const cabinetHref = role === "PRACTITIONER"
    ? appUrl("/practitioner")
    : role === "ADMIN" || role === "SUPERADMIN"
      ? adminUrl("/admin")
      : appUrl("");

  // B314 / G16: role-specific right-cluster visibility.
  //   CLIENT — balance (rub + clarity-credits), help, bell, dropdown, Новый разбор
  //   PRACTITIONER — money-only balance, help, bell, dropdown (no clarity-credits,
  //     no «Новый разбор» — practitioners run sessions, they don't start client dialogues)
  //   ADMIN / SUPERADMIN / MODERATOR — bell + dropdown only (no balance, no help, no Новый разбор)
  const showBalanceSummary = isAuthenticated && !isStaff && !isPractitioner;
  const showPractitionerMoneyBalance = isAuthenticated && isPractitioner;
  const showHelpIcon = isAuthenticated && !isStaff;
  // G16: «Новый разбор» is a client-only action. Hide it for practitioners and staff.
  const showNewDialogueCta = isAuthenticated && !isStaff && !isPractitioner;
  // B464 item 3 / audit A3: inside the cabinet on mobile the top header is
  // slimmed to brand + bell only. The account pill is redundant for clients —
  // the bottom bar's «Ещё» sheet already carries Настройки/Поддержка/Выйти.
  // Practitioners/staff keep the pill (their mobile bar has no «Ещё» sheet).
  const slimCabinetHeaderMobile = isAppArea && isAuthenticated && !isStaff && !isPractitioner;

  return (
    <>
    <header
      data-testid="public-shell-header"
      data-site-chrome="header"
      className={cn(
        "sticky top-0 z-50 border-b border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]/90 shadow-[0_8px_38px_rgba(60,30,20,0.08)] backdrop-blur-xl",
        softPublicHeader && "soft-header",
      )}
    >
      {/* CSS Grid layout (B298 Strategy 2) keeps the right cluster width
          stable regardless of auth state: the rightmost grid track is
          sized minmax(0, 1fr) on mobile and a fixed reservation on md+,
          so login/logout never shifts the bar. */}
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 md:grid-cols-[auto_1fr_minmax(0,440px)]">
        <Link href={mainUrl("/")}
          className="flex shrink-0 items-center">
          <VectorBrandLogo height={28} theme={softPublicHeader ? "light" : "dark"} />
        </Link>

        {/* Centre track: public nav on the landing, OR the cross-shell service
            bridge inside the cabinet (B464 IB0). Exactly one renders, so the
            3-column grid — and the byte-identical right cluster — stays stable.
            B315: justify-center keeps the nav in the middle of the 1fr track. */}
        {showCabinetBridge ? (
          <nav data-testid="cabinet-service-bridge" className="hidden items-center justify-center gap-1 md:flex">
            {CABINET_BRIDGE.map((item, i) => (
              <Link key={item.href} href={item.href} prefetch={false}
                data-soft-nav="link"
                className={cn("rounded-full px-3 py-2 text-sm transition-colors",
                  i === 0
                    ? "inline-flex items-center gap-1 text-[var(--soft-ink-faint)] hover:text-foreground"
                    : item.label === "Услуги"
                      ? "font-medium text-[#6E5BA6] hover:bg-white/5"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}>
                {i === 0 && <ArrowLeft className="size-3.5" aria-hidden="true" />}
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="hidden items-center justify-center gap-1 md:flex">
            {nav.map((item) => {
              const itemPathname = new URL(item.href, "https://eterapy.com").pathname;
              const active = pathname === itemPathname || pathname.startsWith(itemPathname + "/");
              return (
                <Link key={item.href} href={item.href}
                  data-soft-nav="link"
                  data-active={active ? "true" : undefined}
                  className={cn("rounded-full px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right side: authenticated actions or guest auth buttons.
            justify-end keeps the cluster pinned to the right edge of
            the grid track, which itself has a stable width (see the
            grid-template-columns on the outer container). */}
        <div className="flex items-center justify-end gap-1.5">
          {isAuthenticated && session ? (
            <>
              {/* B314: balance + help hidden for staff (ADMIN/SUPERADMIN/MODERATOR);
                  balance also hidden for PRACTITIONER (they don't buy via credits).
                  bell + dropdown remain on every authenticated surface. */}
              {showBalanceSummary && (
                <BalanceSummaryLink clarityCredits={clarityCredits} className="sm:flex" />
              )}
              {showPractitionerMoneyBalance && (
                <MoneyBalanceLink
                  balanceKopecks={practitionerBalanceKopecks}
                  href={appUrl("/practitioner/earnings")}
                  label="Баланс практика"
                  className="sm:flex"
                />
              )}
              {showHelpIcon && (
                <Link
                  // N5a: this icon only renders for authenticated non-staff
                  // users, so it always takes them into the cabinet support
                  // surface (chat + complaint + contacts), even when they're
                  // browsing the public site. Anonymous visitors get the public
                  // /help knowledge base via the footer / nav instead.
                  href={appUrl("/support")}
                  prefetch={false}
                  aria-label="Поддержка и помощь"
                  // 360px fix: below md the right cluster overflows the
                  // viewport; the mobile «Ещё» sheet carries «Поддержка» instead.
                  className="soft-user-icon hidden md:inline-flex"
                >
                  <CircleHelp className="size-4" />
                </Link>
              )}
              <NotificationBell variant="header" />
              <UserMenu
                session={session}
                cabinetDoor={showPublicNav && !isStaff && !isPractitioner ? { href: cabinetHref } : undefined}
                className={slimCabinetHeaderMobile ? "hidden md:flex" : undefined}
              />
              {/* B321: ALL header items at canonical v4.2 user-pill height —
                  h-7 (28px), text-[13px], px-3 (12px). Matches
                  docs/Design/v4.2/style.css .user-pill spec exactly so
                  every right-cluster element sits on one baseline. */}
              {showNewDialogueCta && (
                <Link
                  href={mainUrl("/checkin")}
                  // 360px fix: below md the CTA pushed the cluster past the
                  // right edge (horizontal scroll); the mobile bottom bar
                  // «Вопрос» tab carries it for clients instead.
                  className="soft-header-cta soft-header-cta-primary hidden md:inline-flex"
                  data-testid="header-dialogue-cta"
                  data-analytics-event="dialogue_cta_clicked"
                  data-analytics-target="/checkin"
                >
                  Задать вопрос
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href={mainUrl("/login")}
                prefetch={false}
                className="soft-header-cta soft-header-cta-ghost hidden md:inline-flex">
                Войти
              </Link>
              <Link
                href={mainUrl("/checkin")}
                className="soft-header-cta soft-header-cta-primary"
              >
                Задать вопрос
              </Link>
            </>
          )}
        </div>
      </div>
    </header>

      {/* B464 IB0 — ONE state-aware, iOS-frosted mobile bottom bar replaces the
          burger on the landing. Inside /cabinet the cabinet shell renders its
          own identical bar, so this one is landing-only (no double bar). The
          «Ещё» tab opens a bottom sheet instead of navigating.
          Round-5 #1/#2: the bar + sheet MUST render OUTSIDE the <header> —
          its backdrop-blur creates a CSS containing block for position:fixed,
          which pinned the «bottom» bar to the header box (top of the page) and
          pushed the «Ещё» sheet above the viewport, invisible. As header
          siblings they are fixed to the real viewport bottom, byte-identical
          to the cabinet shell bar. */}
      {showMobileBar && (
        <>
          {mobileOpen && (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed inset-0 z-40 bg-[rgba(60,30,20,0.28)] md:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <div
                data-testid="landing-mobile-sheet"
                className="soft-mobile-sheet fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-50 md:hidden"
              >
                {moreItems.map((item) => {
                  const Icon = NAV_ICONS[item.iconKey];
                  if (item.label === LOGOUT_LABEL) {
                    return (
                      <button
                        key="more-logout"
                        type="button"
                        onClick={() => { setMobileOpen(false); window.location.href = logoutUrl(); }}
                        className="soft-mobile-sheet-row flex w-full items-center gap-3"
                      >
                        <Icon className="size-4 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
                        {item.label}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={() => setMobileOpen(false)}
                      className="soft-mobile-sheet-row flex items-center gap-3"
                    >
                      <Icon className="size-4 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
          <nav
            data-testid="landing-mobile-nav"
            className="soft-app-mobile-nav fixed bottom-0 left-0 right-0 z-40 flex md:hidden"
          >
            {mobileTabs.map((item) => {
              const Icon = NAV_ICONS[item.iconKey];
              const base = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors";
              if (item.label === MORE_LABEL) {
                return (
                  <button
                    key="more"
                    type="button"
                    aria-expanded={mobileOpen}
                    aria-label="Ещё"
                    onClick={() => setMobileOpen((v) => !v)}
                    className={cn(base, mobileOpen ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]")}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className={cn(base, tabActive(item.href) ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]")}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </>
  );
}

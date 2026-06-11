"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { appUrl, adminUrl, logoutUrl, mainUrl, toCabinetPathname } from "@/lib/subdomain";
import { formatPoints } from "@/lib/points";
import { NotificationBell } from "@/components/notification-bell";
import {
  Banknote,
  BookOpen,
  Bookmark,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  Leaf,
  Lock,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  Star,
  UserPen,
  Users,
  Wallet,
} from "lucide-react";
import { VectorBrandLogo } from "@/components/brand/brand-mark";

const GUEST_NAV = [
  { href: "/how-it-works", label: "Как работает" },
  { href: "/products", label: "Продукты" },
  { href: "/library", label: "Библиотека" },
  { href: "/practitioners", label: "Специалисты" },
  { href: "/pricing", label: "Тарифы" },
];

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

  useEffect(() => {
    if (!userId || !enabled) {
      return;
    }
    let cancelled = false;
    fetch("/api/billing/transactions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        const balance = Array.isArray(d?.clarityCredits)
          ? d.clarityCredits
              .filter((entry: { status?: string }) => entry.status === "confirmed")
              .reduce((sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0), 0)
          : 0;
        setCredits(Math.max(0, balance));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, userId]);

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

function UserMenu({ session }: { session: NonNullable<ReturnType<typeof useSession>["data"]> }) {
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
    { href: appUrl("/practitioner"), label: "Сводка", icon: LayoutDashboard },
    { href: appUrl("/practitioner/profile"), label: "Мой профиль", icon: UserPen },
    { href: appUrl("/practitioner/services"), label: "Услуги и цены", icon: Bookmark },
    { href: appUrl("/practitioner/schedule"), label: "Расписание", icon: CalendarDays },
    { href: appUrl("/practitioner/requests"), label: "Заявки", icon: MessageCircle },
    { href: appUrl("/practitioner/clients"), label: "Клиенты", icon: Users },
    { href: appUrl("/practitioner/earnings"), label: "Баланс", icon: Banknote },
    { href: appUrl("/practitioner/reviews"), label: "Отзывы", icon: Star },
    { href: appUrl("/practitioner/ethics"), label: "Этический кодекс", icon: Lock },
  ] : role === "SUPERADMIN" ? [
    { href: adminUrl("/admin"), label: "Обзор", icon: LayoutDashboard },
    { href: adminUrl("/admin/users"), label: "Все пользователи", icon: Users },
    { href: adminUrl("/admin/pricing"), label: "Цены и тарифы", icon: CreditCard },
    { href: adminUrl("/admin/ai"), label: "AI-центр", icon: Sparkles },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : role === "ADMIN" ? [
    { href: adminUrl("/admin"), label: "Обзор", icon: LayoutDashboard },
    { href: adminUrl("/admin/users"), label: "Все пользователи", icon: Users },
    { href: adminUrl("/admin/applications"), label: "Заявки", icon: BookOpen },
    { href: adminUrl("/admin/bookings"), label: "Бронирования", icon: CalendarDays },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : [
    { href: appUrl(""), label: "Главная", icon: LayoutDashboard },
    { href: appUrl("/diary"), label: "Дневник", icon: BookOpen },
    { href: appUrl("/bookings"), label: "Записи", icon: CalendarDays },
    { href: appUrl("/wallet"), label: "Кошелёк", icon: Sparkles },
    { href: appUrl("/practice"), label: "Ежедневная практика", icon: Leaf },
    { href: appUrl("/billing"), label: "Подписка и оплата", icon: Wallet },
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
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
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

  // Скрываем header на странице видеосессии
  if (mounted && livePathname.startsWith("/session")) return null;

  const isAdminArea = pathname.startsWith("/admin");
  const isSessionArea = pathname.startsWith("/session");
  const isAdminHost = mounted && hostname.startsWith("admin.");

  // B305: header is now visible on admin too — user wanted consistency
  // across all cabinets (client, practitioner, admin). Only hide it on
  // the videocall surface where the header would intrude.
  const shouldHideHeader = isSessionArea;

  if (shouldHideHeader) return null;

  const isAppHost = mounted && hostname.startsWith("app.");
  // N7: /help on eterapy.com is a PUBLIC page — it must keep the landing nav
  // menu like every other non-cabinet surface. (It used to be bucketed as an
  // "app area", which stripped its navigation.) The cabinet/app/admin hosts
  // still suppress the public nav.
  const isAppArea = cabinetPathname.startsWith("/cabinet") || isAppHost || isAdminArea || isAdminHost;
  const showPublicNav = !isAppArea;
  const nav = showPublicNav ? GUEST_NAV.map(item => ({ ...item, href: mainUrl(item.href) })) : [];

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

  return (
    <header
      data-testid="public-shell-header"
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

        {/* Public navigation stays on eterapy.com even inside app.eterapy.com cabinets.
            B315: justify-center so the nav sits in the middle of the 1fr grid track —
            previously it stuck to the left edge of column 2 after the B298 grid rework. */}
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
                  // viewport; the burger menu carries «Помощь» instead.
                  className="soft-user-icon hidden md:inline-flex"
                >
                  <CircleHelp className="size-4" />
                </Link>
              )}
              <NotificationBell variant="header" />
              <UserMenu session={session} />
              {/* B321: ALL header items at canonical v4.2 user-pill height —
                  h-7 (28px), text-[13px], px-3 (12px). Matches
                  docs/Design/v4.2/style.css .user-pill spec exactly so
                  every right-cluster element sits on one baseline. */}
              {showNewDialogueCta && (
                <Link
                  href={mainUrl("/checkin")}
                  // 360px fix: below md the CTA pushed the cluster past the
                  // right edge (horizontal scroll); the burger menu carries
                  // «Начать диалог» for clients instead.
                  className="soft-header-cta soft-header-cta-primary hidden md:inline-flex"
                  data-testid="header-dialogue-cta"
                  data-analytics-event="dialogue_cta_clicked"
                  data-analytics-target="/checkin"
                >
                  Новый разбор
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
                Начать диалог
              </Link>
            </>
          )}
          <button
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] transition-colors hover:border-[var(--soft-terracotta)] hover:text-[var(--soft-bordeaux)] md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Меню"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]/96 px-4 py-4 shadow-[0_18px_50px_rgba(60,30,20,0.12)] backdrop-blur-xl md:hidden animate-in slide-in-from-top-2 duration-200 soft-mobile-menu">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn("rounded-xl px-3 py-2.5 text-sm transition-colors",
                  pathname === new URL(item.href, "https://eterapy.com").pathname ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}>
                {item.label}
              </Link>
            ))}
            {isAuthenticated && session ? (
              <>
                <Link href={appUrl("/help")} prefetch={false} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Помощь
                </Link>
                {isPractitioner ? (
                  <Link href={appUrl("/practitioner/earnings")} prefetch={false} onClick={() => setMobileOpen(false)}
                    className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary transition-colors hover:bg-[var(--soft-paper-card)]">
                    <CreditCard className="size-4" aria-hidden="true" />
                    {formatBalanceRub(practitionerBalanceKopecks)} ₽
                  </Link>
                ) : (
                  <Link href={appUrl("/wallet")} prefetch={false} onClick={() => setMobileOpen(false)}
                    className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary transition-colors hover:bg-[var(--soft-paper-card)]">
                    <Sparkles className="size-4" aria-hidden="true" />
                    Баланс: {formatPoints(clarityCredits)}
                  </Link>
                )}
                <Link href={cabinetHref} prefetch={false} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--soft-bordeaux)] transition-colors hover:bg-[var(--soft-paper-card)]">
                  Личный кабинет
                </Link>
                {/* G16: «Начать диалог» mirrors the desktop «Новый разбор» gate —
                    client-only, hidden for practitioners and staff. */}
                {showNewDialogueCta && (
                  <Link href={mainUrl("/checkin")} onClick={() => setMobileOpen(false)}
                    className="rounded-lg bg-[var(--soft-terracotta)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--soft-terracotta-dark)]">
                    Начать диалог
                  </Link>
                )}
                {isAppArea && (
                  <button onClick={() => { setMobileOpen(false); window.location.href = logoutUrl(); }}
                    className="mt-2 rounded-lg border border-border/30 px-3 py-2.5 text-left text-sm text-muted-foreground">
                    Выйти
                  </button>
                )}
              </>
            ) : (
              <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
                <Link href={mainUrl("/login")} prefetch={false} onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-muted-foreground")}>Войти</Link>
                <Link href={mainUrl("/checkin")} onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }), "flex-1 !bg-[var(--soft-terracotta)] !text-white")}>Начать диалог</Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

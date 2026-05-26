"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { appUrl, adminUrl, logoutUrl, mainUrl, toCabinetPathname } from "@/lib/subdomain";
import { NotificationBell } from "@/components/notification-bell";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Compass,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
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

function useBalance(userId: string | null | undefined) {
  const [balanceKopecks, setBalanceKopecks] = useState(0);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    fetch("/api/billing/balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !cancelled) setBalanceKopecks(d.balanceKopecks ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  return userId ? balanceKopecks : 0;
}

function useClarityCreditBalance(userId: string | null | undefined) {
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    if (!userId) {
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
  }, [userId]);

  return userId ? credits : 0;
}

function formatBalanceRub(balanceKopecks: number) {
  return (balanceKopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function BalanceSummaryLink({
  balanceKopecks,
  clarityCredits,
  className,
}: {
  balanceKopecks: number;
  clarityCredits: number;
  className?: string;
}) {
  const rub = formatBalanceRub(balanceKopecks);
  return (
    <Link
      href={appUrl("/credits")}
      prefetch={false}
      aria-label={`Кредиты ясности: ${clarityCredits}. Баланс: ${rub} ₽`}
      className={cn(
        "soft-user-pill hidden items-center gap-2 px-3 py-1.5 text-xs font-semibold tabular-nums",
        className,
      )}
      data-testid="header-balance-summary"
    >
      <span className="inline-flex items-center gap-1 text-[var(--soft-terracotta-dark)]">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {clarityCredits}
      </span>
      <span aria-hidden="true" className="text-[var(--soft-paper-edge)]">·</span>
      <span className="inline-flex items-center gap-1 text-[var(--soft-bordeaux)]">
        {rub} ₽
      </span>
    </Link>
  );
}

function UserMenu({ session, balanceKopecks }: { session: NonNullable<ReturnType<typeof useSession>["data"]>; balanceKopecks: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const role: string = session.user?.role ?? "CLIENT";
  const name = session.user?.name?.split(" ")[0] ?? session.user?.email ?? "Пользователь";
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const rub = formatBalanceRub(balanceKopecks);

  const menuItems = role === "PRACTITIONER" ? [
    { href: appUrl("/practitioner"), label: "Главная специалиста", icon: LayoutDashboard },
    { href: appUrl("/practitioner/schedule"), label: "Расписание", icon: CalendarDays },
    { href: appUrl("/practitioner/requests"), label: "Заявки", icon: BookOpen },
    { href: appUrl("/practitioner/earnings"), label: "Выплаты", icon: CreditCard },
    { href: appUrl("/settings"), label: "Настройки", icon: Settings },
  ] : role === "SUPERADMIN" ? [
    { href: adminUrl("/admin"), label: "Панель управления", icon: LayoutDashboard },
    { href: adminUrl("/admin/metrics"), label: "Метрики", icon: Compass },
    { href: adminUrl("/admin/pricing"), label: "Цены и тарифы", icon: CreditCard },
    { href: adminUrl("/admin/ai"), label: "AI и маршрутизация", icon: Sparkles },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : role === "ADMIN" ? [
    { href: adminUrl("/admin"), label: "Панель администратора", icon: LayoutDashboard },
    { href: adminUrl("/admin/settings"), label: "Настройки", icon: Settings },
  ] : [
    { href: appUrl(""), label: "Главная кабинета", icon: LayoutDashboard },
    { href: appUrl("/action-history"), label: "Моя карта", icon: Compass },
    { href: appUrl("/questions"), label: "История разборов", icon: BookOpen },
    { href: appUrl("/credits"), label: "Кредиты ясности", icon: Sparkles },
    { href: appUrl("/bookings"), label: "Мои записи", icon: CalendarDays },
    { href: appUrl("/billing"), label: "Подписка и оплата", icon: CreditCard },
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
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--soft-apricot)] text-xs font-bold text-[var(--soft-bordeaux)]">
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
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--soft-terracotta-dark)]">
              <CreditCard className="size-3" aria-hidden="true" />
              {rub} ₽
            </p>
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
  const balanceKopecks = useBalance(session?.user?.id ?? null);
  const clarityCredits = useClarityCreditBalance(session?.user?.id ?? null);

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

  // Header hidden only on admin subdomain and session pages
  const shouldHideHeader = isAdminArea || isAdminHost || isSessionArea;

  if (shouldHideHeader) return null;

  const isAppHost = mounted && hostname.startsWith("app.");
  const isAppArea = cabinetPathname.startsWith("/cabinet") || pathname.startsWith("/help") || isAppHost;
  const showPublicNav = !isAppArea;
  const nav = showPublicNav ? GUEST_NAV.map(item => ({ ...item, href: mainUrl(item.href) })) : [];

  const softPublicHeader = !isAdminArea;
  const cabinetHref = session?.user?.role === "PRACTITIONER"
    ? appUrl("/practitioner")
    : session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN"
      ? adminUrl("/admin")
      : appUrl("");

  return (
    <header
      data-testid="public-shell-header"
      className={cn(
        "sticky top-0 z-50 border-b border-[var(--soft-paper-edge)]/60 bg-[var(--soft-paper)]/90 shadow-[0_8px_38px_rgba(60,30,20,0.08)] backdrop-blur-xl",
        softPublicHeader && "soft-header",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={mainUrl("/")}
          className="flex shrink-0 items-center">
          <VectorBrandLogo height={28} theme={softPublicHeader ? "light" : "dark"} />
        </Link>

        {/* Public navigation stays on eterapy.com even inside app.eterapy.com cabinets. */}
        <nav className="hidden items-center gap-1 md:flex">
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

        {/* Right side: authenticated actions or guest auth buttons */}
        <div className="flex items-center gap-2">
          {isAuthenticated && session ? (
            <>
              <BalanceSummaryLink balanceKopecks={balanceKopecks} clarityCredits={clarityCredits} className="sm:flex" />
              <Link
                href={isAppArea ? appUrl("/help") : mainUrl("/help")}
                prefetch={false}
                aria-label="Помощь"
                className="soft-user-icon"
              >
                <CircleHelp className="size-4" />
              </Link>
              <NotificationBell variant="header" />
              <UserMenu session={session} balanceKopecks={balanceKopecks} />
              {!isAppArea && (
                <Link
                  href={mainUrl("/checkin")}
                  className={cn(
                    "soft-button soft-button-primary h-9 px-4 text-sm",
                    softPublicHeader && "!bg-[var(--soft-terracotta)] !text-white !shadow-[0_10px_26px_-12px_rgba(214,117,88,.72)] hover:!bg-[var(--soft-terracotta-dark)]",
                  )}
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
                className={cn(
                  "soft-button soft-button-ghost h-9 px-4 text-sm",
                  "hidden md:inline-flex",
                  softPublicHeader ? "text-[var(--soft-bordeaux)] hover:bg-[rgba(92,42,44,0.05)]" : "text-muted-foreground",
                )}>
                Войти
              </Link>
              <Link
                href={mainUrl("/checkin")}
                className={cn(
                  "soft-button soft-button-primary h-9 px-4 text-sm",
                  softPublicHeader && "!bg-[var(--soft-terracotta)] !text-white !shadow-[0_10px_26px_-12px_rgba(214,117,88,.72)] hover:!bg-[var(--soft-terracotta-dark)]",
                )}
              >
                Начать диалог
              </Link>
            </>
          )}
          <button
            className="ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-border/40 text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground md:hidden"
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
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-primary">
                  <CreditCard className="size-4" aria-hidden="true" />
                  {formatBalanceRub(balanceKopecks)} ₽
                  <Sparkles className="size-4" aria-hidden="true" />
                  {clarityCredits} кредитов
                </div>
                <Link href={cabinetHref} prefetch={false} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--soft-bordeaux)] transition-colors hover:bg-[var(--soft-paper-card)]">
                  Личный кабинет
                </Link>
                <Link href={mainUrl("/checkin")} onClick={() => setMobileOpen(false)}
                  className="rounded-lg bg-[var(--soft-terracotta)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--soft-terracotta-dark)]">
                  Начать диалог
                </Link>
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

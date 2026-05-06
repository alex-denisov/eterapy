"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { appUrl, adminUrl, logoutUrl, mainUrl } from "@/lib/subdomain";
import { NotificationBell } from "@/components/notification-bell";
import { Wallet, HelpCircle } from "lucide-react";
import { VectorBrandLogo } from "@/components/brand/brand-mark";

const GUEST_NAV = [
  { href: "/checkin", label: "Задать вопрос" },
  { href: "/how-it-works", label: "Как работает" },
  { href: "/products", label: "Продукты" },
  { href: "/library", label: "Библиотека" },
  { href: "/pricing", label: "Цены" },
  { href: "/practitioners", label: "Специалисты" },
  { href: "/#faq", label: "FAQ" },
];

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

function UserMenu({ session, balanceKopecks }: { session: NonNullable<ReturnType<typeof useSession>["data"]>; balanceKopecks: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const role: string = session.user?.role ?? "CLIENT";
  const name = session.user?.name?.split(" ")[0] ?? session.user?.email ?? "Пользователь";
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const rub = (balanceKopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const menuItems = role === "PRACTITIONER" ? [
    { href: appUrl("/cabinet/practitioner"), label: "Мой кабинет" },
    { href: appUrl("/cabinet/practitioner/schedule"), label: "Расписание" },
    { href: appUrl("/cabinet/settings"), label: "Настройки" },
  ] : role === "SUPERADMIN" ? [
    { href: adminUrl("/admin"), label: "Панель управления" },
    { href: adminUrl("/admin/metrics"), label: "Метрики" },
    { href: adminUrl("/admin/pricing"), label: "Цены и тарифы" },
    { href: adminUrl("/admin/settings"), label: "Настройки" },
  ] : role === "ADMIN" ? [
    { href: adminUrl("/admin"), label: "Панель администратора" },
    { href: adminUrl("/admin/settings"), label: "Настройки" },
  ] : [
    { href: appUrl("/cabinet"), label: "Кабинет" },
    { href: appUrl("/cabinet/billing"), label: "Оплата и тарифы" },
    { href: appUrl("/cabinet/settings"), label: "Настройки и безопасность" },
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
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden md:block">{name}</span>
        <span className="text-xs text-muted-foreground/60" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border/40 bg-navy/95 shadow-xl outline-none backdrop-blur-xl"
        >
          <div className="border-b border-border/30 px-4 py-3">
            <p className="text-sm font-medium">{session.user?.name}</p>
            <p className="text-xs text-muted-foreground">{session.user?.email}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-primary">
              <Wallet className="size-3" aria-hidden="true" />
              {rub} ₽
            </p>
          </div>
          <div className="py-1">
            {menuItems.map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={focusedIndex === i ? 0 : -1}
                onClick={() => closeAndFocus()}
                onFocus={() => setFocusedIndex(i)}
                className="block min-h-[44px] px-4 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-white/5 hover:text-foreground focus:bg-white/5 focus:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-border/30 py-1">
            <button
              role="menuitem"
              tabIndex={focusedIndex === allItems.length - 1 ? 0 : -1}
              onClick={() => { closeAndFocus(); window.location.href = logoutUrl(); }}
              onFocus={() => setFocusedIndex(allItems.length - 1)}
              className="w-full min-h-[44px] px-4 py-2.5 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-white/5 hover:text-foreground focus:bg-white/5 focus:text-foreground"
            >
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
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAuthenticated = status === "authenticated" && !!session;
  const isLoading = status === "loading";
  const balanceKopecks = useBalance(session?.user?.id ?? null);

  // Скрываем header на странице видеосессии
  if (pathname.startsWith("/session")) return null;

  const isAdminArea = pathname.startsWith("/admin");
  const isSessionArea = pathname.startsWith("/session");
  const isAppArea = pathname.startsWith("/cabinet") || pathname.startsWith("/help");
  const showPublicNav = !isAdminArea && !isSessionArea;
  const nav = showPublicNav ? GUEST_NAV : [];

  const balanceRub = (balanceKopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const softPublicHeader = !isAdminArea;
  const cabinetHref = session?.user?.role === "PRACTITIONER"
    ? appUrl("/cabinet/practitioner")
    : session?.user?.role === "ADMIN" || session?.user?.role === "SUPERADMIN"
      ? adminUrl("/admin")
      : appUrl("/cabinet");

  return (
    <header
      data-testid="public-shell-header"
      className={cn(
        "sticky top-0 z-50 border-b border-brand-warm-gold/15 bg-navy/86 shadow-[0_8px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl",
        softPublicHeader && "soft-header",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={mainUrl("/")}
          className="flex shrink-0 items-center">
          <VectorBrandLogo height={38} theme={softPublicHeader ? "light" : "dark"} />
        </Link>

        {/* Guest navigation — NEVER shown to authenticated users */}
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
              {isAppArea ? (
                <>
                  <Link
                    href={appUrl("/cabinet/billing")}
                    aria-label={`Баланс: ${balanceRub} ₽. Открыть раздел пополнения`}
                    className="hidden min-h-10 items-center gap-1.5 rounded-full border border-border/40 bg-card/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground sm:flex"
                  >
                    <Wallet className="h-4 w-4" />
                    <span className="tabular-nums">{balanceRub} ₽</span>
                  </Link>
                  <Link
                    href={appUrl("/help")}
                    aria-label="Помощь"
                    className="flex min-h-10 items-center justify-center rounded-full border border-border/40 bg-card/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Link>
                  <NotificationBell variant="header" />
                  <UserMenu session={session} balanceKopecks={balanceKopecks} />
                </>
              ) : (
                <Link
                  href={cabinetHref}
                  className="soft-button soft-button-primary min-h-10 px-4 py-2 text-sm"
                  data-testid="header-cabinet-cta"
                >
                  Личный кабинет
                </Link>
              )}
            </>
          ) : !isLoading ? (
            <>
              <Link href={mainUrl("/login")}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden md:inline-flex",
                  softPublicHeader ? "soft-button-ghost text-[var(--soft-bordeaux)] hover:bg-[rgba(92,42,44,0.05)]" : "text-muted-foreground",
                )}>
                Войти
              </Link>
              <Link
                href={mainUrl("/checkin")}
                className={cn(
                  buttonVariants({ size: "sm" }),
                  softPublicHeader && "soft-button-primary text-white shadow-none",
                )}
              >
                Задать вопрос
              </Link>
            </>
          ) : (
            /* Loading skeleton — invisible spacer to prevent layout shift */
            <div className="hidden md:flex items-center gap-2" aria-hidden="true">
              <div className="w-16 h-8 rounded-lg bg-white/5" />
              <div className="w-16 h-8 rounded-lg bg-white/5" />
            </div>
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
        <div className="border-t border-border/40 bg-navy/96 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl md:hidden animate-in slide-in-from-top-2 duration-200 soft-mobile-menu">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn("rounded-xl px-3 py-2.5 text-sm transition-colors",
                  pathname === item.href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}>
                {item.label}
              </Link>
            ))}
            {isAuthenticated && session ? (
              <>
                <Link href={mainUrl("/help")} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Помощь
                </Link>
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-primary">
                  <Wallet className="size-4" aria-hidden="true" />
                  {balanceRub} ₽
                </div>
                <Link href={cabinetHref} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--soft-bordeaux)] transition-colors hover:bg-[var(--soft-paper-card)]">
                  Личный кабинет
                </Link>
                {isAppArea && (
                  <button onClick={() => { setMobileOpen(false); window.location.href = logoutUrl(); }}
                    className="mt-2 rounded-lg border border-border/30 px-3 py-2.5 text-left text-sm text-muted-foreground">
                    Выйти
                  </button>
                )}
              </>
            ) : !isLoading ? (
              <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
                <Link href={mainUrl("/login")} onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-muted-foreground")}>Войти</Link>
                <Link href={mainUrl("/checkin")} onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }), "flex-1")}>Задать вопрос</Link>
              </div>
            ) : null}
          </nav>
        </div>
      )}
    </header>
  );
}

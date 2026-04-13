"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";

const GUEST_NAV = [
  { href: "/practitioners", label: "Найти практика" },
  { href: "/#modalities", label: "Направления" },
  { href: "/#for-practitioners", label: "Для практиков" },
  { href: "/#faq", label: "FAQ" },
];

function useBalance(userId: string | null | undefined) {
  const [balanceKopecks, setBalanceKopecks] = useState(0);

  useEffect(() => {
    if (!userId) {
      setBalanceKopecks(0);
      return;
    }
    let cancelled = false;
    fetch("/api/billing/balance")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && !cancelled) setBalanceKopecks(d.balanceKopecks ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  return balanceKopecks;
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
    { href: "/cabinet/practitioner", label: "Мой кабинет" },
    { href: "/cabinet/practitioner/schedule", label: "Расписание" },
    { href: "/cabinet/settings", label: "Настройки" },
  ] : role === "SUPERADMIN" ? [
    { href: "/admin", label: "Панель управления" },
    { href: "/admin/metrics", label: "Метрики" },
    { href: "/admin/pricing", label: "Цены и тарифы" },
    { href: "/admin/settings", label: "Настройки" },
  ] : role === "ADMIN" ? [
    { href: "/admin", label: "Панель администратора" },
    { href: "/admin/settings", label: "Настройки" },
  ] : [
    { href: "/cabinet", label: "Кабинет" },
    { href: "/cabinet/billing", label: "Оплата и тарифы" },
    { href: "/cabinet/settings", label: "Настройки и безопасность" },
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
            <p className="text-xs text-primary mt-1">💰 {rub} ₽</p>
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
              onClick={() => { closeAndFocus(); signOut({ callbackUrl: "/" }); }}
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

  // Скрываем header на странице видеосессии
  if (pathname.startsWith("/session")) return null;

  const isAuthenticated = status === "authenticated" && !!session;
  const isLoading = status === "loading";
  const balanceKopecks = useBalance(session?.user?.id ?? null);
  const role: string = session?.user?.role ?? "GUEST";

  // Пока загружается — показываем пустой хедер без навигации (без мигания гостевых ссылок)
  const nav = !isAuthenticated && !isLoading ? GUEST_NAV : [];

  const balanceRub = (balanceKopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-navy/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={!isAuthenticated ? "/" : role === "PRACTITIONER" ? "/cabinet/practitioner" : (role === "ADMIN" || role === "SUPERADMIN") ? "/admin" : "/cabinet"}
          className="flex items-center gap-2.5 shrink-0">
          <Image src="/logo.svg" alt="ETerapy" width={28} height={28} />
          <span className="font-heading text-xl font-bold text-primary">ETerapy</span>
        </Link>

        {/* Guest navigation — NEVER shown to authenticated users */}
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className={cn("rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
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
              {/* Help link */}
              <Link
                href="/help"
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5"
              >
                Помощь
              </Link>

              {/* Balance */}
              <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <span>💰</span>
                <span className="tabular-nums">{balanceRub} ₽</span>
              </div>

              {/* Notification bell */}
              <NotificationBell variant="header" />

              {/* User menu */}
              <UserMenu session={session} balanceKopecks={balanceKopecks} />
            </>
          ) : !isLoading ? (
            <>
              <Link href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden text-muted-foreground md:inline-flex")}>
                Войти
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
                Начать бесплатно
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
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Меню"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-navy/95 px-4 py-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn("rounded-lg px-3 py-2.5 text-sm transition-colors",
                  pathname === item.href ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}>
                {item.label}
              </Link>
            ))}
            {isAuthenticated && session ? (
              <>
                <Link href="/help" onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Помощь
                </Link>
                <div className="px-3 py-2 text-sm text-primary">💰 {balanceRub} ₽</div>
                <button onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/" }); }}
                  className="mt-2 rounded-lg border border-border/30 px-3 py-2.5 text-left text-sm text-muted-foreground">
                  Выйти
                </button>
              </>
            ) : !isLoading ? (
              <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
                <Link href="/login" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-muted-foreground")}>Войти</Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }), "flex-1")}>Регистрация</Link>
              </div>
            ) : null}
          </nav>
        </div>
      )}
    </header>
  );
}

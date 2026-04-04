"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const GUEST_NAV = [
  { href: "/practitioners", label: "Найти практика" },
  { href: "/tools", label: "Инструменты" },
  { href: "/#for-practitioners", label: "Для практиков" },
  { href: "/#faq", label: "FAQ" },
];

const CLIENT_NAV = [
  { href: "/practitioners", label: "Найти практика" },
  { href: "/tools", label: "Инструменты" },
  { href: "/dashboard", label: "Кабинет" },
];

const PRACTITIONER_NAV = [
  { href: "/dashboard/practitioner", label: "Мой кабинет" },
  { href: "/practitioners", label: "Каталог" },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Администратор" },
  { href: "/practitioners", label: "Каталог" },
];

function UserMenu({ session }: { session: NonNullable<ReturnType<typeof useSession>["data"]> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // @ts-expect-error custom
  const role: string = session.user?.role ?? "CLIENT";
  const name = session.user?.name?.split(" ")[0] ?? session.user?.email ?? "Пользователь";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const menuItems = role === "PRACTITIONER" ? [
    { href: "/dashboard/practitioner", label: "Мой кабинет" },
    { href: "/dashboard/practitioner/profile", label: "Профиль практика" },
    { href: "/dashboard/settings", label: "Настройки" },
  ] : role === "ADMIN" ? [
    { href: "/admin", label: "Панель администратора" },
    { href: "/dashboard/settings", label: "Настройки" },
  ] : [
    { href: "/dashboard", label: "Кабинет" },
    { href: "/dashboard/billing", label: "Оплата и тарифы" },
    { href: "/dashboard/settings", label: "Настройки и безопасность" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden md:block">{name}</span>
        <span className="text-xs text-muted-foreground/60">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border/40 bg-navy/95 shadow-xl backdrop-blur-xl">
          <div className="border-b border-border/30 px-4 py-3">
            <p className="text-sm font-medium">{session.user?.name}</p>
            <p className="text-xs text-muted-foreground">{session.user?.email}</p>
          </div>
          <div className="py-1">
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-border/30 py-1">
            <button
              onClick={() => { setOpen(false); signOut({ callbackUrl: "/" }); }}
              className="w-full px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
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
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // @ts-expect-error custom
  const role: string = session?.user?.role ?? "GUEST";
  const nav = !session ? GUEST_NAV
    : role === "PRACTITIONER" ? PRACTITIONER_NAV
    : role === "ADMIN" ? ADMIN_NAV
    : CLIENT_NAV;

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-navy/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={!session ? "/" : role === "PRACTITIONER" ? "/dashboard/practitioner" : role === "ADMIN" ? "/admin" : "/dashboard"}
          className="flex items-center gap-2.5 shrink-0">
          <Image src="/logo.svg" alt="ETerapy" width={28} height={28} />
          <span className="font-heading text-xl font-bold text-primary">ETerapy</span>
        </Link>

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

        <div className="flex items-center gap-2">
          {session ? (
            <UserMenu session={session} />
          ) : (
            <>
              <Link href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden text-muted-foreground md:inline-flex")}>
                Войти
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
                Начать бесплатно
              </Link>
            </>
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
        <div className="border-t border-border/40 bg-navy/95 px-4 py-4 md:hidden">
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
            {session ? (
              <button onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/" }); }}
                className="mt-2 rounded-lg border border-border/30 px-3 py-2.5 text-left text-sm text-muted-foreground">
                Выйти
              </button>
            ) : (
              <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
                <Link href="/login" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-muted-foreground")}>Войти</Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }), "flex-1")}>Регистрация</Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

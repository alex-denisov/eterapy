"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

// Навигация для гостей — лендинг-ориентированная
const GUEST_NAV = [
  { href: "/practitioners", label: "Найти практика" },
  { href: "/tools", label: "Инструменты" },
  { href: "/#for-practitioners", label: "Для практиков" },
  { href: "/#faq", label: "FAQ" },
];

// Навигация для авторизованных — платформа-ориентированная
const AUTH_NAV = [
  { href: "/practitioners", label: "Найти практика" },
  { href: "/tools", label: "Инструменты" },
  { href: "/dashboard", label: "Кабинет" },
];

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = session ? AUTH_NAV : GUEST_NAV;

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-navy/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Логотип */}
        <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2.5 shrink-0">
          <Image src="/logo.svg" alt="ETerapy" width={28} height={28} />
          <span className="font-heading text-xl font-bold text-primary">ETerapy</span>
        </Link>

        {/* Десктоп навигация */}
        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Действия */}
        <div className="flex items-center gap-2">
          {session ? (
            <Link
              href="/dashboard"
              className={cn(
                "hidden md:flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {session.user?.name?.split(" ")[0] ?? session.user?.email}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden text-muted-foreground md:inline-flex")}
              >
                Войти
              </Link>
              <Link
                href="/register"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Начать бесплатно
              </Link>
            </>
          )}

          {/* Бургер для мобильных */}
          <button
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Меню"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Мобильное меню */}
      {mobileOpen && (
        <div className="border-t border-border/40 bg-navy/95 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            ))}
            {!session && (
              <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
                <Link href="/login" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 text-muted-foreground")}>
                  Войти
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ size: "sm" }), "flex-1")}>
                  Регистрация
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

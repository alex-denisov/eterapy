"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { appUrl } from "@/lib/subdomain";

const TOOLS_NAV = [
  { href: appUrl("/cabinet/modalities"), icon: "✦", label: "Все направления" },
  { href: appUrl("/cabinet/modalities/tarot"), icon: "🃏", label: "Расклад Таро" },
  { href: appUrl("/cabinet/modalities/checkin"), icon: "💬", label: "Рефлексия" },
  { href: appUrl("/cabinet/modalities/horoscope"), icon: "🌙", label: "Гороскоп" },
  { href: appUrl("/cabinet/modalities/numerology"), icon: "🔢", label: "Нумерология" },
  { href: appUrl("/cabinet/modalities/natal"), icon: "⭐", label: "Натальная карта" },
  { href: appUrl("/cabinet/modalities/guide"), icon: "📖", label: "Личный гид" },
];

const CLIENT_LINKS = [
  { href: appUrl("/cabinet"), icon: "🏠", label: "Кабинет" },
  { href: appUrl("/cabinet/bookings"), icon: "📅", label: "Мои записи" },
  { href: appUrl("/cabinet/billing"), icon: "💳", label: "Баланс и оплата" },
];

export function ToolsLayoutClient({
  role,
  user,
  children,
}: {
  role: string | null;
  user: { name?: string | null; email?: string | null } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoggedIn = !!user;

  function isActive(href: string) {
    if (href === "/cabinet/modalities") return pathname === "/cabinet/modalities";
    return pathname.startsWith(href);
  }

  // Гость — простой layout без sidebar
  if (!isLoggedIn || role === "ADMIN") {
    return (
      <>
        {pathname !== "/all-modalities" && (
          <div className="border-b border-border/30 bg-navy/50">
            <div className="mx-auto flex max-w-6xl items-center px-4 py-2.5">
              <Link href="/all-modalities" className="text-sm text-muted-foreground hover:text-foreground">
                ← Все направления
              </Link>
            </div>
          </div>
        )}
        {children}
      </>
    );
  }

  const initial = user.name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "?";
  const cabinetHref = role === "PRACTITIONER" ? "/cabinet/practitioner" : "/cabinet";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — sticky, own scroll */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className="mb-4 px-2">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{user.name ?? user.email}</p>
            </div>
          </div>
        </div>

        {/* Tool nav */}
        <div className="mb-4">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Направления
          </p>
          <nav className="space-y-0.5">
            {TOOLS_NAV.map((item) => (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}>
                <span className="text-sm w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Cabinet links */}
        <div>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Кабинет
          </p>
          <nav className="space-y-0.5">
            <Link href={cabinetHref}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
              <span className="text-sm w-4 text-center">🏠</span>
              {role === "PRACTITIONER" ? "Мой кабинет" : "Кабинет"}
            </Link>
            {role === "CLIENT" && CLIENT_LINKS.slice(1).map((item) => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
                <span className="text-sm w-4 text-center">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-auto">
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <span className="text-sm w-4 text-center">🚪</span>
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile: top back link */}
      <div className="md:hidden fixed top-16 left-0 right-0 z-30 border-b border-border/20 bg-navy/90 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-2">
          <Link href={appUrl("/cabinet/modalities")} className="text-sm text-muted-foreground hover:text-foreground">← Направления</Link>
          <span className="text-muted-foreground/30">|</span>
          <Link href={cabinetHref} className="text-sm text-muted-foreground hover:text-foreground">Кабинет</Link>
        </div>
      </div>

      <main className="flex-1 min-w-0 md:pt-0 pt-12">
        {children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/admin", icon: "🏠", label: "Обзор" },
  { href: "/admin/practitioners", icon: "🔮", label: "Практики" },
  { href: "/admin/users", icon: "👤", label: "Пользователи" },
  { href: "/admin/bookings", icon: "📅", label: "Бронирования" },
  { href: "/admin/settings", icon: "⚙️", label: "Настройки" },
];

export function AdminShell({ user, children }: { user: { name?: string | null; email?: string | null } | undefined; children: React.ReactNode }) {
  const pathname = usePathname();
  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6">
        <div className="mb-6 px-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Администратор</p>
          <p className="font-medium text-sm truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 space-y-0.5">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <button onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors mt-2">
          <span className="text-base">🚪</span>
          Выйти
        </button>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

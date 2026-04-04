"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const BASE_NAV = [
  { href: "/admin", icon: "🏠", label: "Обзор" },
  { href: "/admin/practitioners", icon: "🔮", label: "Практики" },
  { href: "/admin/users", icon: "👤", label: "Пользователи" },
  { href: "/admin/bookings", icon: "📅", label: "Бронирования" },
];

const SUPERADMIN_EXTRA = [
  { href: "/admin/metrics", icon: "📊", label: "Метрики" },
  { href: "/admin/payments", icon: "💳", label: "Выплаты" },
  { href: "/admin/files", icon: "📁", label: "Файлы" },
  { href: "/admin/sessions", icon: "🔐", label: "Сессии" },
  { href: "/admin/logs", icon: "📋", label: "Логи" },
  { href: "/admin/system", icon: "⚙️", label: "Система" },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  SUPERADMIN: "Суперадминистратор",
};

export function AdminShell({
  user,
  role,
  children,
}: {
  user: { name?: string | null; email?: string | null } | undefined;
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSuperAdmin = role === "SUPERADMIN";
  const nav = isSuperAdmin ? [...BASE_NAV, ...SUPERADMIN_EXTRA] : BASE_NAV;

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/20 bg-card/20 px-3 py-6">
        <div className="mb-6 px-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            {ROLE_LABELS[role] ?? "Администратор"}
          </p>
          <p className="font-medium text-sm truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border/20 pt-2 mt-2">
          <Link href="/admin/settings"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <span className="text-base">⚙️</span>
            Настройки
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
            <span className="text-base">🚪</span>
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

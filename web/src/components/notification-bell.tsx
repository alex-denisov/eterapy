"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, Check, Trash2, Calendar, Star, Clock, Wallet, Info } from "lucide-react";
import type { NotifEvent } from "@/lib/notification-events";

interface ApiNotification {
  id: string;
  event: NotifEvent;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const ICON_MAP: Record<NotifEvent, React.ElementType> = {
  BOOKING_REQUESTED: Calendar,
  BOOKING_CONFIRMED: Calendar,
  BOOKING_CANCELLED: Calendar,
  BOOKING_REMINDER: Clock,
  SESSION_STARTED: Clock,
  SESSION_COMPLETED: Star,
  REVIEW_REQUESTED: Star,
  NEW_REVIEW: Star,
  PAYMENT_RECEIVED: Wallet,
  PAYOUT_SCHEDULED: Wallet,
  BALANCE_TOPUP: Wallet,
  PRODUCT_UNLOCKED: Wallet,
  SUBSCRIPTION_STARTED: Wallet,
  SUBSCRIPTION_CANCELLED: Wallet,
  SUBSCRIPTION_PAYMENT_FAILED: Wallet,
  CARD_LINKED: Wallet,
  CARD_REMOVED: Wallet,
};

const ICON_BG_MAP: Record<NotifEvent, string> = {
  BOOKING_REQUESTED: "bg-emerald-500/15 text-emerald-400",
  BOOKING_CONFIRMED: "bg-emerald-500/15 text-emerald-400",
  BOOKING_CANCELLED: "bg-rose-500/15 text-rose-400",
  BOOKING_REMINDER: "bg-amber-500/15 text-amber-400",
  SESSION_STARTED: "bg-amber-500/15 text-amber-400",
  SESSION_COMPLETED: "bg-violet-500/15 text-violet-400",
  REVIEW_REQUESTED: "bg-violet-500/15 text-violet-400",
  NEW_REVIEW: "bg-violet-500/15 text-violet-400",
  PAYMENT_RECEIVED: "bg-sky-500/15 text-sky-400",
  PAYOUT_SCHEDULED: "bg-sky-500/15 text-sky-400",
  BALANCE_TOPUP: "bg-sky-500/15 text-sky-400",
  PRODUCT_UNLOCKED: "bg-sky-500/15 text-sky-400",
  SUBSCRIPTION_STARTED: "bg-sky-500/15 text-sky-400",
  SUBSCRIPTION_CANCELLED: "bg-amber-500/15 text-amber-400",
  SUBSCRIPTION_PAYMENT_FAILED: "bg-rose-500/15 text-rose-400",
  CARD_LINKED: "bg-sky-500/15 text-sky-400",
  CARD_REMOVED: "bg-sky-500/15 text-sky-400",
};

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.round(hrs / 24);
  return `${days} д назад`;
}

function NotificationItem({
  n,
  onMarkRead,
}: {
  n: ApiNotification;
  onMarkRead: (id: string) => void;
}) {
  const Icon = ICON_MAP[n.event] ?? Info;
  const iconBg = ICON_BG_MAP[n.event] ?? "bg-slate-500/15 text-slate-400";

  const inner = (
    <div className={`w-full text-left px-3 py-2.5 flex gap-3 rounded-lg transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/5 ${!n.read ? "bg-primary/5" : ""}`}>
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{n.title}</p>
          {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground leading-tight truncate">{n.body}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{relTime(n.createdAt)}</p>
      </div>
    </div>
  );

  if (n.href) {
    return (
      <a href={n.href} onClick={() => onMarkRead(n.id)} aria-label={`${n.title}: ${n.body}`} className="block">
        {inner}
      </a>
    );
  }
  return (
    <button onClick={() => onMarkRead(n.id)} aria-label={`${n.title}: ${n.body}`} className="block w-full">
      {inner}
    </button>
  );
}

interface NotificationBellProps {
  variant?: "header" | "cabinet";
}

const POLL_MS = 30_000;

export function NotificationBell({ variant = "header" }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("NOTIFICATIONS_FAILED");
      const d = await res.json();
      setNotifications(d.notifications ?? []);
    } catch {
      setError("Не удалось загрузить уведомления");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling. The zero-delay timer keeps React Compiler happy by
  // avoiding direct state changes during the effect setup phase.
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load();
    }, 0);
    const t = setInterval(load, POLL_MS);
    return () => {
      window.clearTimeout(initial);
      clearInterval(t);
    };
  }, [load]);

  // Refresh on open (best-effort immediacy)
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

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
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open]);

  async function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }

  async function handleClearAll() {
    setNotifications([]);
    fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }

  const isHeader = variant === "header";

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Уведомления${unreadCount > 0 ? `, непрочитанных: ${unreadCount}` : ""}`}
        className="flex items-center justify-center gap-2 rounded-lg border border-border/40 bg-card/30 px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground soft-notification-trigger"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--soft-terracotta)] ring-1 ring-white/80" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className={`soft-notification-popover absolute z-50 mt-2 w-[300px] rounded-xl border border-border/40 bg-navy/95 shadow-xl backdrop-blur-xl ${isHeader ? "right-0" : "left-0"}`}
          style={{ animation: "notificationSlideIn 0.15s ease-out" }}
        >
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold">Уведомления</h2>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                <Check className="h-3 w-3" />
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" data-testid="notification-bell-loading">
                <Bell className="h-8 w-8 animate-pulse text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Загружаем уведомления...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center" data-testid="notification-bell-error">
                <Info className="h-8 w-8 text-amber-400/70" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <button onClick={load} className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  Повторить
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Нет уведомлений</p>
              </div>
            ) : (
              <div className="px-2 py-1.5 space-y-0.5">
                {notifications.map((n) => (
                  <NotificationItem key={n.id} n={n} onMarkRead={handleMarkRead} />
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-border/30 px-3 py-2">
              <button onClick={handleClearAll} className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                <Trash2 className="h-3 w-3" />
                Очистить все
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes notificationSlideIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  BookmarkCheck,
  Calendar,
  Check,
  Clock,
  Info,
  Settings as SettingsIcon,
  Sparkles,
  Star,
  Users,
  Wallet,
} from "lucide-react";
import { appUrl } from "@/lib/subdomain";
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

// B331: v4.2 NotifMenu spec (docs/Design/v4.2/screens/user_nav.jsx).
// Per-event glyph rendered as a 28×28 paper-card / paper-edge tile with
// terracotta-d icon — same family as the user-pill avatar.
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
  PRODUCT_UNLOCKED: BookmarkCheck,
  SUBSCRIPTION_STARTED: Wallet,
  SUBSCRIPTION_RENEWAL: Wallet,
  SUBSCRIPTION_CANCELLED: Wallet,
  SUBSCRIPTION_PAYMENT_FAILED: Wallet,
  CARD_LINKED: Wallet,
  CARD_REMOVED: Wallet,
  DAILY_CARD: Sparkles,
  ABANDONED_CHECKOUT: Wallet,
  REPORT_READY: BookmarkCheck,
  PARTNER_COMPLETED: Users,
  CIRCLE_READY: Users,
  ROUTE_REMINDER: Clock,
  WEEKLY_DIGEST: Sparkles,
  PRACTITIONER_DIGEST: Calendar,
  COMPLIANCE_ALERT: Info,
  CREDITS_EXPIRING: Wallet,
  STREAK_AT_RISK: Clock,
  MOMENT_OF_NEED: Sparkles,
  WELCOME_CREDITS: Wallet,
  WELCOME_CREDITS_REMINDER: Wallet,
};

// B331: short relative time per v4.2 ("12 мин" / "2 ч" / "сегодня" /
// "вчера" / "5 мая"). The full "X мин назад" form was too noisy inside
// the dense 12px metadata line of the notification card.
function relTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "сейчас";
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 6) return `${hours} ч`;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  if (date.getTime() >= startOfToday) return "сегодня";
  if (date.getTime() >= startOfYesterday) return "вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function NotificationItem({
  n,
  onMarkRead,
}: {
  n: ApiNotification;
  onMarkRead: (id: string) => void;
}) {
  const Icon = ICON_MAP[n.event] ?? Info;

  const inner = (
    <div
      className="flex w-full gap-2.5 rounded-[14px] p-3 text-left transition-colors"
      style={{
        background: n.read ? "transparent" : "var(--soft-apricot)",
      }}
      data-testid={`notification-item-${n.read ? "read" : "unread"}`}
    >
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{
          background: n.read ? "var(--soft-paper-edge)" : "var(--soft-paper-card)",
        }}
      >
        <Icon className="size-3.5" style={{ color: "var(--soft-terracotta-dark)" }} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className="truncate text-[12.5px] font-semibold leading-snug"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            {n.title}
          </span>
          <span
            className="shrink-0 text-[10px] leading-snug"
            style={{ color: "var(--soft-ink-faint)" }}
          >
            {relTime(n.createdAt)}
          </span>
        </div>
        <p
          className="mt-1 text-[12px] leading-relaxed"
          style={{ color: "var(--soft-ink-soft)" }}
        >
          {n.body}
        </p>
      </div>
      {!n.read && (
        <span
          className="mt-1.5 size-1.5 shrink-0 rounded-full"
          style={{ background: "var(--soft-terracotta-dark)" }}
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (n.href) {
    return (
      <a
        href={n.href}
        onClick={() => onMarkRead(n.id)}
        aria-label={`${n.title}: ${n.body}`}
        className="block"
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      onClick={() => onMarkRead(n.id)}
      aria-label={`${n.title}: ${n.body}`}
      className="block w-full"
    >
      {inner}
    </button>
  );
}

interface NotificationBellProps {
  variant?: "header" | "cabinet";
}

const POLL_MS = 30_000;
type Filter = "all" | "unread";

export function NotificationBell({ variant = "header" }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );
  const filtered = useMemo(
    () => (filter === "all" ? notifications : notifications.filter((notification) => !notification.read)),
    [notifications, filter],
  );

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

  async function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
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
        className="soft-user-icon soft-notification-trigger relative"
        data-testid="notification-bell-trigger"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && <span className="soft-dot-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className={`soft-notification-popover absolute z-50 mt-2 flex max-h-[min(70vh,34rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] shadow-[var(--soft-shadow-lg)] ${isHeader ? "right-0" : "left-0"}`}
          style={{ animation: "notificationSlideIn 0.15s ease-out" }}
          data-testid="notification-bell-dropdown"
        >
          {/* B331: header — title + sub-line "{X} непрочитанных · приходят
              сюда, в email и Telegram" + "прочитать все" chip per
              docs/Design/v4.2/screens/user_nav.jsx NotifMenu spec. */}
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--soft-paper-edge)" }}
          >
            <div className="min-w-0">
              <p
                className="text-[15px] font-semibold"
                style={{ color: "var(--soft-bordeaux)" }}
              >
                Уведомления
              </p>
              <p
                className="mt-0.5 text-[11.5px] leading-snug"
                style={{ color: "var(--soft-ink-faint)" }}
              >
                {unreadCount > 0
                  ? `${unreadCount} непрочитанных · приходят сюда, в email и Telegram`
                  : "Всё спокойно · email и Telegram уведомления настраиваются в кабинете"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="soft-chip shrink-0"
                style={{ fontSize: 10, padding: "3px 8px", whiteSpace: "nowrap" }}
                data-testid="notification-bell-mark-all-read"
              >
                <Check className="size-3" aria-hidden="true" />
                прочитать все
              </button>
            )}
          </div>

          {/* B331: filter chips Все / Непрочитанные {count}. */}
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`soft-chip ${filter === "all" ? "soft-chip-warm" : ""}`}
              style={{ fontSize: 11, padding: "4px 10px" }}
              data-testid="notification-filter-all"
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`soft-chip ${filter === "unread" ? "soft-chip-warm" : ""}`}
              style={{ fontSize: 11, padding: "4px 10px" }}
              data-testid="notification-filter-unread"
            >
              Непрочитанные
              {unreadCount > 0 && (
                <span style={{ opacity: 0.7, marginLeft: 4 }}>{unreadCount}</span>
              )}
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            data-testid="notification-bell-list"
          >
            {loading && notifications.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 px-4 py-10 text-center"
                data-testid="notification-bell-loading"
              >
                <Bell className="size-7 animate-pulse" style={{ color: "var(--soft-ink-faint)" }} />
                <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                  Загружаем уведомления…
                </p>
              </div>
            ) : error ? (
              <div
                className="flex flex-col items-center gap-3 px-4 py-10 text-center"
                data-testid="notification-bell-error"
              >
                <Info className="size-7" style={{ color: "var(--soft-terracotta-dark)" }} />
                <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                  {error}
                </p>
                <button
                  onClick={load}
                  className="soft-chip"
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  Повторить
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center" data-testid="notification-bell-empty">
                <Bell className="size-7" style={{ color: "var(--soft-ink-faint)" }} />
                <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                  {filter === "unread" ? "Всё прочитано" : "Пока пусто"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((notification) => (
                  <NotificationItem key={notification.id} n={notification} onMarkRead={handleMarkRead} />
                ))}
              </div>
            )}
          </div>

          {/* B331: footer — "Настроить уведомления →" link to /cabinet/settings.
              v4.2 spec replaces the old "Очистить все" destructive action,
              which was off-pattern for an inbox. */}
          <div
            className="shrink-0 border-t px-3 py-2.5"
            style={{ borderColor: "var(--soft-paper-edge)" }}
          >
            <a
              href={appUrl("/settings")}
              onClick={() => setOpen(false)}
              className="soft-chip w-full justify-center"
              style={{ fontSize: 12, padding: "6px 12px" }}
              data-testid="notification-bell-settings-link"
            >
              <SettingsIcon className="size-3" aria-hidden="true" />
              Настроить уведомления →
            </a>
          </div>
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

"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, Trash2, Calendar, Star, Clock, Wallet } from "lucide-react";

export interface Notification {
  id: string;
  type: "booking" | "tarot" | "reminder" | "payment";
  title: string;
  description: string;
  timeAgo: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "booking",
    title: "Бронирование подтверждено",
    description: "Елена Морозова, 12 апреля",
    timeAgo: "2 ч назад",
    read: false,
  },
  {
    id: "2",
    type: "tarot",
    title: "Расклад Таро готов",
    description: "Полный расклад доступен в истории",
    timeAgo: "5 ч назад",
    read: false,
  },
  {
    id: "3",
    type: "reminder",
    title: "Напоминание",
    description: "Сессия через 30 минут",
    timeAgo: "30 мин назад",
    read: true,
  },
  {
    id: "4",
    type: "payment",
    title: "Пополнение баланса",
    description: "500 ₽ зачислено",
    timeAgo: "1 д назад",
    read: true,
  },
];

const ICON_MAP: Record<Notification["type"], React.ElementType> = {
  booking: Calendar,
  tarot: Star,
  reminder: Clock,
  payment: Wallet,
};

const ICON_BG_MAP: Record<Notification["type"], string> = {
  booking: "bg-emerald-500/15 text-emerald-400",
  tarot: "bg-violet-500/15 text-violet-400",
  reminder: "bg-amber-500/15 text-amber-400",
  payment: "bg-sky-500/15 text-sky-400",
};

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const Icon = ICON_MAP[notification.type];
  const iconBg = ICON_BG_MAP[notification.type];

  return (
    <button
      onClick={() => onMarkRead(notification.id)}
      className={`w-full text-left px-3 py-2.5 flex gap-3 rounded-lg transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/5 ${
        !notification.read ? "bg-primary/5" : ""
      }`}
      aria-label={`${notification.title}: ${notification.description}`}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight">{notification.title}</p>
          {!notification.read && (
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground leading-tight truncate">
          {notification.description}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">{notification.timeAgo}</p>
      </div>
    </button>
  );
}

interface NotificationBellProps {
  variant?: "header" | "cabinet";
}

export function NotificationBell({ variant = "header" }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  function handleMarkRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function handleClearAll() {
    setNotifications([]);
  }

  const isHeader = variant === "header";

  return (
    <div ref={ref} className="relative">
      {/* Bell trigger */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Уведомления${unreadCount > 0 ? `, непрочитанных: ${unreadCount}` : ""}`}
        className={`relative flex items-center justify-center rounded-lg transition-colors hover:bg-white/5 hover:text-foreground ${
          isHeader
            ? "h-9 w-9 text-muted-foreground"
            : "h-9 w-9 text-muted-foreground"
        }`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className={`absolute z-50 mt-2 w-[300px] rounded-xl border border-border/40 bg-navy/95 shadow-xl backdrop-blur-xl ${
            isHeader ? "right-0" : "left-0"
          }`}
          style={{
            animation: "notificationSlideIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h2 className="text-sm font-semibold">Уведомления</h2>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Check className="h-3 w-3" />
                Прочитать все
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Нет уведомлений</p>
              </div>
            ) : (
              <div className="px-2 py-1.5 space-y-0.5">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border/30 px-3 py-2">
              <button
                onClick={handleClearAll}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
                Очистить все
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline animation keyframes */}
      <style jsx>{`
        @keyframes notificationSlideIn {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

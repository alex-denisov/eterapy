"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getEventsForRole,
  NOTIFICATION_CATEGORY_META,
  type NotificationCategory,
  type UserRole,
} from "@/lib/notification-events";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string>) => void;
  }
}

type Channel = "EMAIL" | "TELEGRAM" | "WEB";

interface Pref {
  event: string;
  category?: NotificationCategory;
  channel: Channel;
  enabled: boolean;
  remindBeforeHours: (number | null)[];
}

interface QuietHours {
  enabled: boolean;
  from: string;
  to: string;
  timezone: string;
}

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: 24,   label: "24 ч" },
  { value: 2,    label: "2 ч" },
  { value: 1,    label: "1 ч" },
];

/** Telegram SVG-иконка */
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.03-2.04 1.3-5.78 3.82-.54.37-1.04.55-1.48.54-.49-.01-1.43-.28-2.13-.51-.86-.28-1.54-.43-1.48-.91.03-.25.38-.51 1.05-.77 4.12-1.79 6.87-2.97 8.25-3.54 3.93-1.62 4.75-1.9 5.28-1.91.12 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/>
    </svg>
  );
}

export function NotificationSettings({ telegramStatus, role }: { telegramStatus: TelegramStatus; role: UserRole }) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [quietHours, setQuietHours] = useState<QuietHours>({
    enabled: false,
    from: "22:00",
    to: "09:00",
    timezone: "Europe/Moscow",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tgStatus, setTgStatus] = useState<TelegramStatus>({
    linked: Boolean(telegramStatus.linked),
    username: telegramStatus.username ?? null,
  });
  const [tgLinking, setTgLinking] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch("/api/notifications/preferences")
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setPrefs(d.prefs ?? []);
        if (d.quietHours) setQuietHours(d.quietHours);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleTelegramAuth = useCallback(async (authData: Record<string, string>) => {
    setTgLinking(true);
    setTelegramError(null);
    try {
      const res = await fetch("/api/notifications/telegram-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authData),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setTgStatus({ linked: true, username: d.username ?? authData.username ?? null });
        toast.success("Telegram привязан");
      } else {
        setTelegramError(d.error ?? "Не удалось привязать Telegram");
        toast.error(d.error ?? "Ошибка привязки");
      }
    } catch {
      setTelegramError("Не удалось привязать Telegram. Попробуйте еще раз.");
      toast.error("Не удалось привязать Telegram");
    } finally {
      setTgLinking(false);
    }
  }, []);

  useEffect(() => {
    if (loading || tgStatus.linked) return;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?7";
    script.async = true;
    script.setAttribute("data-telegram-login", process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "eterapy_deploy_bot");
    script.setAttribute("data-size", "medium");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");

    window.onTelegramAuth = (user: Record<string, string>) => {
      void handleTelegramAuth(user);
    };

    if (widgetRef.current) {
      widgetRef.current.innerHTML = "";
      widgetRef.current.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [handleTelegramAuth, tgStatus.linked, loading]);

  function getPref(event: string, channel: Channel): Pref | undefined {
    return prefs.find(p => p.event === event && p.channel === channel);
  }

  function updatePref(event: string, channel: Channel, patch: Partial<Pref>) {
    setPrefs(prev => {
      const existing = prev.find(p => p.event === event && p.channel === channel);
      if (existing) {
        return prev.map(p => p.event === event && p.channel === channel ? { ...p, ...patch } : p);
      }
      return [...prev, { event, channel, enabled: false, remindBeforeHours: [], ...patch }];
    });
  }

  function setCategoryChannel(category: NotificationCategory, channel: Channel, enabled: boolean) {
    const categoryEvents = events
      .filter(event => event.category === category)
      .map(event => event.event);
    setPrefs(prev => {
      const next = [...prev];
      for (const event of categoryEvents) {
        const index = next.findIndex(p => p.event === event && p.channel === channel);
        if (index >= 0) next[index] = { ...next[index], enabled };
        else next.push({ event, category, channel, enabled, remindBeforeHours: [] });
      }
      return next;
    });
  }

  function toggleReminder(event: string, channel: Channel, value: number | null) {
    const current = getPref(event, channel)?.remindBeforeHours ?? [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    updatePref(event, channel, { remindBeforeHours: updated });
  }

  async function saveAll() {
    setSaving(true);
    const res = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs, quietHours }),
    });
    if ((await res.json()).ok) toast.success("Настройки уведомлений сохранены");
    else toast.error("Ошибка сохранения");
    setSaving(false);
  }

  async function unlinkTelegram() {
    setTelegramError(null);
    try {
      const res = await fetch("/api/notifications/telegram-link", { method: "DELETE" });
      const d = await res.json();
      if (res.ok && d.ok) {
        setTgStatus({ linked: false, username: null });
        toast.success("Telegram отвязан");
      } else {
        const message = d.error ?? "Не удалось отвязать Telegram";
        setTelegramError(message);
        toast.error(message);
      }
    } catch {
      setTelegramError("Не удалось отвязать Telegram. Попробуйте еще раз.");
      toast.error("Не удалось отвязать Telegram");
    }
  }

  const events = getEventsForRole(role);
  const eventMeta = Object.fromEntries(
    events.map((event) => [event.event, { label: event.label, description: event.description }]),
  ) as Record<string, { label: string; description: string }>;
  const groupedEvents = (() => {
    const groups = new Map<NotificationCategory, typeof events>();
    for (const event of events) {
      const group = groups.get(event.category) ?? [];
      group.push(event);
      groups.set(event.category, group);
    }
    return Array.from(groups.entries());
  })();

  if (loading) {
    return <div className="soft-card animate-pulse p-5 text-sm text-[var(--soft-ink-faint)]">Загружаем настройки...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Telegram-привязка */}
      <div className="soft-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <TelegramIcon className="text-[#229ED9]" /> Telegram
            </h3>
            <p className="text-sm text-muted-foreground/70 mt-0.5">
              Получайте уведомления в Telegram мгновенно.
            </p>
          </div>
          {tgStatus.linked ? (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs font-medium text-[var(--soft-sage)]">Привязан</p>
                {tgStatus.username && (
                  <p className="text-xs text-muted-foreground/70">@{tgStatus.username}</p>
                )}
              </div>
              <button onClick={unlinkTelegram}
                className="rounded-lg border border-[var(--soft-paper-edge)] px-3 py-1.5 text-xs text-[var(--soft-bordeaux)] hover:bg-[var(--soft-paper-deep)]">
                Отвязать
              </button>
            </div>
          ) : (
            <div className="shrink-0 text-right">
              {tgLinking ? (
                <p className="text-xs text-[var(--soft-sage)] animate-pulse mb-1">Привязываем...</p>
              ) : (
                <div ref={widgetRef} className="inline-flex" />
              )}
              {telegramError && (
                <p className="mt-2 max-w-48 text-[10px] text-[var(--soft-terracotta-dark)] text-right" role="status">
                  {telegramError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="soft-card p-5" data-testid="notification-quiet-hours">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold">Тихие часы</h3>
            <p className="mt-0.5 text-sm text-muted-foreground/70">
              В это время не показываем некритичные push-уведомления; срочные события останутся в кабинете.
            </p>
          </div>
          <ToggleSwitch
            enabled={quietHours.enabled}
            onToggle={() => setQuietHours(prev => ({ ...prev, enabled: !prev.enabled }))}
            label="Тихие часы"
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground/70">
            С
            <input
              type="time"
              value={quietHours.from}
              onChange={e => setQuietHours(prev => ({ ...prev, from: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground/70">
            До
            <input
              type="time"
              value={quietHours.to}
              onChange={e => setQuietHours(prev => ({ ...prev, to: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground/70">
            Часовой пояс
            <input
              type="text"
              value={quietHours.timezone}
              onChange={e => setQuietHours(prev => ({ ...prev, timezone: e.target.value }))}
              className="mt-1 block w-full rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 py-2 text-sm"
              placeholder="Europe/Moscow"
            />
          </label>
        </div>
      </div>

      {/* Матрица событий */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Управление уведомлениями</h3>
          <div className="flex gap-3 text-xs text-muted-foreground/70 pr-1">
            <span className="w-20 text-center">Email</span>
            <span className="w-20 text-center">Telegram</span>
            <span className="w-20 text-center">Web</span>
          </div>
        </div>

        <div className="space-y-3" data-testid="notification-category-preferences">
          {groupedEvents.map(([category, categoryEvents]) => {
            const categoryMeta = NOTIFICATION_CATEGORY_META[category];
            return (
              <section key={category} className="soft-card overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{categoryMeta.label}</p>
                    <p className="text-xs text-muted-foreground/70">{categoryMeta.description}</p>
                  </div>
                  <div className="flex gap-2">
                    {(["EMAIL", "TELEGRAM", "WEB"] as const).map(channel => (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => {
                          const allEnabled = categoryEvents.every(({ event }) => getPref(event, channel)?.enabled ?? channel !== "TELEGRAM");
                          if (channel === "TELEGRAM" && !tgStatus.linked && !allEnabled) {
                            toast("Сначала привяжите Telegram-аккаунт");
                            return;
                          }
                          setCategoryChannel(category, channel, !allEnabled);
                        }}
                        className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 py-1 text-[11px] text-[var(--soft-ink-soft)] hover:text-[var(--soft-bordeaux)]"
                      >
                        {channel === "EMAIL" ? "Email" : channel === "TELEGRAM" ? "Telegram" : "Web"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-border/10">
                  {categoryEvents.map(({ event }) => {
                    const meta = eventMeta[event];
                    if (!meta) return null;

                    const emailPref = getPref(event, "EMAIL");
                    const tgPref = getPref(event, "TELEGRAM");
                    const webPref = getPref(event, "WEB");
                    const emailEnabled = emailPref ? emailPref.enabled : true;
                    const tgEnabled = tgPref ? tgPref.enabled : false;
                    const webEnabled = webPref ? webPref.enabled : true;
                    const isReminder = event === "BOOKING_REMINDER";

                    return (
                      <div key={event} className="flex items-center gap-4 px-4 py-3 hover:bg-white/2 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{meta.label}</p>
                          <p className="text-xs text-muted-foreground/70">{meta.description}</p>
                          {isReminder && (emailEnabled || tgEnabled || webEnabled) && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground/70">До начала сессии:</span>
                              <div className="flex flex-wrap gap-1">
                                {REMINDER_OPTIONS.map(opt => {
                                  const currentVals = [
                                    ...(emailPref?.remindBeforeHours ?? []),
                                    ...(tgPref?.remindBeforeHours ?? []),
                                    ...(webPref?.remindBeforeHours ?? []),
                                  ];
                                  const isActive = currentVals.includes(opt.value);
                                  return (
                                    <button
                                      key={String(opt.value)}
                                      onClick={() => {
                                        toggleReminder(event, "EMAIL", opt.value);
                                        toggleReminder(event, "TELEGRAM", opt.value);
                                        toggleReminder(event, "WEB", opt.value);
                                      }}
                                      className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                        isActive ? "bg-primary/20 text-primary font-medium" : "bg-card/40 text-muted-foreground hover:text-foreground"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <div className="w-20 flex items-center justify-center">
                            <ToggleSwitch
                              enabled={emailEnabled}
                              onToggle={() => updatePref(event, "EMAIL", { enabled: !emailEnabled })}
                              label={`Email: ${meta.label}`}
                            />
                          </div>
                          <div className="w-20 flex items-center justify-center">
                            <ToggleSwitch
                              enabled={tgEnabled}
                              disabled={!tgStatus.linked && !tgEnabled}
                              onToggle={() => {
                                if (!tgStatus.linked && !tgEnabled) {
                                  toast("Сначала привяжите Telegram-аккаунт");
                                  return;
                                }
                                updatePref(event, "TELEGRAM", { enabled: !tgEnabled });
                              }}
                              label={`Telegram: ${meta.label}`}
                            />
                          </div>
                          <div className="w-20 flex items-center justify-center">
                            <ToggleSwitch
                              enabled={webEnabled}
                              onToggle={() => updatePref(event, "WEB", { enabled: !webEnabled })}
                              label={`Web: ${meta.label}`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <button onClick={saveAll} disabled={saving}
        className="soft-button soft-button-primary disabled:opacity-50">
        {saving ? "Сохранение..." : "Сохранить настройки"}
      </button>
    </div>
  );
}
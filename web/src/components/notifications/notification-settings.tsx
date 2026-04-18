"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getEventsForRole, type NotifEvent, type UserRole } from "@/lib/notification-events";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

type Channel = "EMAIL" | "TELEGRAM" | "WEB";

interface Pref {
  event: string;
  channel: Channel;
  enabled: boolean;
  remindBeforeHours: (number | null)[];
}

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: 24,   label: "24 ч" },
  { value: 2,    label: "2 ч" },
  { value: 1,    label: "1 ч" },
  { value: 0.25, label: "15 мин" },
];

const EVENT_META: Record<string, { label: string; description: string }> = {};

function initMeta(role: UserRole) {
  const events = getEventsForRole(role);
  events.forEach((e) => {
    EVENT_META[e.event] = { label: e.label, description: e.description };
  });
}

/** Telegram SVG-иконка */
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 
      1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 
      2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.03-2.04 
      1.3-5.78 3.82-.54.37-1.04.55-1.48.54-.49-.01-1.43-.28-2.13-.51-.86-.28-1.54-.43-1.48-.91.03-.25.38-.51 
      1.05-.77 4.12-1.79 6.87-2.97 8.25-3.54 3.93-1.62 4.75-1.9 5.28-1.91.12 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 
      .38z"/>
    </svg>
  );
}

export function NotificationSettings({ telegramStatus, role }: { telegramStatus: TelegramStatus; role: UserRole }) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tgStatus, setTgStatus] = useState(telegramStatus);
  const [tgLinkUrl, setTgLinkUrl] = useState<string | null>(null);
  const [tgLinkExpiry, setTgLinkExpiry] = useState<Date | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // Инициализация метаданных для роли
  useEffect(() => {
    initMeta(role);
  }, [role]);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then(r => r.json())
      .then(d => { setPrefs(d.prefs ?? []); setLoading(false); });
  }, []);

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
      body: JSON.stringify({ prefs }),
    });
    if ((await res.json()).ok) toast.success("Настройки уведомлений сохранены");
    else toast.error("Ошибка сохранения");
    setSaving(false);
  }

  async function generateTelegramLink() {
    setGeneratingLink(true);
    const res = await fetch("/api/notifications/telegram-link", { method: "POST" });
    const d = await res.json();
    if (d.ok) {
      setTgLinkUrl(d.url);
      setTgLinkExpiry(new Date(d.expiresAt));
    } else toast.error(d.error ?? "Ошибка");
    setGeneratingLink(false);
  }

  async function unlinkTelegram() {
    const res = await fetch("/api/notifications/telegram-link", { method: "DELETE" });
    if ((await res.json()).ok) {
      setTgStatus({ linked: false, username: null });
      setTgLinkUrl(null);
      toast.success("Telegram отвязан");
    }
  }

  if (loading) return <div className="animate-pulse text-sm text-muted-foreground">Загружаем настройки...</div>;

  const events = getEventsForRole(role);

  return (
    <div className="space-y-6">
      {/* Telegram-привязка */}
      <div className="rounded-xl border border-border/30 bg-card/20 p-5">
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
                <p className="text-xs text-green-400 font-medium">✓ Привязан</p>
                {tgStatus.username && (
                  <p className="text-xs text-muted-foreground/70">@{tgStatus.username}</p>
                )}
              </div>
              <button onClick={unlinkTelegram}
                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                Отвязать
              </button>
            </div>
          ) : (
            <div className="shrink-0 text-right">
              <button onClick={generateTelegramLink} disabled={generatingLink}
                className="rounded-lg bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 disabled:opacity-50">
                {generatingLink ? "Генерация..." : "Привязать Telegram"}
              </button>
              {tgLinkUrl && tgLinkExpiry && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground/70">
                    Ссылка действует до {tgLinkExpiry.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <a href={tgLinkUrl} target="_blank" rel="noopener noreferrer"
                    className="block rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/30 font-medium">
                    → Открыть бота для привязки
                  </a>
                </div>
              )}
            </div>
          )}
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

        <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
          {events.map(({ event }) => {
            const meta = EVENT_META[event];
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
                  {/* Email toggle */}
                  <div className="w-20 flex items-center justify-center">
                    <ToggleSwitch
                      enabled={emailEnabled}
                      onToggle={() => updatePref(event, "EMAIL", { enabled: !emailEnabled })}
                      label={`Email: ${meta.label}`}
                    />
                  </div>
                  {/* Telegram toggle */}
                  <div className="w-20 flex items-center justify-center">
                    <ToggleSwitch
                      enabled={tgEnabled}
                      disabled={!tgStatus.linked && !tgEnabled}
                      onToggle={() => {
                        if (!tgStatus.linked && !tgEnabled) {
                          toast("Сначала привяжите Telegram-аккаунт", { icon: "ℹ️" });
                          return;
                        }
                        updatePref(event, "TELEGRAM", { enabled: !tgEnabled });
                      }}
                      label={`Telegram: ${meta.label}`}
                    />
                  </div>
                  {/* Web (in-cabinet bell) toggle */}
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
      </div>

      <button onClick={saveAll} disabled={saving}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-navy disabled:opacity-50">
        {saving ? "Сохранение..." : "Сохранить настройки"}
      </button>
    </div>
  );
}

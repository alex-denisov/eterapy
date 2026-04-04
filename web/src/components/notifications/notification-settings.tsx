"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ALL_EVENTS } from "@/lib/notification-events";

type Channel = "EMAIL" | "TELEGRAM";

interface Pref {
  event: string;
  channel: Channel;
  enabled: boolean;
  remindBeforeHours: number | null;
}

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

const REMINDER_OPTIONS = [
  { value: null,  label: "Нет" },
  { value: 24,    label: "За 24 часа" },
  { value: 2,     label: "За 2 часа" },
  { value: 1,     label: "За 1 час" },
  { value: 0.25,  label: "За 15 минут" },
];

const EVENT_LABELS = Object.fromEntries(ALL_EVENTS.map(e => [e.event, { label: e.label, description: e.description }]));

export function NotificationSettings({ telegramStatus }: { telegramStatus: TelegramStatus }) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tgStatus, setTgStatus] = useState(telegramStatus);
  const [tgLinkUrl, setTgLinkUrl] = useState<string | null>(null);
  const [tgLinkExpiry, setTgLinkExpiry] = useState<Date | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

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
      return [...prev, { event, channel, enabled: false, remindBeforeHours: null, ...patch }];
    });
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

  const channels: Channel[] = ["EMAIL", "TELEGRAM"];

  return (
    <div className="space-y-6">
      {/* Telegram-привязка */}
      <div className="rounded-xl border border-border/30 bg-card/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <span className="text-blue-400">✈️</span> Telegram
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Получайте уведомления в Telegram мгновенно.
            </p>
          </div>
          {tgStatus.linked ? (
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xs text-green-400 font-medium">✓ Привязан</p>
                {tgStatus.username && (
                  <p className="text-xs text-muted-foreground">@{tgStatus.username}</p>
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
                  <p className="text-xs text-muted-foreground">
                    Ссылка действует до {tgLinkExpiry.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <a href={tgLinkUrl} target="_blank"
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
          <div className="flex gap-3 text-xs text-muted-foreground pr-1">
            <span className="w-20 text-center">Email</span>
            <span className="w-20 text-center">Telegram</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
          {ALL_EVENTS.map(({ event }) => {
            const meta = EVENT_LABELS[event];
            const emailPref = getPref(event, "EMAIL");
            const tgPref = getPref(event, "TELEGRAM");
            const emailEnabled = emailPref ? emailPref.enabled : true;
            const tgEnabled = tgPref ? tgPref.enabled : false;
            const isReminder = event === "BOOKING_REMINDER";

            return (
              <div key={event} className="flex items-center gap-4 px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  {isReminder && (emailEnabled || tgEnabled) && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Напомнить:</span>
                      <div className="flex flex-wrap gap-1">
                        {REMINDER_OPTIONS.map(opt => {
                          const currentVal = emailPref?.remindBeforeHours ?? null;
                          const isActive = currentVal === opt.value;
                          return (
                            <button key={String(opt.value)} onClick={() => {
                              updatePref(event, "EMAIL", { remindBeforeHours: opt.value });
                              updatePref(event, "TELEGRAM", { remindBeforeHours: opt.value });
                            }}
                              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                                isActive ? "bg-primary/20 text-primary" : "bg-card/40 text-muted-foreground hover:text-foreground"
                              }`}>
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
                    <button onClick={() => updatePref(event, "EMAIL", { enabled: !emailEnabled })}
                      className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
                        emailEnabled ? "bg-primary" : "bg-border/40"
                      }`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        emailEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`} />
                    </button>
                  </div>
                  {/* Telegram toggle */}
                  <div className="w-20 flex items-center justify-center">
                    <button onClick={() => {
                      if (!tgStatus.linked && !tgEnabled) {
                        toast("Сначала привяжите Telegram-аккаунт", { icon: "ℹ️" });
                        return;
                      }
                      updatePref(event, "TELEGRAM", { enabled: !tgEnabled });
                    }}
                      className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${
                        tgEnabled ? "bg-blue-500" : "bg-border/40"
                      } ${!tgStatus.linked ? "opacity-40" : ""}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        tgEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`} />
                    </button>
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

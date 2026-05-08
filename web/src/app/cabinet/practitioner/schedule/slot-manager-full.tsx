"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Slot {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  available: boolean;
}

type BulkMode = "day" | "week" | "10days" | "month" | "single";

const DURATION_OPTIONS = [
  { value: 30, label: "30 мин" },
  { value: 45, label: "45 мин" },
  { value: 60, label: "1 час" },
  { value: 90, label: "1.5 часа" },
  { value: 120, label: "2 часа" },
];

const WORK_HOURS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toLocalDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function generateSlots(
  startDate: Date,
  days: number,
  workHours: string[],
  durationMin: number
): Array<{ startAt: string; endAt: string }> {
  const slots: Array<{ startAt: string; endAt: string }> = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(startDate, d);
    const dayStr = toLocalDateStr(day);
    for (const h of workHours) {
      const startAt = new Date(`${dayStr}T${h}:00`);
      const endAt = new Date(startAt.getTime() + durationMin * 60_000);
      // Skip past slots
      if (startAt <= new Date()) continue;
      slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    }
  }
  return slots;
}

export function SlotManagerFull({ practitionerId, initialSlots }: { practitionerId: string; initialSlots: Slot[] }) {
  const [mode, setMode] = useState<BulkMode>("single");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(60);
  const [time, setTime] = useState("10:00");
  const [selectedHours, setSelectedHours] = useState<string[]>(["10:00","11:00","14:00","15:00","16:00"]);
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);

  function toggleHour(h: string) {
    setSelectedHours(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h]);
  }

  async function postSlots(toCreate: Array<{ startAt: string; endAt: string }>) {
    if (toCreate.length === 0) { toast.error("Нет слотов для создания"); return; }
    setLoading(true);
    let created = 0;
    let failed = 0;
    const newSlots: Slot[] = [];

    for (const s of toCreate) {
      try {
        const res = await fetch("/api/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
        const data = await res.json();
        if (data.slot) { newSlots.push(data.slot); created++; }
        else { failed++; }
      } catch { failed++; }
    }

    setSlots(prev => [...prev, ...newSlots].sort((a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    ));
    setLoading(false);

    if (created > 0) toast.success(`Добавлено ${created} слотов${failed > 0 ? ` (${failed} ошибок)` : ""}`);
    else toast.error(`Не удалось добавить слоты (${failed} ошибок)`);
  }

  async function handleAdd() {
    if (!date) { toast.error("Выберите дату"); return; }

    if (mode === "single") {
      const startAt = new Date(`${date}T${time}:00`);
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      if (startAt <= new Date()) { toast.error("Нельзя добавить слот в прошлом"); return; }
      await postSlots([{ startAt: startAt.toISOString(), endAt: endAt.toISOString() }]);
      setDate("");
    } else {
      const startDate = new Date(`${date}T00:00:00`);
      const days = mode === "day" ? 1 : mode === "week" ? 7 : mode === "10days" ? 10 : 30;
      const toCreate = generateSlots(startDate, days, selectedHours, duration);
      await postSlots(toCreate);
      setDate("");
    }
  }

  async function handleDelete(slotId: string) {
    try {
      const res = await fetch(`/api/slots/${slotId}`, { method: "DELETE" });
      if (res.ok) {
        setSlots(prev => prev.filter(s => s.id !== slotId));
        toast.success("Слот удалён");
      } else {
        const d = await res.json();
        toast.error(d.error || "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
  }

  const now = new Date();
  const upcoming = slots.filter(s => new Date(s.startAt) >= now);
  const past = slots.filter(s => new Date(s.startAt) < now);
  const freeCount = upcoming.filter(s => s.available).length;

  return (
    <div className="space-y-6">
      {/* Режим добавления */}
      <div className="soft-card">
        <div className="p-5">
          <h3 className="font-semibold mb-4">Добавить слоты</h3>

          {/* Режим */}
          <div className="flex flex-wrap gap-2 mb-4">
            {([
              { key: "single", label: "Один слот" },
              { key: "day", label: "Весь день" },
              { key: "week", label: "Неделя" },
              { key: "10days", label: "10 дней" },
              { key: "month", label: "Месяц" },
            ] as const).map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  mode === m.key ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-[var(--soft-ink-soft)] hover:border-primary/40"
                }`}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">
                {mode === "single" ? "Дата *" : "Начало с *"}
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                min={toLocalDateStr(new Date())}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>

            {mode === "single" && (
              <div>
                <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Время *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Длительность</label>
              <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <Button onClick={handleAdd} disabled={loading || !date}>
              {loading ? "Добавление..." : mode === "single" ? "+ Добавить слот" : `+ Добавить расписание`}
            </Button>
          </div>

          {/* Рабочие часы для bulk-режимов */}
          {mode !== "single" && (
            <div className="mt-4">
              <p className="text-xs text-[var(--soft-ink-soft)] mb-2">Рабочие часы (нажмите чтобы включить/выключить):</p>
              <div className="flex flex-wrap gap-1.5">
                {WORK_HOURS.map(h => (
                  <button key={h} onClick={() => toggleHour(h)}
                    className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                      selectedHours.includes(h)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/30 text-[var(--soft-ink-soft)] hover:border-primary/30"
                    }`}>
                    {h}
                  </button>
                ))}
              </div>
              {date && selectedHours.length > 0 && (
                <p className="mt-2 text-xs text-[var(--soft-ink-soft)]/60">
                  Будет создано ≈{selectedHours.length * (mode === "day" ? 1 : mode === "week" ? 7 : mode === "10days" ? 10 : 30)} слотов
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--soft-ink-soft)]/60">
            Добавленные слоты появятся на вашем профиле — клиенты смогут выбрать удобное время.
          </p>
        </div>
      </div>

      {/* Предстоящие */}
      <div>
        <h3 className="font-semibold mb-3">
          Свободные слоты
          <span className="ml-2 text-sm font-normal text-[var(--soft-ink-soft)]">({freeCount})</span>
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[var(--soft-ink-soft)]">Нет предстоящих слотов. Добавьте выше.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <div key={s.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                s.available ? "border-border/40 bg-card/30" : "border-yellow-500/20 bg-yellow-500/5"
              }`}>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(s.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
                    </p>
                    <p className="text-xs text-[var(--soft-ink-soft)]">
                      {new Date(s.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(s.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {!s.available && <span className="text-xs text-yellow-400 border border-yellow-500/30 rounded px-2 py-0.5">Занят</span>}
                </div>
                {s.available && (
                  <button onClick={() => handleDelete(s.id)}
                    className="text-xs text-[var(--soft-ink-soft)] hover:text-destructive transition-colors">
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Прошедшие */}
      {past.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-[var(--soft-ink-soft)] text-sm">Прошедшие ({past.length})</h3>
          <div className="space-y-1.5">
            {past.slice(-5).reverse().map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-[rgba(255,255,255,0.01)] px-4 py-2 opacity-50">
                <p className="text-xs text-[var(--soft-ink-soft)]">
                  {new Date(s.startAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{" "}
                  {new Date(s.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {!s.available && <span className="text-xs text-yellow-400/60">Занят</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

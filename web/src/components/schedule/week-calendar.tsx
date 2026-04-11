"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface ScheduleRule {
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  enabled: boolean;
}

interface BlockedSlot {
  id: string;
  startAt: string;
  endAt: string;
}

interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  priceRub: number;
  startAt: string;
  status: string;
}

// П.6 — неделя с понедельника: 1=пн, 2=вт, ... 0=вс
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // mon first
const DAY_LABELS: Record<number, string> = {
  0: "Вс", 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб",
};

function mondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=sun
  const diff = (day === 0) ? -6 : 1 - day; // get monday
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Returns "YYYY-MM-DD" in the browser's LOCAL timezone — avoids UTC off-by-one near midnight. */
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return isoDate(new Date()); }
function pad2(n: number) { return String(n).padStart(2, "0"); }

interface PendingChange {
  date: string; // "2026-04-07"
  hour: number;
  action: "block" | "unblock";
  existingBlockId?: string;
}

interface Props {
  practitionerId: string;
  onRulesChanged?: () => void;
}

export function WeekCalendar({ practitionerId, onRulesChanged }: Props) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()));
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [saving, setSaving] = useState(false);

  // Week days in Mon→Sun order
  const weekDays = DOW_ORDER.map((_, i) => addDays(weekStart, i));

  // Compute min/max working hour across all enabled rules
  const workHours = rules.filter(r => r.enabled);
  const minHour = workHours.length > 0 ? Math.min(...workHours.map(r => r.startHour)) : 8;
  const maxHour = workHours.length > 0 ? Math.max(...workHours.map(r => r.endHour)) : 22;
  const displayHours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);

  const load = useCallback(async () => {
    const [schedRes, bookRes] = await Promise.all([
      fetch(`/api/schedule?practitionerId=${practitionerId}`),
      fetch(`/api/bookings?role=practitioner`),
    ]);
    const sched = await schedRes.json();
    const bookData = await bookRes.json();
    setRules(sched.rules ?? []);
    setBlocked(sched.blocked ?? []);
    const bks: Booking[] = (bookData.bookings ?? [])
      .filter((b: any) => b.slot?.startAt && ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status))
      .map((b: any) => ({
        id: b.id,
        clientName: b.client?.name ?? "Клиент",
        clientEmail: b.client?.email ?? "",
        priceRub: b.priceRub ?? 0,
        startAt: b.slot.startAt,
        status: b.status,
      }));
    setBookings(bks);
  }, [practitionerId]);

  useEffect(() => { load(); }, [load]);

  function getRuleForDay(dow: number) { return rules.find(r => r.dayOfWeek === dow); }

  function isWorkingHour(dow: number, hour: number) {
    const rule = getRuleForDay(dow);
    if (!rule || !rule.enabled) return false;
    return hour >= rule.startHour && hour < rule.endHour;
  }

  // Check if an hour is currently booked (has an active booking)
  function getBookingAt(dateStr: string, hour: number): Booking | null {
    // dateStr is "YYYY-MM-DD" in LOCAL time (from isoDate which uses getFullYear/getMonth/getDate)
    const targetLocalStart = new Date(`${dateStr}T${pad2(hour)}:00:00`);
    const targetLocalEnd = new Date(`${dateStr}T${pad2(hour + 1)}:00:00`);
    return bookings.find(b => {
      const bStart = new Date(b.startAt);
      const bEnd = new Date(b.startAt);
      bEnd.setHours(bEnd.getHours() + 1);
      return bStart < targetLocalEnd && bEnd > targetLocalStart;
    }) ?? null;
  }

  // Check if an hour is currently blocked (committed to server)
  function isBlockedServer(date: Date, hour: number) {
    const s = new Date(date); s.setHours(hour, 0, 0, 0);
    const e = new Date(date); e.setHours(hour + 1, 0, 0, 0);
    return blocked.filter(b => {
      const bs = new Date(b.startAt), be = new Date(b.endAt);
      return s < be && e > bs;
    });
  }

  // Merge server state with pending changes
  function getCellState(dateStr: string, hour: number, dow: number): "unavailable" | "free" | "blocked" | "pending-block" | "pending-unblock" | "booked" {
    const date = weekDays[DOW_ORDER.indexOf(dow)];
    const rule = getRuleForDay(dow);
    const working = rule?.enabled && hour >= rule.startHour && hour < rule.endHour;

    // П.5 — нерабочие часы = недоступны (not blocked, just unavailable)
    if (!working) return "unavailable";

    // Check if there's an active booking at this slot
    const booking = getBookingAt(dateStr, hour);
    if (booking) return "booked";

    const serverBlocks = isBlockedServer(date, hour);
    const pendingEntry = pending.find(p => p.date === dateStr && p.hour === hour);

    if (pendingEntry) {
      return pendingEntry.action === "block" ? "pending-block" : "pending-unblock";
    }
    return serverBlocks.length > 0 ? "blocked" : "free";
  }

  function toggleCell(dateStr: string, hour: number, dow: number) {
    if (!editing) return;

    const date = weekDays[DOW_ORDER.indexOf(dow)];
    const rule = getRuleForDay(dow);
    const working = rule?.enabled && hour >= rule.startHour && hour < rule.endHour;
    if (!working) return; // can't toggle unavailable

    // Prevent blocking a slot that has an active booking
    if (getCellState(dateStr, hour, dow) === "booked") return;

    const serverBlocks = isBlockedServer(date, hour);
    const isBlockedNow = serverBlocks.length > 0;
    const pendingEntry = pending.find(p => p.date === dateStr && p.hour === hour);

    // Toggle: if pending, remove it; if not, add opposite
    if (pendingEntry) {
      setPending(prev => prev.filter(p => !(p.date === dateStr && p.hour === hour)));
    } else {
      if (isBlockedNow) {
        setPending(prev => [...prev, {
          date: dateStr, hour,
          action: "unblock",
          existingBlockId: serverBlocks[0]?.id,
        }]);
      } else {
        setPending(prev => [...prev, { date: dateStr, hour, action: "block" }]);
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    const toBlock = pending.filter(p => p.action === "block");
    const toUnblock = pending.filter(p => p.action === "unblock");

    try {
      // Apply blocks
      for (const entry of toBlock) {
        const date = entry.date;
        const startAt = new Date(`${date}T${pad2(entry.hour)}:00:00`);
        const endAt = new Date(`${date}T${pad2(entry.hour + 1)}:00:00`);
        await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
        });
      }
      // Remove blocks
      for (const entry of toUnblock) {
        if (entry.existingBlockId) {
          await fetch("/api/schedule", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockId: entry.existingBlockId }),
          });
        }
      }

      toast.success(`Расписание сохранено`);
      setPending([]);
      setEditing(false);
      await load();
    } catch { toast.error("Ошибка сохранения"); }
    finally { setSaving(false); }
  }

  function handleCancel() {
    setPending([]);
    setEditing(false);
  }

  const prevWeek = () => setWeekStart(w => addDays(w, -7));
  const nextWeek = () => setWeekStart(w => addDays(w, 7));
  const toToday  = () => setWeekStart(mondayOfWeek(new Date()));

  const weekLabel = `${weekDays[0].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;
  const pendingCount = pending.length;

  return (
    <div>
      {/* Навигация + режим редактирования */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={prevWeek} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">←</button>
        <button onClick={toToday} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Сегодня</button>
        <button onClick={nextWeek} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">→</button>
        <span className="text-sm font-medium ml-1">{weekLabel}</span>

        <div className="ml-auto flex items-center gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-1.5 text-sm text-primary font-medium hover:bg-primary/20 transition-colors">
              ✏️ Редактировать
            </button>
          ) : (
            <>
              {pendingCount > 0 && (
                <span className="text-xs text-yellow-400 mr-1">
                  {pendingCount} изменений
                </span>
              )}
              <button onClick={handleCancel}
                className="rounded-lg border border-border/40 px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Отменить
              </button>
              <button onClick={handleSave} disabled={saving || pendingCount === 0}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-navy disabled:opacity-50 transition-colors">
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-2 text-xs text-yellow-300">
          Режим редактирования: нажмите на ячейку чтобы заблокировать/разблокировать время. Нажмите «Сохранить» для применения.
        </div>
      )}

      {/* Сетка — П.2 видимые границы */}
      <div suppressHydrationWarning className="overflow-auto rounded-xl border border-border/30 bg-card/20">
        <table className="w-full text-xs border-collapse min-w-[580px]">
          <thead>
            <tr className="bg-[#0f2236]">
              {/* Столбец часов */}
              <th className="w-14 border-r border-border/30 p-2 text-muted-foreground font-normal sticky left-0 bg-[#0f2236] z-10">
                Час
              </th>
              {DOW_ORDER.map((dow, idx) => {
                const date = weekDays[idx];
                const isToday = isoDate(date) === todayStr();
                const rule = getRuleForDay(dow);
                return (
                  <th key={dow} className={`border-r border-border/20 p-2 font-medium min-w-[80px] ${
                    isToday ? "bg-primary/15 text-primary" : "text-muted-foreground"
                  }`}>
                    <div className="font-semibold">{DAY_LABELS[dow]}</div>
                    <div className={`text-[11px] mt-0.5 ${isToday ? "text-primary/80" : "text-muted-foreground/70"}`}>
                      {date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </div>
                    {rule?.enabled ? (
                      <div className="text-[10px] text-green-400/70 mt-0.5">
                        {pad2(rule.startHour)}:00–{pad2(rule.endHour)}:00
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground/40 mt-0.5">выходной</div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayHours.map((hour, hIdx) => (
              <tr key={hour} className={hIdx % 2 === 0 ? "bg-[#0a1520]" : "bg-[#0c1929]"}>
                {/* Час — П.2 чёткая граница */}
                <td className="border-r border-b border-border/20 px-2 py-0 text-center text-muted-foreground/60 font-mono text-[11px] h-8 sticky left-0 bg-inherit z-10 border-r-border/40">
                  {pad2(hour)}:00
                </td>
                {DOW_ORDER.map((dow, idx) => {
                  const date = weekDays[idx];
                  const dateStr = isoDate(date);
                  const state = getCellState(dateStr, hour, dow);
                  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                  const isPast = date < todayMidnight ||
                    (isoDate(date) === todayStr() && hour < new Date().getHours());

                  // Get booking info for this cell
                  const booking = getBookingAt(dateStr, hour);

                  const cellStyle = {
                    "unavailable":     "bg-[#080f18] cursor-default",
                    "free":            editing
                                        ? "bg-green-950/50 hover:bg-green-900/60 cursor-pointer border-green-900/30"
                                        : "bg-green-950/30",
                    "blocked":         editing
                                        ? "bg-red-950/70 hover:bg-red-900/80 cursor-pointer border-red-900/40"
                                        : "bg-red-950/50",
                    "pending-block":   "bg-yellow-900/50 cursor-pointer border-yellow-700/40",
                    "pending-unblock": "bg-teal-900/50 cursor-pointer border-teal-700/40",
                    "booked":          "bg-blue-900/60 cursor-not-allowed border-blue-700/40",
                  }[state];

                  return (
                    <td key={dow}
                      className={`border-r border-b border-border/10 h-8 relative transition-colors ${cellStyle} ${isPast ? "opacity-40" : ""}`}
                      onClick={!isPast && state !== "booked" ? () => toggleCell(dateStr, hour, dow) : undefined}
                      title={
                        state === "unavailable" ? "Нерабочее время"
                        : state === "blocked" ? (editing ? "Нажмите чтобы разблокировать" : "Заблокировано")
                        : state === "free" ? (editing ? "Нажмите чтобы заблокировать" : "Свободно")
                        : state === "pending-block" ? "Будет заблокировано"
                        : state === "pending-unblock" ? "Будет разблокировано"
                        : state === "booked" && booking ? `${booking.clientName} — ${booking.priceRub.toLocaleString("ru-RU")} ₽ (${booking.status})`
                        : "Забронировано"
                      }
                    >
                      {state === "booked" && booking ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-0.5">
                          <span className="text-[9px] font-medium text-blue-300 truncate w-full text-center leading-tight">{booking.clientName.split(" ")[0]}</span>
                          <span className="text-[8px] text-blue-400/70">{booking.priceRub.toLocaleString("ru-RU")} ₽</span>
                        </div>
                      ) : (state === "blocked" || state === "pending-block") ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-[10px] ${state === "pending-block" ? "text-yellow-400" : "text-red-400/60"}`}>✕</span>
                        </div>
                      ) : null}
                      {state === "pending-unblock" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] text-teal-400">✓</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Легенда */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-green-950/70 border border-green-900/50 inline-block" />Рабочее время
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-blue-900/60 border border-blue-700/40 inline-block" />Забронировано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-red-950/60 border border-red-900/40 inline-block" />Заблокировано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[#080f18] border border-border/20 inline-block" />Недоступно
        </span>
        {editing && <>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-yellow-900/50 border border-yellow-700/40 inline-block" />Будет заблокировано
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-teal-900/50 border border-teal-700/40 inline-block" />Будет разблокировано
          </span>
        </>}
      </div>
    </div>
  );
}

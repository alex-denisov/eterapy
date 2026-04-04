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

const DAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DAY_NAMES_FULL = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r; }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function formatHour(h: number) { return `${String(h).padStart(2, "0")}:00`; }

interface Props {
  practitionerId: string;
}

export function WeekCalendar({ practitionerId }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [blocked, setBlocked] = useState<BlockedSlot[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState<{ day: number; hour: number } | null>(null);
  const [selectEnd, setSelectEnd] = useState<{ day: number; hour: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const load = useCallback(async () => {
    const res = await fetch(`/api/schedule?practitionerId=${practitionerId}`);
    const d = await res.json();
    setRules(d.rules ?? []);
    setBlocked(d.blocked ?? []);
  }, [practitionerId]);

  useEffect(() => { load(); }, [load]);

  function getRuleForDay(dow: number) {
    return rules.find(r => r.dayOfWeek === dow);
  }

  function isWorkingHour(dow: number, hour: number) {
    const rule = getRuleForDay(dow);
    if (!rule || !rule.enabled) return false;
    return hour >= rule.startHour && hour < rule.endHour;
  }

  function isBlocked(date: Date, hour: number) {
    const slotStart = new Date(date);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(hour + 1);
    return blocked.some(b => {
      const bs = new Date(b.startAt);
      const be = new Date(b.endAt);
      return slotStart < be && slotEnd > bs;
    });
  }

  function isInSelection(dayIdx: number, hour: number) {
    if (!selecting || !selectStart || !selectEnd) return false;
    const minDay = Math.min(selectStart.day, selectEnd.day);
    const maxDay = Math.max(selectStart.day, selectEnd.day);
    const minH = Math.min(selectStart.hour, selectEnd.hour);
    const maxH = Math.max(selectStart.hour, selectEnd.hour);
    return dayIdx === minDay && dayIdx === maxDay && hour >= minH && hour <= maxH
      || (selectStart.day === selectEnd.day && dayIdx === selectStart.day && hour >= minH && hour <= maxH);
  }

  async function commitBlock() {
    if (!selectStart || !selectEnd) return;
    const dayIdx = selectStart.day;
    const date = weekDays[dayIdx];
    const minH = Math.min(selectStart.hour, selectEnd.hour);
    const maxH = Math.max(selectStart.hour, selectEnd.hour) + 1;

    const startAt = new Date(date);
    startAt.setHours(minH, 0, 0, 0);
    const endAt = new Date(date);
    endAt.setHours(maxH, 0, 0, 0);

    setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: startAt.toISOString(), endAt: endAt.toISOString() }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("Время заблокировано"); await load(); }
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setLoading(false); setSelecting(false); setSelectStart(null); setSelectEnd(null); }
  }

  async function removeBlock(blockId: string) {
    try {
      const res = await fetch("/api/schedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId }),
      });
      if ((await res.json()).ok) { toast.success("Блокировка снята"); await load(); }
    } catch { toast.error("Ошибка"); }
  }

  function handleCellMouseDown(dayIdx: number, hour: number) {
    setSelecting(true);
    setSelectStart({ day: dayIdx, hour });
    setSelectEnd({ day: dayIdx, hour });
  }

  function handleCellMouseEnter(dayIdx: number, hour: number) {
    if (!selecting) return;
    if (selectStart && dayIdx === selectStart.day) {
      setSelectEnd({ day: dayIdx, hour });
    }
  }

  function handleMouseUp() {
    if (selecting && selectStart && selectEnd) {
      commitBlock();
    }
  }

  const prevWeek = () => setWeekStart(w => addDays(w, -7));
  const nextWeek = () => setWeekStart(w => addDays(w, 7));
  const toToday  = () => setWeekStart(startOfWeek(new Date()));

  const weekLabel = `${weekDays[1].toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} – ${weekDays[5].toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="select-none" onMouseUp={handleMouseUp}>
      {/* Навигация */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={prevWeek} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">←</button>
        <button onClick={toToday} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Сегодня</button>
        <button onClick={nextWeek} className="rounded-lg border border-border/40 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">→</button>
        <span className="text-sm font-medium ml-2">{weekLabel}</span>
        {selecting && (
          <span className="ml-auto text-xs text-yellow-400 animate-pulse">
            Выделите время чтобы заблокировать → отпустите
          </span>
        )}
        {!selecting && (
          <span className="ml-auto text-xs text-muted-foreground/60">
            Нажмите и перетащите по ячейкам чтобы заблокировать время
          </span>
        )}
      </div>

      {/* Сетка */}
      <div className="overflow-auto rounded-xl border border-border/30">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-card/50">
              <th className="w-12 border-r border-border/20 p-2 text-muted-foreground font-normal">Час</th>
              {weekDays.map((d, i) => {
                const isToday = isoDate(d) === isoDate(new Date());
                const rule = getRuleForDay(d.getDay());
                return (
                  <th key={i} className={`border-r border-border/20 p-2 font-medium ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                    <div>{DAY_NAMES[d.getDay()]}</div>
                    <div className={`text-[11px] mt-0.5 ${isToday ? "text-primary" : ""}`}>
                      {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </div>
                    {rule?.enabled && (
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatHour(rule.startHour)}–{formatHour(rule.endHour)}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HOURS.filter(h => h >= 8 && h <= 22).map(hour => (
              <tr key={hour} className="group">
                <td className="border-r border-b border-border/20 px-2 py-1 text-center text-muted-foreground/60 bg-card/20 w-12">
                  {formatHour(hour)}
                </td>
                {weekDays.map((date, dayIdx) => {
                  const working = isWorkingHour(date.getDay(), hour);
                  const blockedCell = isBlocked(date, hour);
                  const inSel = isInSelection(dayIdx, hour);
                  const isPast = date < new Date() && hour < new Date().getHours() && isoDate(date) === isoDate(new Date()) || date < new Date(new Date().setHours(0,0,0,0));

                  // Найти блок для этой ячейки для удаления
                  const cellStart = new Date(date); cellStart.setHours(hour, 0, 0, 0);
                  const cellEnd = new Date(date); cellEnd.setHours(hour + 1, 0, 0, 0);
                  const blockForCell = blocked.find(b => new Date(b.startAt) <= cellStart && new Date(b.endAt) >= cellEnd);

                  return (
                    <td key={dayIdx}
                      className={`border-r border-b border-border/10 h-8 cursor-pointer transition-colors relative ${
                        isPast ? "opacity-30 cursor-default" :
                        inSel ? "bg-yellow-500/30" :
                        blockedCell ? "bg-red-900/40 cursor-pointer" :
                        working ? "bg-green-900/20 hover:bg-green-900/30" :
                        "bg-card/10 hover:bg-white/5"
                      }`}
                      onMouseDown={isPast ? undefined : () => handleCellMouseDown(dayIdx, hour)}
                      onMouseEnter={() => handleCellMouseEnter(dayIdx, hour)}
                      title={blockedCell ? "Заблокировано — нажмите чтобы снять" : working ? "Рабочее время" : "Нерабочее время"}
                      onClick={blockedCell && blockForCell && !selecting ? () => removeBlock(blockForCell.id) : undefined}
                    >
                      {blockedCell && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-red-400/60 text-[10px]">✕</span>
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
      <div className="mt-3 flex gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-green-900/40 border border-green-900/60" />Рабочие часы</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-900/40 border border-red-900/60" />Заблокировано</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-yellow-500/30 border border-yellow-500/40" />Выделение</span>
        <span className="ml-auto text-muted-foreground/50">Клик по красной ячейке — снять блок</span>
      </div>
    </div>
  );
}

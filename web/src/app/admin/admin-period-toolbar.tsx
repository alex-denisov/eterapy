"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ActiveField = "start" | "end" | null;

function parseIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toRu(value: string) {
  const date = parseIso(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function fromRu(value: string) {
  const normalized = value.trim().replace(/[/-]/g, ".");
  const match = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return toIso(date);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function presetRange(period: string) {
  const end = startOfToday();
  let start = new Date(end);
  if (period === "week") {
    const weekday = end.getDay() || 7;
    start.setDate(end.getDate() - weekday + 1);
  } else if (period === "month") {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (period === "quarter") {
    start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  }
  return { start: toIso(start), end: toIso(end) };
}

function monthDays(anchorIso: string) {
  const anchor = parseIso(anchorIso) ?? startOfToday();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const lead = (first.getDay() || 7) - 1;
  const days: Array<{ iso: string; label: string; current: boolean }> = [];
  for (let i = lead; i > 0; i -= 1) {
    const date = new Date(first);
    date.setDate(first.getDate() - i);
    days.push({ iso: toIso(date), label: String(date.getDate()), current: false });
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    days.push({ iso: toIso(date), label: String(day), current: true });
  }
  const tail = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= tail; i += 1) {
    const date = new Date(last);
    date.setDate(last.getDate() + i);
    days.push({ iso: toIso(date), label: String(date.getDate()), current: false });
  }
  return days;
}

function monthTitle(anchorIso: string) {
  const anchor = parseIso(anchorIso) ?? startOfToday();
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(anchor);
}

function shiftMonth(anchorIso: string, delta: number) {
  const anchor = parseIso(anchorIso) ?? startOfToday();
  return toIso(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
}

export function AdminPeriodToolbar({ basePath, start, end }: { basePath: string; start: string; end: string }) {
  return <AdminPeriodToolbarInner key={`${start}:${end}`} basePath={basePath} start={start} end={end} />;
}

function AdminPeriodToolbarInner({ basePath, start, end }: { basePath: string; start: string; end: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startIso, setStartIso] = useState(start);
  const [endIso, setEndIso] = useState(end);
  const [startText, setStartText] = useState(toRu(start));
  const [endText, setEndText] = useState(toRu(end));
  const [active, setActive] = useState<ActiveField>(null);
  const [monthIso, setMonthIso] = useState(start);

  const days = useMemo(() => monthDays(monthIso), [monthIso]);

  function buildParams(nextStart: string, nextEnd: string, period?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("start", nextStart);
    params.set("end", nextEnd);
    if (period) params.set("period", period);
    else params.delete("period");
    return params;
  }

  function navigate(nextStart = startIso, nextEnd = endIso) {
    const params = buildParams(nextStart, nextEnd);
    router.push(`${basePath}?${params.toString()}`);
  }

  function applyPreset(period: string) {
    const next = presetRange(period);
    setStartIso(next.start);
    setEndIso(next.end);
    setStartText(toRu(next.start));
    setEndText(toRu(next.end));
    setMonthIso(next.start);
    router.push(`${basePath}?${buildParams(next.start, next.end, period).toString()}`);
  }

  function commitText(field: "start" | "end", value: string) {
    const iso = fromRu(value);
    if (!iso) return;
    if (field === "start") {
      setStartIso(iso);
      setStartText(toRu(iso));
      setMonthIso(iso);
    } else {
      setEndIso(iso);
      setEndText(toRu(iso));
      setMonthIso(iso);
    }
  }

  function selectDay(iso: string) {
    if (active === "start") {
      setStartIso(iso);
      setStartText(toRu(iso));
      if (iso > endIso) {
        setEndIso(iso);
        setEndText(toRu(iso));
      }
    } else {
      setEndIso(iso);
      setEndText(toRu(iso));
      if (iso < startIso) {
        setStartIso(iso);
        setStartText(toRu(iso));
      }
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 text-xs" data-testid="admin-period-toolbar">
      {[
        ["today", "Сегодня"],
        ["week", "Неделя"],
        ["month", "Месяц"],
        ["quarter", "Квартал"],
      ].map(([period, label]) => (
        <button key={period} type="button" className="soft-admin-action" data-variant="subtle" onClick={() => applyPreset(period)}>
          {label}
        </button>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="start" value={startIso} />
        <input type="hidden" name="end" value={endIso} />
        <input
          aria-label="Дата начала периода"
          className="w-28 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1 tabular-nums"
          value={startText}
          placeholder="дд.мм.гггг"
          onFocus={() => { setActive("start"); setMonthIso(startIso); }}
          onChange={(event) => setStartText(event.target.value)}
          onBlur={() => commitText("start", startText)}
        />
        <span className="text-[var(--soft-ink-faint)]">—</span>
        <input
          aria-label="Дата окончания периода"
          className="w-28 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1 tabular-nums"
          value={endText}
          placeholder="дд.мм.гггг"
          onFocus={() => { setActive("end"); setMonthIso(endIso); }}
          onChange={(event) => setEndText(event.target.value)}
          onBlur={() => commitText("end", endText)}
        />
        <button className="soft-admin-action" type="button" onClick={() => navigate()}>
          Применить
        </button>
      </div>
      {active && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3 shadow-xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" className="soft-admin-action px-2 py-1" onClick={() => setMonthIso(shiftMonth(monthIso, -1))}>←</button>
            <div className="font-medium capitalize text-[var(--soft-ink)]">{monthTitle(monthIso)}</div>
            <button type="button" className="soft-admin-action px-2 py-1" onClick={() => setMonthIso(shiftMonth(monthIso, 1))}>→</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[var(--soft-ink-faint)]">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const selected = day.iso === startIso || day.iso === endIso;
              const inRange = day.iso >= startIso && day.iso <= endIso;
              return (
                <button
                  key={day.iso}
                  type="button"
                  className={[
                    "h-8 rounded-md text-xs tabular-nums transition-colors",
                    day.current ? "text-[var(--soft-ink)]" : "text-[var(--soft-ink-faint)]",
                    inRange ? "bg-[var(--soft-surface)]" : "hover:bg-[var(--soft-surface)]",
                    selected ? "bg-[var(--soft-bordeaux)] font-semibold text-white hover:bg-[var(--soft-bordeaux)]" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => selectDay(day.iso)}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setActive(null)}>Закрыть</button>
            <button type="button" className="soft-admin-action" onClick={() => { setActive(null); navigate(); }}>Применить</button>
          </div>
        </div>
      )}
    </div>
  );
}

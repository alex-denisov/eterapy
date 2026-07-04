"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { restoreAdminPeriodPreference, saveAdminPeriodPreference } from "./admin-navigation-preferences";
import {
  adminMonthDays,
  adminMonthTitle,
  adminPeriodFromRuDate,
  adminPeriodToRuDate,
  adminPresetRange,
  adminShiftMonth,
} from "./admin-period-utils";

type ActiveField = "start" | "end" | null;

export function AdminPeriodToolbar({ basePath, start, end }: { basePath: string; start: string; end: string }) {
  return <AdminPeriodToolbarInner key={`${start}:${end}`} basePath={basePath} start={start} end={end} />;
}

function AdminPeriodToolbarInner({ basePath, start, end }: { basePath: string; start: string; end: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startIso, setStartIso] = useState(start);
  const [endIso, setEndIso] = useState(end);
  const [startText, setStartText] = useState(adminPeriodToRuDate(start));
  const [endText, setEndText] = useState(adminPeriodToRuDate(end));
  const [active, setActive] = useState<ActiveField>(null);
  const [monthIso, setMonthIso] = useState(start);

  const days = useMemo(() => adminMonthDays(monthIso), [monthIso]);

  function buildParams(nextStart: string, nextEnd: string, period?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("start", nextStart);
    params.set("end", nextEnd);
    if (period) params.set("period", period);
    else params.delete("period");
    return params;
  }

  function navigateToParams(params: URLSearchParams) {
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function navigate(nextStart = startIso, nextEnd = endIso) {
    const params = buildParams(nextStart, nextEnd);
    saveAdminPeriodPreference({ start: nextStart, end: nextEnd, period: params.get("period") ?? undefined });
    navigateToParams(params);
  }

  function applyPreset(period: string) {
    const next = adminPresetRange(period);
    setStartIso(next.start);
    setEndIso(next.end);
    setStartText(adminPeriodToRuDate(next.start));
    setEndText(adminPeriodToRuDate(next.end));
    setMonthIso(next.start);
    const params = buildParams(next.start, next.end, period);
    saveAdminPeriodPreference({ start: next.start, end: next.end, period });
    navigateToParams(params);
  }

  useEffect(() => {
    const hasExplicitPeriod = searchParams.has("start") || searchParams.has("end") || searchParams.has("period");
    if (hasExplicitPeriod) {
      saveAdminPeriodPreference({ start, end, period: searchParams.get("period") ?? undefined });
      return;
    }

    const restored = restoreAdminPeriodPreference();
    if (!restored || restored.start === start && restored.end === end) return;
    const params = buildParams(restored.start, restored.end, restored.period);
    router.replace(`${basePath}?${params.toString()}`);
  // The restore must run only when the toolbar mounts for the current page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitText(field: "start" | "end", value: string) {
    const iso = adminPeriodFromRuDate(value);
    if (!iso) return;
    if (field === "start") {
      setStartIso(iso);
      setStartText(adminPeriodToRuDate(iso));
      setMonthIso(iso);
    } else {
      setEndIso(iso);
      setEndText(adminPeriodToRuDate(iso));
      setMonthIso(iso);
    }
  }

  function selectDay(iso: string) {
    if (active === "start") {
      setStartIso(iso);
      setStartText(adminPeriodToRuDate(iso));
      if (iso > endIso) {
        setEndIso(iso);
        setEndText(adminPeriodToRuDate(iso));
      }
    } else {
      setEndIso(iso);
      setEndText(adminPeriodToRuDate(iso));
      if (iso < startIso) {
        setStartIso(iso);
        setStartText(adminPeriodToRuDate(iso));
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
        ["all", "Все время"],
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
            <button type="button" className="soft-admin-action px-2 py-1" onClick={() => setMonthIso(adminShiftMonth(monthIso, -1))}>←</button>
            <div className="font-medium capitalize text-[var(--soft-ink)]">{adminMonthTitle(monthIso)}</div>
            <button type="button" className="soft-admin-action px-2 py-1" onClick={() => setMonthIso(adminShiftMonth(monthIso, 1))}>→</button>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { restoreAdminPeriodPreference, saveAdminPeriodPreference } from "./admin-navigation-preferences";
import {
  adminMonthDays,
  adminMonthTitle,
  adminClampIsoToPlatformRange,
  adminPeriodFromRuDate,
  adminPeriodToRuDate,
  adminPlatformWeekInputMax,
  adminPlatformWeekInputMin,
  adminPresetRange,
  adminQuarterOptions,
  adminQuarterInputFromIso,
  adminRangeFromQuarterInput,
  adminRangeFromWeekInput,
  adminShiftMonth,
  adminWeekInputFromIso,
} from "./admin-period-utils";

type PickerMode = "day" | "week" | "quarter" | null;

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
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [monthIso, setMonthIso] = useState(start);
  const [dayIso, setDayIso] = useState(start);
  const [weekInput, setWeekInput] = useState(adminWeekInputFromIso(start));
  const [quarterInput, setQuarterInput] = useState(adminQuarterInputFromIso(start));

  const days = useMemo(() => adminMonthDays(monthIso), [monthIso]);
  const quarterOptions = useMemo(() => adminQuarterOptions(), []);
  const weekMin = useMemo(() => adminPlatformWeekInputMin(), []);
  const weekMax = useMemo(() => adminPlatformWeekInputMax(), []);

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

  function updateLocalRange(nextStart: string, nextEnd: string) {
    const clampedStart = adminClampIsoToPlatformRange(nextStart);
    const clampedEnd = adminClampIsoToPlatformRange(nextEnd);
    const safeStart = clampedStart <= clampedEnd ? clampedStart : clampedEnd;
    const safeEnd = clampedStart <= clampedEnd ? clampedEnd : clampedStart;
    setStartIso(safeStart);
    setEndIso(safeEnd);
    setStartText(adminPeriodToRuDate(safeStart));
    setEndText(adminPeriodToRuDate(safeEnd));
    setMonthIso(safeStart);
    setDayIso(safeStart);
    setWeekInput(adminWeekInputFromIso(safeStart));
    setQuarterInput(adminQuarterInputFromIso(safeStart));
  }

  function navigate(nextStart = startIso, nextEnd = endIso, period?: string) {
    const clampedStart = adminClampIsoToPlatformRange(nextStart);
    const clampedEnd = adminClampIsoToPlatformRange(nextEnd);
    const safeStart = clampedStart <= clampedEnd ? clampedStart : clampedEnd;
    const safeEnd = clampedStart <= clampedEnd ? clampedEnd : clampedStart;
    const params = buildParams(safeStart, safeEnd, period);
    saveAdminPeriodPreference({ start: safeStart, end: safeEnd, period: params.get("period") ?? undefined });
    navigateToParams(params);
  }

  function applyPreset(period: string) {
    const next = adminPresetRange(period);
    updateLocalRange(next.start, next.end);
    setPickerMode(null);
    navigate(next.start, next.end, period);
  }

  function openPicker(mode: Exclude<PickerMode, null>) {
    if (mode === "day") {
      setMonthIso(dayIso);
    }
    if (mode === "week") {
      setWeekInput(adminWeekInputFromIso(startIso));
    }
    if (mode === "quarter") {
      setQuarterInput(adminQuarterInputFromIso(startIso));
    }
    setPickerMode((current) => current === mode ? null : mode);
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
    const parsedIso = adminPeriodFromRuDate(value);
    const iso = parsedIso ? adminClampIsoToPlatformRange(parsedIso) : null;
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

  function applyDay(iso: string) {
    updateLocalRange(iso, iso);
    setPickerMode(null);
    navigate(iso, iso, "day");
  }

  function applyWeek() {
    const next = adminRangeFromWeekInput(weekInput);
    updateLocalRange(next.start, next.end);
    setPickerMode(null);
    navigate(next.start, next.end, "week");
  }

  function applyQuarter() {
    const next = adminRangeFromQuarterInput(quarterInput);
    updateLocalRange(next.start, next.end);
    setPickerMode(null);
    navigate(next.start, next.end, "quarter");
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 text-xs" data-testid="admin-period-toolbar">
      <button
        type="button"
        className="soft-admin-action"
        data-variant="subtle"
        data-testid="admin-period-mode-today"
        onClick={() => applyPreset("today")}
      >
        Сегодня
      </button>
      <button
        type="button"
        className="soft-admin-action"
        data-variant={pickerMode === "day" ? "primary" : "subtle"}
        data-testid="admin-period-mode-day"
        onClick={() => openPicker("day")}
      >
        День
      </button>
      <button
        type="button"
        className="soft-admin-action"
        data-variant={pickerMode === "week" ? "primary" : "subtle"}
        data-testid="admin-period-mode-week"
        onClick={() => openPicker("week")}
      >
        Неделя
      </button>
      <button
        type="button"
        className="soft-admin-action"
        data-variant={pickerMode === "quarter" ? "primary" : "subtle"}
        data-testid="admin-period-mode-quarter"
        onClick={() => openPicker("quarter")}
      >
        Квартал
      </button>
      <button
        type="button"
        className="soft-admin-action"
        data-variant="subtle"
        data-testid="admin-period-mode-all"
        onClick={() => applyPreset("all")}
      >
        Все время
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="start" value={startIso} />
        <input type="hidden" name="end" value={endIso} />
        <input
          aria-label="Дата начала периода"
          className="w-28 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1 tabular-nums"
          value={startText}
          placeholder="дд.мм.гггг"
          onChange={(event) => setStartText(event.target.value)}
          onBlur={() => commitText("start", startText)}
        />
        <span className="text-[var(--soft-ink-faint)]">—</span>
        <input
          aria-label="Дата окончания периода"
          className="w-28 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1 tabular-nums"
          value={endText}
          placeholder="дд.мм.гггг"
          onChange={(event) => setEndText(event.target.value)}
          onBlur={() => commitText("end", endText)}
        />
        <button className="soft-admin-action" type="button" onClick={() => navigate()}>
          Применить
        </button>
      </div>
      {pickerMode === "day" && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3 shadow-xl"
          onMouseDown={(event) => event.preventDefault()}
          data-testid="admin-period-day-picker"
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
                    day.disabled ? "cursor-not-allowed opacity-35" : inRange ? "bg-[var(--soft-surface)]" : "hover:bg-[var(--soft-surface)]",
                    selected && !day.disabled ? "bg-[var(--soft-bordeaux)] font-semibold text-white hover:bg-[var(--soft-bordeaux)]" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={day.disabled}
                  onClick={() => {
                    setDayIso(day.iso);
                    applyDay(day.iso);
                  }}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setPickerMode(null)}>Закрыть</button>
          </div>
        </div>
      )}
      {pickerMode === "week" && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3 shadow-xl"
          data-testid="admin-period-week-picker"
        >
          <label className="grid gap-1 text-xs font-medium text-[var(--soft-ink-soft)]">
            <span>Выберите неделю</span>
            <input
              type="week"
              className="h-9 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 text-sm text-[var(--soft-ink)]"
              min={weekMin}
              max={weekMax}
              value={weekInput}
              onChange={(event) => setWeekInput(event.target.value)}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setPickerMode(null)}>Закрыть</button>
            <button type="button" className="soft-admin-action" onClick={applyWeek}>Применить</button>
          </div>
        </div>
      )}
      {pickerMode === "quarter" && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3 shadow-xl"
          data-testid="admin-period-quarter-picker"
        >
          <label className="grid gap-1 text-xs font-medium text-[var(--soft-ink-soft)]">
            <span>Выберите квартал</span>
            <select
              className="h-9 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 text-sm text-[var(--soft-ink)]"
              value={quarterInput}
              onChange={(event) => setQuarterInput(event.target.value)}
            >
              {quarterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setPickerMode(null)}>Закрыть</button>
            <button type="button" className="soft-admin-action" onClick={applyQuarter}>Применить</button>
          </div>
        </div>
      )}
    </div>
  );
}

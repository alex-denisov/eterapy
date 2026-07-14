"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

// B466 R9-5 — «Выбрать дату» для недельной сетки. Нативный date-picker (честная
// реализация вместо декоративного mini-cal из макета) → навигация на неделю,
// содержащую выбранную дату. basePath приходит с сервера (appUrl уже применён).

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const mon0 = (base.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(Date.UTC(y, m - 1, d - mon0)).toISOString().slice(0, 10);
}

export function WeekDatePicker({ basePath, current }: { basePath: string; current: string }) {
  const router = useRouter();
  return (
    <label
      className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-2 text-[13px] text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-deep)]/40"
      data-testid="calendar-week-datepicker"
    >
      <CalendarDays className="h-[15px] w-[15px]" aria-hidden="true" />
      Выбрать дату
      <input
        type="date"
        defaultValue={current}
        aria-label="Выбрать дату"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const iso = e.target.value;
          if (!iso) return;
          router.push(`${basePath}?tab=schedule&week=${mondayOf(iso)}`);
        }}
      />
    </label>
  );
}

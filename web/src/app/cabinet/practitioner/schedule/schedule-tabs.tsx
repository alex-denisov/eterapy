"use client";

import { useState } from "react";
import { ScheduleSettings } from "@/components/schedule/schedule-settings";
import { PriceRatesViewer } from "@/components/schedule/price-rates-viewer";

// WeekCalendar загружается только на клиенте — устраняет hydration mismatch
import dynamic from "next/dynamic";
const WeekCalendar = dynamic(() => import("@/components/schedule/week-calendar").then(m => m.WeekCalendar), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-card/30" />,
});

interface Props {
  practitionerId: string;
  initialRules: Array<{ dayOfWeek: number; startHour: number; startMinute: number; endHour: number; endMinute: number; enabled: boolean }>;
  initialRates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
}

const TABS = [
  { id: "calendar", label: "Календарь" },
  { id: "schedule", label: "Рабочие часы" },
  { id: "rates",    label: "Тарифы" },
];

export function SchedulePageTabs({ practitionerId, initialRules, initialRates }: Props) {
  const [tab, setTab] = useState<"calendar" | "schedule" | "rates">("calendar");

  return (
    <div>
      {/* Табы */}
      <div className="mb-6 flex w-fit gap-1 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <div>
          <div className="soft-card mb-4 p-3 text-xs text-muted-foreground">
            Нажмите на ячейку, чтобы заблокировать или разблокировать время.
            Зеленое = свободно, красное = заблокировано, синее = забронировано.
          </div>
          <WeekCalendar practitionerId={practitionerId} />
        </div>
      )}

      {tab === "schedule" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Укажите стандартные рабочие дни и часы. Клиенты смогут записаться в это время,
            если оно не заблокировано в календаре.
          </p>
          <ScheduleSettings initialRules={initialRules} />
        </div>
      )}

      {tab === "rates" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Включайте форматы сессий, которые хотите предлагать. Цены установлены платформой.
          </p>
          <PriceRatesViewer rates={initialRates} practitionerId={practitionerId} />
        </div>
      )}
    </div>
  );
}

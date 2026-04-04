"use client";

import { useState } from "react";
import { WeekCalendar } from "@/components/schedule/week-calendar";
import { ScheduleSettings } from "@/components/schedule/schedule-settings";
import { PriceRatesViewer } from "@/components/schedule/price-rates-viewer";

interface Props {
  practitionerId: string;
  initialRules: Array<{ dayOfWeek: number; startHour: number; startMinute: number; endHour: number; endMinute: number; enabled: boolean }>;
  initialRates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
}

const TABS = [
  { id: "calendar", label: "📅 Календарь" },
  { id: "schedule", label: "⚙️ Рабочие часы" },
  { id: "rates",    label: "💰 Тарифы" },
];

export function SchedulePageTabs({ practitionerId, initialRules, initialRates }: Props) {
  const [tab, setTab] = useState<"calendar" | "schedule" | "rates">("calendar");

  return (
    <div>
      {/* Табы */}
      <div className="flex gap-1 mb-6 rounded-xl bg-card/30 border border-border/30 p-1 w-fit">
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
          <div className="mb-4 rounded-lg border border-border/30 bg-card/20 p-3 text-xs text-muted-foreground">
            💡 Перетащите мышь по ячейкам чтобы заблокировать время.
            Зелёное = рабочие часы, красное = заблокировано.
            Клик по красной ячейке снимает блок.
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
            Ваши тарифы, назначенные администратором. В каталоге будет показан минимальный активный тариф.
          </p>
          <PriceRatesViewer rates={initialRates} />
        </div>
      )}
    </div>
  );
}

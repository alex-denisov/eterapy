"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check, Link2 } from "lucide-react";
import { ScheduleSettings } from "@/components/schedule/schedule-settings";
import { PriceRatesViewer } from "@/components/schedule/price-rates-viewer";

// B466 — клиентская часть «Доступности»: рабочие часы + недельная сетка
// блокировок + тумблеры длительностей (цены read-only, owner-фикс) + ссылка.

const WeekCalendar = dynamic(
  () => import("@/components/schedule/week-calendar").then((m) => m.WeekCalendar),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-xl bg-[rgba(255,255,255,0.015)]" /> },
);

interface Props {
  practitionerId: string;
  initialRules: Array<{ dayOfWeek: number; startHour: number; startMinute: number; endHour: number; endMinute: number; enabled: boolean }>;
  initialRates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
  bookingUrl: string;
}

export function AvailabilityClient({ practitionerId, initialRules, initialRates, bookingUrl }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard может быть недоступен — ссылка видна текстом рядом.
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-5" data-testid="practitioner-availability">
      {/* Рабочие часы */}
      <section>
        <p className="soft-eyebrow mb-2.5">Рабочие часы</p>
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Клиенты записываются только в открытые часы. Точечно закрыть время можно в сетке ниже.
        </p>
        <ScheduleSettings initialRules={initialRules} />
      </section>

      {/* Недельная сетка блокировок */}
      <section>
        <p className="soft-eyebrow mb-2.5">Сетка недели</p>
        <div className="soft-card mb-3 p-3 text-xs text-[var(--soft-ink-soft)]">
          Нажмите на ячейку, чтобы заблокировать или разблокировать время. Зелёное = свободно, красное =
          заблокировано, синее = забронировано.
        </div>
        <WeekCalendar practitionerId={practitionerId} />
      </section>

      {/* Цены за сессию — только вкл/выкл длительностей */}
      <section data-testid="practitioner-availability-rates">
        <p className="soft-eyebrow mb-2.5">Цены за сессию</p>
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Включите длительности, которые предлагаете. Стоимость здесь не редактируется — цены закреплены за
          длительностью сессии.
        </p>
        <PriceRatesViewer rates={initialRates} practitionerId={practitionerId} />
      </section>

      {/* Личная ссылка для записи */}
      <section className="soft-card p-4" data-testid="practitioner-booking-link">
        <p className="soft-eyebrow">Ссылка для записи</p>
        <p className="mt-1.5 break-all text-sm text-[var(--soft-ink-soft)]">{bookingUrl}</p>
        <button type="button" className="soft-chip mt-3 inline-flex items-center gap-1.5" onClick={copyLink}>
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
          {copied ? "Скопировано" : "Скопировать"}
        </button>
      </section>
    </div>
  );
}

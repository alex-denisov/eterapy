"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { ScheduleSettings } from "@/components/schedule/schedule-settings";
import { PriceRatesViewer } from "@/components/schedule/price-rates-viewer";

// B466 R9-5 — «Доступность» (десктоп): компактные «Рабочие часы» (день + часы +
// тумблер) и «Цены за сессию» (длительность + цена + тумблер) в двух колонках +
// ссылка для записи. Прежняя недельная сетка точечных блокировок убрана
// (owner: слишком громоздкая/некрасивая) — расписание задаётся рабочими часами.

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
    <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:items-start" data-testid="practitioner-availability">
      {/* Рабочие часы */}
      <section className="soft-card p-5" data-testid="practitioner-availability-hours">
        <p className="soft-eyebrow">Рабочие часы</p>
        <p className="mb-4 mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          Клиенты записываются только в открытые часы. Включите день и задайте интервал приёма.
        </p>
        <ScheduleSettings initialRules={initialRules} />
      </section>

      {/* Цены за сессию + ссылка */}
      <div className="flex flex-col gap-4">
        <section className="soft-card p-5" data-testid="practitioner-availability-rates">
          <p className="soft-eyebrow">Цены за сессию</p>
          <p className="mb-4 mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Включите длительности, которые предлагаете. Стоимость закреплена за длительностью сессии.
          </p>
          <PriceRatesViewer rates={initialRates} practitionerId={practitionerId} />
        </section>

        <section className="soft-card p-4" data-testid="practitioner-booking-link">
          <p className="soft-eyebrow">Ссылка для записи</p>
          <p className="mt-1.5 break-all text-sm text-[var(--soft-ink-soft)]">{bookingUrl}</p>
          <button type="button" className="soft-chip mt-3 inline-flex items-center gap-1.5" onClick={copyLink}>
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
            {copied ? "Скопировано" : "Скопировать"}
          </button>
        </section>
      </div>
    </div>
  );
}

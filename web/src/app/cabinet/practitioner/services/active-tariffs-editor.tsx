"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface Rate {
  id: string;
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface ActiveTariffsEditorProps {
  practitionerId: string;
  initialRates: Rate[];
  commissionPercent: number;
  /** True when there are no real configured rates (only the synthetic default) —
      then the toggle is informational and price changes go through the platform. */
  readOnly?: boolean;
}

/**
 * M11/D7 · restyled for B466 R9-5 desktop «Услуги» (-services-v2 mockup):
 * real enable/disable toggles for the practitioner's session formats, rendered
 * as the mockup's «Форматы приёма» rows (icon · name · online/duration · tag ·
 * price · switch). The ToggleSwitch persists `enabled` via PATCH /api/rates
 * (which preserves the admin-set price); the price is shown read-only — price
 * changes stay with the platform/admin, and arbitrary services aren't creatable.
 */
export function ActiveTariffsEditor({
  practitionerId,
  initialRates,
  commissionPercent,
  readOnly = false,
}: ActiveTariffsEditorProps) {
  const [rates, setRates] = useState<Rate[]>(initialRates);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggleRate(rateId: string) {
    if (readOnly) return;
    const prev = rates;
    const next = rates.map((r) => (r.id === rateId ? { ...r, enabled: !r.enabled } : r));
    setRates(next);
    setSavingId(rateId);
    try {
      const res = await fetch("/api/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          // priceRub is sent as-is; the API keeps the existing (admin-set) price.
          rates: next.map((r) => ({ durationMin: r.durationMin, priceRub: r.priceRub, enabled: r.enabled })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      }
      const target = next.find((r) => r.id === rateId);
      toast.success(target?.enabled ? "Формат показывается клиентам" : "Формат скрыт от клиентов");
    } catch (err) {
      setRates(prev);
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div data-testid="practitioner-active-tariffs">
      {rates.map((rate) => {
        const net = rate.priceRub - Math.round((rate.priceRub * commissionPercent) / 100);
        return (
          <article
            key={rate.id}
            className="flex items-center gap-3.5 border-t border-[var(--soft-paper-deep)] py-3.5 first:border-t-0 first:pt-0.5"
            style={{ opacity: rate.enabled ? 1 : 0.6 }}
          >
            <span
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[12px]"
              style={{ background: "#E4EADF", color: "#4B6146" }}
              aria-hidden="true"
            >
              <Video width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-[var(--soft-ink)]">
                Индивидуальная сессия
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--soft-ink-faint)]">
                <span>Онлайн</span>
                <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--soft-ink-faint)]" aria-hidden="true" />
                <span>{rate.durationMin} мин</span>
                <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--soft-ink-faint)]" aria-hidden="true" />
                {rate.enabled ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold tracking-[0.03em]"
                    style={{ background: "#E4EADF", color: "#4B6146" }}
                  >
                    активна
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--soft-paper-deep)] px-2 py-0.5 text-[10.5px] font-bold tracking-[0.03em] text-[var(--soft-ink-faint)]">
                    скрыта
                  </span>
                )}
                <span className="basis-full text-[11.5px] text-[var(--soft-ink-faint)]">
                  клиент видит цену до записи · чистыми {net.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
            <span className="flex-none whitespace-nowrap font-heading text-[17px] font-semibold tabular-nums text-[var(--soft-bordeaux)]">
              {rate.priceRub.toLocaleString("ru-RU")} ₽
            </span>
            <ToggleSwitch
              enabled={rate.enabled}
              onToggle={() => toggleRate(rate.id)}
              disabled={readOnly || savingId === rate.id}
              label={rate.enabled ? "Скрыть формат от клиентов" : "Показать формат клиентам"}
            />
          </article>
        );
      })}
      <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--soft-ink-faint)]">
        {readOnly
          ? "Форматы приёма настраивает платформа. Чтобы изменить цену — напишите в поддержку. Создание произвольных услуг пока недоступно."
          : "Форматы приёма настроены под ваш тариф — включайте нужные переключателем. Цену устанавливает платформа; создание произвольных услуг пока недоступно."}
      </p>
    </div>
  );
}

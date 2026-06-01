"use client";

import { useState } from "react";
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
 * M11/D7: real enable/disable toggles for the practitioner's tariffs.
 *
 * The previous markup rendered a static, non-interactive switch (nothing
 * persisted) and an «Изменить» button that mis-routed to /schedule even though
 * practitioners cannot set prices. Here the ToggleSwitch persists `enabled` via
 * PATCH /api/rates (which preserves the admin-set price), and the price is shown
 * read-only — price changes stay with the platform/admin.
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
      toast.success(target?.enabled ? "Тариф показывается клиентам" : "Тариф скрыт от клиентов");
    } catch (err) {
      setRates(prev);
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="grid gap-3" data-testid="practitioner-active-tariffs">
      {rates.map((rate) => {
        const net = rate.priceRub - Math.round((rate.priceRub * commissionPercent) / 100);
        return (
          <article
            key={rate.id}
            className="soft-card-flat grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            style={{ opacity: rate.enabled ? 1 : 0.62 }}
          >
            <div className="flex min-w-0 items-start gap-4">
              <div className="mt-0.5">
                <ToggleSwitch
                  enabled={rate.enabled}
                  onToggle={() => toggleRate(rate.id)}
                  disabled={readOnly || savingId === rate.id}
                  label="Показывать тариф клиентам"
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-[var(--soft-ink)]">Индивидуальная сессия</h2>
                  <span className="soft-badge soft-badge-lilac text-[11px]">{rate.durationMin} мин</span>
                  {!rate.enabled && <span className="soft-badge text-[11px]">скрыт</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                  Онлайн · клиент видит цену до записи · чистыми после комиссии: {net.toLocaleString("ru-RU")} ₽
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end sm:w-32">
              <p className="whitespace-nowrap text-right font-heading text-2xl font-semibold tabular-nums text-[var(--soft-bordeaux)]">
                {rate.priceRub.toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </article>
        );
      })}
      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        {readOnly
          ? "Тарифы настраивает платформа. Чтобы изменить цену или добавить формат — напишите в поддержку."
          : "Включайте и выключайте показ форматов клиентам переключателем. Цену устанавливает платформа — изменить её можно через администратора/поддержку."}
      </p>
    </div>
  );
}

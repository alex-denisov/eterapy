"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DURATION_LABELS } from "@/lib/duration-labels";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface Rate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface Props {
  practitionerId: string;
  initialRates: Rate[];
  onSaved?: () => void;
}

const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];

/**
 * T6: compact, inline-editable session-rate editor. Fits inside the
 * practitioner-tariffs table (no full-width overflowing cards). Enabling a
 * session format immediately unlocks its price input so the admin can set the
 * price in the same step.
 */
export function PriceRatesEditor({ practitionerId, initialRates, onSaved }: Props) {
  const [rates, setRates] = useState<Rate[]>(() =>
    ALL_DURATIONS.map((d) => {
      const found = initialRates.find((r) => r.durationMin === d);
      return found ?? { durationMin: d, priceRub: 0, enabled: false };
    })
  );
  const [saving, setSaving] = useState(false);

  function updateRate(dur: number, patch: Partial<Rate>) {
    setRates((prev) => prev.map((r) => (r.durationMin === dur ? { ...r, ...patch } : r)));
  }

  function toggleRate(dur: number) {
    setRates((prev) =>
      prev.map((r) => {
        if (r.durationMin !== dur) return r;
        const enabled = !r.enabled;
        // Enabling a format keeps focus on pricing — surface the input right away.
        return { ...r, enabled };
      }),
    );
  }

  async function handleSave() {
    // Guard: an enabled format with no price would silently fall back server-side.
    const missingPrice = rates.find((r) => r.enabled && r.priceRub <= 0);
    if (missingPrice) {
      toast.error(`Укажите цену для формата ${DURATION_LABELS[missingPrice.durationMin]}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, rates }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("Тарифы сохранены");
        onSaved?.();
      } else {
        toast.error(d.error ?? "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const enabledRates = rates.filter((r) => r.enabled && r.priceRub > 0);
  const minRate = enabledRates.length > 0 ? enabledRates.reduce((m, r) => (r.priceRub < m.priceRub ? r : m)) : null;

  return (
    <div className="space-y-3 py-1">
      <p className="text-xs text-[var(--soft-ink-faint)]">
        Включите форматы сессий, доступные для записи, и задайте цену каждого.
        {minRate && (
          <>
            {" "}В каталоге покажем минимальный тариф:{" "}
            <strong className="text-[var(--soft-bordeaux)]">
              {minRate.priceRub.toLocaleString("ru-RU")} ₽ за {DURATION_LABELS[minRate.durationMin]}
            </strong>
            .
          </>
        )}
      </p>

      <div className="overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-white/55">
        <table className="soft-admin-data-table min-w-[560px]">
          <thead>
            <tr>
              <th className="w-28">Формат</th>
              <th className="w-24">Включён</th>
              <th className="w-40">Цена, ₽</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.durationMin}>
                <td className="font-medium">{DURATION_LABELS[rate.durationMin]}</td>
                <td>
                  <ToggleSwitch
                    enabled={rate.enabled}
                    onToggle={() => toggleRate(rate.durationMin)}
                    label={`${DURATION_LABELS[rate.durationMin]} — ${rate.enabled ? "включено" : "выключено"}`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={rate.priceRub || ""}
                    disabled={!rate.enabled}
                    placeholder={rate.enabled ? "цена" : "—"}
                    onChange={(event) => updateRate(rate.durationMin, { priceRub: Number(event.target.value) || 0 })}
                    className="soft-admin-table-filter mt-0 h-8 w-32 min-w-32 disabled:opacity-40"
                    aria-label={`Цена за ${DURATION_LABELS[rate.durationMin]}`}
                  />
                </td>
                <td>
                  {!rate.enabled ? (
                    <span className="soft-admin-status-pill" data-tone="warn">отключён</span>
                  ) : rate.priceRub > 0 ? (
                    <span className="soft-admin-status-pill" data-tone="ok">доступен</span>
                  ) : (
                    <span className="soft-admin-status-pill" data-tone="danger">нужна цена</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-[var(--soft-bordeaux)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Сохранение..." : "Сохранить тарифы"}
      </button>
    </div>
  );
}

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
  rates: Rate[];
  practitionerId?: string;
}

export function PriceRatesViewer({ rates, practitionerId }: Props) {
  const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];

  // Инициализируем все 6 длительностей из props (один раз)
  const [localRates, setLocalRates] = useState<Rate[]>(() =>
    ALL_DURATIONS.map(d => {
      const found = rates.find(r => r.durationMin === d);
      return found ?? { durationMin: d, priceRub: 0, enabled: false };
    })
  );
  const [saving, setSaving] = useState(false);

  async function toggleRate(durationMin: number, enabled: boolean) {
    const updated = localRates.map(r =>
      r.durationMin === durationMin ? { ...r, enabled } : r
    );
    setLocalRates(updated);

    if (!practitionerId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          rates: updated,
        }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast.error(d.error ?? "Ошибка");
        // Rollback on error
        setLocalRates(prev =>
          prev.map(r =>
            r.durationMin === durationMin ? { ...r, enabled: !enabled } : r
          )
        );
      } else {
        toast.success("Тариф обновлён");
      }
    } catch {
      toast.error("Ошибка сети");
      setLocalRates(prev =>
        prev.map(r =>
          r.durationMin === durationMin ? { ...r, enabled: !enabled } : r
        )
      );
    } finally {
      setSaving(false);
    }
  }

  const minActive = localRates.filter(r => r.enabled && r.priceRub > 0)
    .sort((a, b) => a.priceRub - b.priceRub)[0];

  return (
    <div className="space-y-2.5">
      {minActive && (
        <div className="rounded-[10px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]/40 px-3 py-2 text-xs text-[var(--soft-ink-faint)]">
          В каталоге показывается:{" "}
          <strong className="text-[var(--soft-bordeaux)]">{minActive.priceRub.toLocaleString("ru")} ₽ за {DURATION_LABELS[minActive.durationMin]}</strong>
        </div>
      )}

      <div className="space-y-2">
        {localRates.map(rate => {
          const enabled = rate.enabled;
          const price = rate.priceRub ?? 0;

          return (
            <div key={rate.durationMin}
              className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 transition-colors ${
                enabled ? "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]" : "border-[var(--soft-paper-deep)] bg-[var(--soft-paper-deep)]/30"
              }`}>
              {/* Toggle */}
              <ToggleSwitch
                enabled={enabled}
                onToggle={() => toggleRate(rate.durationMin, !enabled)}
                disabled={saving}
                label={`${DURATION_LABELS[rate.durationMin]} — ${enabled ? "включено" : "выключено"}`}
              />

              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium">{DURATION_LABELS[rate.durationMin]}</span>
                {enabled && price > 0 ? (
                  <span className="text-sm font-semibold text-[var(--soft-bordeaux)]">{price.toLocaleString("ru")} ₽</span>
                ) : (
                  <span className="text-xs text-[var(--soft-ink-faint)]">Цена не указана</span>
                )}
              </div>

              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-medium"
                style={enabled
                  ? { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
                  : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}
              >
                {enabled ? "Доступен" : "Отключён"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

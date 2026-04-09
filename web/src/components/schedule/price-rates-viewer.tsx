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
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
        💡 Включайте форматы, которые хотите предлагать клиентам. Цены установлены платформой.
      </div>

      {minActive && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          В каталоге показывается:{" "}
          <strong className="text-primary">{minActive.priceRub.toLocaleString("ru")} ₽ за {DURATION_LABELS[minActive.durationMin]}</strong>
        </div>
      )}

      <div className="space-y-2">
        {localRates.map(rate => {
          const enabled = rate.enabled;
          const price = rate.priceRub ?? 0;

          return (
            <div key={rate.durationMin}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
                enabled ? "border-primary/15 bg-card/40" : "border-border/15 bg-card/10"
              }`}>
              {/* Toggle */}
              <ToggleSwitch
                enabled={enabled}
                onToggle={() => toggleRate(rate.durationMin, !enabled)}
                disabled={saving}
                label={`${DURATION_LABELS[rate.durationMin]} — ${enabled ? "включено" : "выключено"}`}
              />

              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm font-medium w-20 shrink-0">{DURATION_LABELS[rate.durationMin]}</span>
                {enabled && price > 0 ? (
                  <span className="text-sm font-semibold text-primary">{price.toLocaleString("ru")} ₽</span>
                ) : (
                  <span className="text-xs text-muted-foreground/50">Цена не указана</span>
                )}
              </div>

              <span className={`text-xs ${enabled ? "text-green-600" : "text-muted-foreground/70"}`}>
                {enabled ? "Доступен" : "Отключён"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

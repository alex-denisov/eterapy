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

export function PriceRatesEditor({ practitionerId, initialRates, onSaved }: Props) {
  const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];
  const [rates, setRates] = useState<Rate[]>(() =>
    ALL_DURATIONS.map(d => {
      const found = initialRates.find(r => r.durationMin === d);
      return found ?? { durationMin: d, priceRub: 0, enabled: false };
    })
  );
  const [saving, setSaving] = useState(false);

  function updateRate(dur: number, patch: Partial<Rate>) {
    setRates(prev => prev.map(r => r.durationMin === dur ? { ...r, ...patch } : r));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practitionerId, rates }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("Тарифы сохранены"); onSaved?.(); }
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setSaving(false); }
  }

  const enabledRates = rates.filter(r => r.enabled && r.priceRub > 0);
  const minRate = enabledRates.length > 0 ? enabledRates.reduce((m, r) => r.priceRub < m.priceRub ? r : m) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
        Выберите формат сессии, который будет доступен для записи. 
        Цены установлены платформой и не могут быть изменены.
      </div>

      {minRate && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          В каталоге будет показан минимальный тариф:{" "}
          <strong className="text-primary">{minRate.priceRub.toLocaleString("ru")} ₽ за {DURATION_LABELS[minRate.durationMin]}</strong>
        </div>
      )}

      {rates.map(rate => (
        <div key={rate.durationMin} className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
          rate.enabled ? "border-primary/20 bg-card/40" : "border-border/20 bg-card/10"
        }`}>
          <div className="flex items-center gap-3 w-24 shrink-0">
            <ToggleSwitch
              enabled={rate.enabled}
              onToggle={() => updateRate(rate.durationMin, { enabled: !rate.enabled })}
              label={`${DURATION_LABELS[rate.durationMin]} — ${rate.enabled ? "включено" : "выключено"}`}
            />
            <span className="text-sm font-medium">{DURATION_LABELS[rate.durationMin]}</span>
          </div>

          {rate.priceRub > 0 ? (
            <span className="text-sm font-semibold text-primary">{rate.priceRub.toLocaleString("ru")} ₽</span>
          ) : (
            <span className="text-xs text-muted-foreground">Цена не установлена</span>
          )}

          {rate.enabled && rate.priceRub > 0 && (
            <span className="ml-auto text-xs text-green-600">Доступен для записи</span>
          )}
          {!rate.enabled && (
            <span className="ml-auto text-xs text-muted-foreground/70">Отключён</span>
          )}
        </div>
      ))}

      <button onClick={handleSave} disabled={saving}
        className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
        {saving ? "Сохранение..." : "Сохранить тарифы"}
      </button>
    </div>
  );
}

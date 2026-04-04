"use client";

import { useState } from "react";
import { toast } from "sonner";

const DURATION_LABELS: Record<number, string> = {
  15:  "15 минут",
  30:  "30 минут",
  45:  "45 минут",
  60:  "1 час",
  90:  "1.5 часа",
  120: "2 часа",
};

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
      {minRate && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          В каталоге будет показан минимальный тариф:{" "}
          <strong className="text-primary">{minRate.priceRub.toLocaleString("ru")} ₽ за {DURATION_LABELS[minRate.durationMin]}</strong>
        </div>
      )}

      {ALL_DURATIONS.map(dur => {
        const rate = rates.find(r => r.durationMin === dur)!;
        return (
          <div key={dur} className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
            rate.enabled ? "border-primary/20 bg-card/40" : "border-border/20 bg-card/10"
          }`}>
            <div className="flex items-center gap-3 w-28 shrink-0">
              <button
                onClick={() => updateRate(dur, { enabled: !rate.enabled })}
                className={`relative h-5 w-10 rounded-full transition-colors ${rate.enabled ? "bg-primary" : "bg-muted/40"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${rate.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm font-medium">{DURATION_LABELS[dur]}</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number" min={0} step={50}
                value={rate.priceRub}
                onChange={e => updateRate(dur, { priceRub: Number(e.target.value) })}
                disabled={!rate.enabled}
                className="w-28 rounded border border-border/30 bg-background/50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-40"
              />
              <span className="text-sm text-muted-foreground">₽</span>
            </div>

            {rate.enabled && rate.priceRub > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {rate.priceRub.toLocaleString("ru")} ₽ / {DURATION_LABELS[dur]}
              </span>
            )}
            {!rate.enabled && (
              <span className="ml-auto text-xs text-muted-foreground/40">Отключён</span>
            )}
          </div>
        );
      })}

      <button onClick={handleSave} disabled={saving}
        className="mt-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
        {saving ? "Сохранение..." : "Сохранить тарифы"}
      </button>
    </div>
  );
}

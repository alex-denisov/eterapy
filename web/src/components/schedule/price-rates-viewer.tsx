"use client";

// Read-only view тарифов для практика (изменять может только суперадмин)

const DURATION_LABELS: Record<number, string> = {
  15: "15 минут", 30: "30 минут", 45: "45 минут",
  60: "1 час", 90: "1.5 часа", 120: "2 часа",
};

interface Rate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface Props {
  rates: Rate[];
}

export function PriceRatesViewer({ rates }: Props) {
  const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];
  const minActive = rates.filter(r => r.enabled && r.priceRub > 0)
    .sort((a, b) => a.priceRub - b.priceRub)[0];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/30 bg-card/20 px-4 py-2 text-xs text-muted-foreground">
        💡 Тарифы назначаются администратором. Для изменения — обратитесь в поддержку.
      </div>

      {minActive && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          В каталоге показывается минимальный тариф:{" "}
          <strong className="text-primary">{minActive.priceRub.toLocaleString("ru")} ₽ за {DURATION_LABELS[minActive.durationMin]}</strong>
        </div>
      )}

      <div className="space-y-2">
        {ALL_DURATIONS.map(dur => {
          const rate = rates.find(r => r.durationMin === dur);
          const enabled = rate?.enabled ?? false;
          const price = rate?.priceRub ?? 0;

          return (
            <div key={dur}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                enabled ? "border-primary/15 bg-card/40" : "border-border/15 bg-card/10 opacity-50"
              }`}>
              {/* П.3 — переключатель read-only, красиво оформлен, не заходит на текст */}
              <div className="shrink-0">
                <div className={`relative h-5 w-10 rounded-full transition-colors pointer-events-none ${
                  enabled ? "bg-primary/70" : "bg-muted/40"
                }`}>
                  <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`} />
                </div>
              </div>

              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm font-medium w-24 shrink-0">{DURATION_LABELS[dur]}</span>
                {enabled && price > 0 ? (
                  <span className="text-sm font-semibold text-primary">{price.toLocaleString("ru")} ₽</span>
                ) : (
                  <span className="text-xs text-muted-foreground/50">Отключён</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

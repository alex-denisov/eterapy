"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DURATION_LABELS } from "@/lib/duration-labels";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { COMPACT_INPUT_CLASS } from "@/components/admin/compact-table";
import { AdminCompactDataTable, type AdminCompactColumn, type AdminCompactRow } from "@/components/admin/compact-client-table";

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
  const columns: AdminCompactColumn[] = [
    { key: "duration", label: "Формат", sortable: true, filterKind: "select", options: ALL_DURATIONS.map((duration) => ({ value: DURATION_LABELS[duration], label: DURATION_LABELS[duration] })) },
    { key: "enabled", label: "Включён", sortable: true, filterKind: "select", options: [{ value: "включено", label: "Включено" }, { value: "выключено", label: "Выключено" }] },
    { key: "price", label: "Цена, ₽", sortable: true, filterKind: "text", align: "right" },
    { key: "status", label: "Статус", sortable: true, filterKind: "select", options: [{ value: "доступен", label: "Доступен" }, { value: "отключён", label: "Отключён" }, { value: "нужна цена", label: "Нужна цена" }] },
  ];
  const rows: AdminCompactRow[] = rates.map((rate) => {
    const status = !rate.enabled ? "отключён" : rate.priceRub > 0 ? "доступен" : "нужна цена";
    return {
      id: String(rate.durationMin),
      cells: {
        duration: {
          kind: "text",
          value: DURATION_LABELS[rate.durationMin],
          sortValue: rate.durationMin,
          filterValue: DURATION_LABELS[rate.durationMin],
        },
        enabled: {
          kind: "node",
          node: (
            <ToggleSwitch
              enabled={rate.enabled}
              onToggle={() => toggleRate(rate.durationMin)}
              label={`${DURATION_LABELS[rate.durationMin]} — ${rate.enabled ? "включено" : "выключено"}`}
            />
          ),
          filterValue: rate.enabled ? "включено" : "выключено",
          sortValue: rate.enabled ? 1 : 0,
        },
        price: {
          kind: "node",
          node: (
            <input
              type="number"
              min={0}
              step={50}
              value={rate.priceRub || ""}
              disabled={!rate.enabled}
              placeholder={rate.enabled ? "цена" : "—"}
              onChange={(event) => updateRate(rate.durationMin, { priceRub: Number(event.target.value) || 0 })}
              className={`${COMPACT_INPUT_CLASS} mt-0 h-8 w-32 min-w-32 disabled:opacity-40`}
              aria-label={`Цена за ${DURATION_LABELS[rate.durationMin]}`}
            />
          ),
          filterValue: String(rate.priceRub || ""),
          sortValue: rate.priceRub,
        },
        status: {
          kind: "status",
          label: status,
          tone: status === "доступен" ? "ok" : status === "нужна цена" ? "danger" : "warn",
          filterValue: status,
          sortValue: status,
        },
      },
    };
  });

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

      <AdminCompactDataTable columns={columns} rows={rows} minWidth="560px" pageSize={20} />

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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { PriceRatesEditor } from "@/components/schedule/price-rates-editor";

interface PriceRate {
  durationMin: number;
  priceRub: number;
  enabled: boolean;
}

interface Practitioner {
  id: string;
  pricePerSession: number;
  sessionDuration: number;
  status: string;
  commissionPercent: number | null;
  user: { name: string; email: string };
  priceRates: PriceRate[];
}

interface Props {
  initialSettings: Record<string, string>;
  practitioners: Practitioner[];
}

// T9: recommended defaults sourced from docs/ETerapy_v5_Product_Package/
// 13_Prices_Breakdown.md so the admin sees the canonical reference price as a
// placeholder even before a value is stored in settings.
interface PriceKey {
  key: string;
  label: string;
  unit: string;
  recommended?: number;
}

// M6: digital products + all subscriptions (client and practitioner) live in a
// single table. Platform commission moved to the per-practitioner table, and the
// obsolete free-session / tool-limit / min-price settings were removed.
const PRODUCT_PRICE_KEYS: PriceKey[] = [
  { key: "product.perspectives.price", label: "Полная картина", unit: "₽", recommended: 299 },
  { key: "product.deep-report.price", label: "Подробный разбор", unit: "₽", recommended: 690 },
  { key: "product.chat-analysis.price", label: "Анализ переписки", unit: "₽", recommended: 790 },
  { key: "product.circle.price", label: "Круг", unit: "₽", recommended: 790 },
  { key: "product.pair.price", label: "Разобраться вдвоём", unit: "₽", recommended: 790 },
  { key: "product.compatibility.price", label: "Совместимость", unit: "₽", recommended: 790 },
  { key: "product.daily-practice.price", label: "Расширенный разбор практики", unit: "₽", recommended: 199 },
  { key: "product.map-upgrade.price", label: "Апгрейд карты", unit: "₽", recommended: 990 },
  { key: "subscription.plus.price", label: "Plus: подписка клиента", unit: "₽/мес", recommended: 490 },
  { key: "subscription.premium.price", label: "Premium: подписка клиента", unit: "₽/мес", recommended: 1290 },
  { key: "subscription.practitioner-pro.price", label: "Practitioner Pro: подписка практика", unit: "₽/мес", recommended: 1490 },
  { key: "subscription.practitioner-pro-plus.price", label: "Practitioner Pro+: подписка практика", unit: "₽/мес", recommended: 2990 },
];

const DURATION_LABELS: Record<number, string> = {
  15: "15 мин",
  30: "30 мин",
  45: "45 мин",
  60: "1 час",
  90: "1.5 ч",
  120: "2 ч",
};

// M7: a single "Базовая цена" = the price for a 60-minute session. Prefer the
// enabled 60-min rate; fall back to the practitioner's default session price when
// their default duration is 60 min. Used for the column value, sort and filter.
function basePrice60(practitioner: Practitioner): number | null {
  const sixty = practitioner.priceRates.find((rate) => rate.durationMin === 60 && rate.enabled && rate.priceRub > 0);
  if (sixty) return sixty.priceRub;
  if (practitioner.sessionDuration === 60 && practitioner.pricePerSession > 0) return practitioner.pricePerSession;
  return null;
}

export function PricingEditor({ initialSettings, practitioners }: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  // M5/B2: track which scope is saving so each table's own button shows state.
  const [savingScope, setSavingScope] = useState<string | null>(null);

  // After a save we call router.refresh(); the server component then re-reads
  // platform settings and passes a fresh `initialSettings`. Re-seed local state
  // from it so the inputs authoritatively reflect the persisted DB values
  // (this is what makes a saved price visibly "stick" without a manual reload).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(initialSettings);
  }, [initialSettings]);
  const [testMode, setTestMode] = useState(initialSettings["session.test_mode"] === "true");
  const [expandedPrac, setExpandedPrac] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<number, { price: number; enabled: boolean }>>({
    15: { price: 0, enabled: false },
    30: { price: 0, enabled: false },
    45: { price: 0, enabled: false },
    60: { price: 0, enabled: false },
    90: { price: 0, enabled: false },
    120: { price: 0, enabled: false },
  });
  const [applyingBulk, setApplyingBulk] = useState(false);
  // M6/M7: per-practitioner commission editing + search/sort on the rates table.
  const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({});
  const [savingCommission, setSavingCommission] = useState<string | null>(null);
  const [basePriceDraft, setBasePriceDraft] = useState<Record<string, string>>({});
  const [editingBasePrice, setEditingBasePrice] = useState<string | null>(null);
  const [savingBasePrice, setSavingBasePrice] = useState<string | null>(null);
  const [pracQuery, setPracQuery] = useState("");
  const [pracSort, setPracSort] = useState<"name" | "price" | "commission">("price");
  const [pracDir, setPracDir] = useState<"asc" | "desc">("asc");

  function togglePracSort(field: "name" | "price" | "commission") {
    if (pracSort === field) {
      setPracDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setPracSort(field);
      setPracDir("asc");
    }
  }

  const visiblePractitioners = useMemo(() => {
    const query = pracQuery.trim().toLowerCase();
    const filtered = query
      ? practitioners.filter(
          (p) => p.user.name.toLowerCase().includes(query) || p.user.email.toLowerCase().includes(query),
        )
      : practitioners;
    const sorted = [...filtered].sort((a, b) => {
      if (pracSort === "name") return a.user.name.localeCompare(b.user.name, "ru");
      if (pracSort === "commission") return (a.commissionPercent ?? 0) - (b.commissionPercent ?? 0);
      return (basePrice60(a) ?? Number.POSITIVE_INFINITY) - (basePrice60(b) ?? Number.POSITIVE_INFINITY);
    });
    return pracDir === "desc" ? sorted.reverse() : sorted;
  }, [practitioners, pracQuery, pracSort, pracDir]);

  async function saveCommission(id: string) {
    const raw = commissionDraft[id];
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      toast.error("Комиссия должна быть целым числом от 0 до 100");
      return;
    }
    setSavingCommission(id);
    try {
      const res = await fetch(`/api/admin/practitioners/${id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPercent: n }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Комиссия обновлена");
        router.refresh();
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingCommission(null);
    }
  }

  function startBasePriceEdit(practitioner: Practitioner) {
    const current = basePrice60(practitioner);
    setBasePriceDraft((draft) => ({ ...draft, [practitioner.id]: String(current ?? "") }));
    setEditingBasePrice(practitioner.id);
  }

  function nextRatesWithBasePrice(practitioner: Practitioner, priceRub: number) {
    const rates = new Map<number, PriceRate>();
    for (const rate of practitioner.priceRates) {
      rates.set(rate.durationMin, rate);
    }
    const current = rates.get(60);
    rates.set(60, {
      durationMin: 60,
      priceRub,
      enabled: current?.enabled ?? true,
    });
    return [...rates.values()].sort((a, b) => a.durationMin - b.durationMin);
  }

  async function saveBasePrice(practitioner: Practitioner) {
    const raw = basePriceDraft[practitioner.id] ?? "";
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Базовая цена должна быть целым числом от 0 ₽");
      return;
    }
    setSavingBasePrice(practitioner.id);
    try {
      const res = await fetch(`/api/admin/practitioners/${practitioner.id}/rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: nextRatesWithBasePrice(practitioner, n) }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Базовая цена обновлена");
        setEditingBasePrice(null);
        router.refresh();
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingBasePrice(null);
    }
  }

  // M5/B2: save only the given scope's keys (each table has its own button).
  // Passing no keys saves the price mode (test_mode) from the «Режим цен» card.
  async function saveSettings(scope: string, keys?: PriceKey[]) {
    setSavingScope(scope);
    const toSave: Record<string, string> = keys
      ? Object.fromEntries(keys.map((row) => [row.key, settings[row.key] ?? ""]))
      : { "session.test_mode": testMode ? "true" : "false" };
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: toSave }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Сохранено");
        router.refresh();
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingScope(null);
    }
  }

  async function handleBulkApply() {
    const activeDurations = Object.entries(bulkRates).filter(([, value]) => value.enabled && value.price > 0);
    if (activeDurations.length === 0) { toast.error("Включите хотя бы один тариф"); return; }
    if (!confirm(`Применить тарифы к ${practitioners.length} практикам?`)) return;

    setApplyingBulk(true);
    let ok = 0;
    for (const practitioner of practitioners) {
      const rates = Object.entries(bulkRates).map(([durationMin, value]) => ({
        durationMin: Number(durationMin),
        priceRub: value.price,
        enabled: value.enabled,
      }));
      const res = await fetch(`/api/admin/practitioners/${practitioner.id}/rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates }),
      });
      if ((await res.json()).ok) ok++;
    }
    toast.success(`Тарифы применены к ${ok} практикам`);
    setApplyingBulk(false);
  }

  function settingsTable(title: string, rows: PriceKey[], scope: string) {
    return (
      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <h2 className="mb-3 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{title}</h2>
        <div className="overflow-x-auto">
          <table className="soft-admin-data-table min-w-[720px]">
            <thead><tr><th>Параметр</th><th>Ключ</th><th>Значение</th><th>Ед.</th></tr></thead>
            <tbody>
              {rows.map(({ key, label, unit, recommended }) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td><code>{key}</code></td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={settings[key] ?? ""}
                      placeholder={recommended !== undefined ? `реком. ${recommended}` : ""}
                      onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))}
                      className="soft-admin-table-filter mt-0 h-8 w-32 min-w-32"
                    />
                  </td>
                  <td>{unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* M5/B2: each editable table saves its own values. */}
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => saveSettings(scope, rows)}
            disabled={savingScope === scope}
            className="soft-admin-action"
            data-variant="primary"
            data-testid={`pricing-save-${scope}`}
          >
            {savingScope === scope ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div>
          <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Режим цен</h2>
          <p className="text-xs text-[var(--soft-ink-faint)]">Тестовый режим делает стоимость сессий 0 ₽ для проверки видеочата.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-bordeaux)]">
          <input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} />
          Тестовый режим
        </label>
        <button onClick={() => saveSettings("mode")} disabled={savingScope === "mode"} className="soft-admin-action" data-variant="primary" data-testid="pricing-save-mode">
          {savingScope === "mode" ? "Сохранение..." : "Сохранить режим"}
        </button>
      </div>

      {settingsTable("Цифровые продукты и подписки", PRODUCT_PRICE_KEYS, "products")}

      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Тарифы практиков</h2>
            <p className="text-xs text-[var(--soft-ink-faint)]">Базовая цена (60 мин), индивидуальная комиссия и ставки по длительности.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={pracQuery}
              onChange={(event) => setPracQuery(event.target.value)}
              placeholder="Поиск: имя или email"
              className="soft-admin-table-filter mt-0 h-8 w-56"
              aria-label="Поиск практика"
            />
            <button onClick={() => setBulkMode(!bulkMode)} className="soft-admin-action">
              {bulkMode ? "Закрыть массовое" : "Массовое применение"}
            </button>
          </div>
        </div>

        {bulkMode && (
          <div className="mb-4 overflow-x-auto rounded-lg border border-[var(--soft-paper-edge)] bg-white/55 p-3">
            <table className="soft-admin-data-table min-w-[760px]">
              <thead><tr><th>Длительность</th><th>Включить</th><th>Цена</th></tr></thead>
              <tbody>
                {Object.entries(DURATION_LABELS).map(([duration, label]) => {
                  const durationMin = Number(duration);
                  const rate = bulkRates[durationMin];
                  return (
                    <tr key={duration}>
                      <td>{label}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={rate.enabled}
                          onChange={() => setBulkRates((current) => ({ ...current, [durationMin]: { ...current[durationMin], enabled: !current[durationMin].enabled } }))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={rate.price}
                          disabled={!rate.enabled}
                          onChange={(event) => setBulkRates((current) => ({ ...current, [durationMin]: { ...current[durationMin], price: Number(event.target.value) } }))}
                          className="soft-admin-table-filter mt-0 h-8 w-32 min-w-32"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button onClick={handleBulkApply} disabled={applyingBulk} className="soft-admin-action mt-3" data-variant="primary">
              {applyingBulk ? "Применяем..." : `Применить к ${practitioners.length} практикам`}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="soft-admin-data-table min-w-[980px]">
            <thead>
              <tr>
                <th>
                  <button type="button" className="font-inherit cursor-pointer bg-transparent" onClick={() => togglePracSort("name")}>
                    Практик{pracSort === "name" ? (pracDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
                <th>Email</th>
                <th>Статус</th>
                <th>
                  <button type="button" className="font-inherit cursor-pointer bg-transparent" onClick={() => togglePracSort("price")}>
                    Базовая цена (60 мин){pracSort === "price" ? (pracDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="font-inherit cursor-pointer bg-transparent" onClick={() => togglePracSort("commission")}>
                    Комиссия{pracSort === "commission" ? (pracDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visiblePractitioners.map((practitioner) => {
                const base = basePrice60(practitioner);
                const expanded = expandedPrac === practitioner.id;
                return (
                  <Fragment key={practitioner.id}>
                    <tr>
                      <td>{practitioner.user.name}</td>
                      <td>{practitioner.user.email}</td>
                      <td><span className="soft-admin-status-pill" data-tone={practitioner.status === "ACTIVE" ? "ok" : "warn"}>{practitioner.status}</span></td>
                      <td>
                        <div className="relative inline-flex items-center gap-1.5">
                          <span className="whitespace-nowrap tabular-nums">
                            {base !== null ? `${base.toLocaleString("ru-RU")} ₽` : "—"}
                          </span>
                          <button
                            type="button"
                            className="soft-admin-icon-button"
                            onClick={() => startBasePriceEdit(practitioner)}
                            aria-label={`Изменить базовую цену ${practitioner.user.email}`}
                            title="Изменить базовую цену"
                            data-testid="pricing-base-price-edit"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                          {editingBasePrice === practitioner.id && (
                            <div className="absolute left-0 top-full z-20 mt-1 flex items-center gap-1 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1.5 shadow-[var(--soft-shadow-sm)]">
                              <input
                                type="number"
                                min={0}
                                step={50}
                                value={basePriceDraft[practitioner.id] ?? ""}
                                onChange={(event) => setBasePriceDraft((draft) => ({ ...draft, [practitioner.id]: event.target.value }))}
                                className="soft-admin-table-filter mt-0 h-8 w-28 min-w-28"
                                aria-label={`Базовая цена ${practitioner.user.email}`}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="soft-admin-icon-button"
                                data-variant="primary"
                                disabled={savingBasePrice === practitioner.id}
                                onClick={() => saveBasePrice(practitioner)}
                                aria-label="Сохранить базовую цену"
                                title="Сохранить"
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="soft-admin-icon-button"
                                onClick={() => setEditingBasePrice(null)}
                                aria-label="Отменить изменение базовой цены"
                                title="Отменить"
                              >
                                <X className="size-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
	                            value={commissionDraft[practitioner.id] ?? String(practitioner.commissionPercent ?? 35)}
                            onChange={(event) => setCommissionDraft((current) => ({ ...current, [practitioner.id]: event.target.value }))}
                            className="soft-admin-table-filter mt-0 h-8 w-16 min-w-16"
                            aria-label={`Комиссия ${practitioner.user.email}`}
                          />
                          <span className="text-xs text-[var(--soft-ink-faint)]">%</span>
                          <button
                            type="button"
                            className="soft-admin-action"
                            data-variant="primary"
                            disabled={savingCommission === practitioner.id}
                            onClick={() => saveCommission(practitioner.id)}
                            title="Сохранить комиссию"
                          >
                            {savingCommission === practitioner.id ? "…" : "✓"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button className="soft-admin-action" onClick={() => setExpandedPrac(expanded ? null : practitioner.id)}>
                          {expanded ? "Скрыть ставки" : "Ставки"}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${practitioner.id}-rates`}>
                        <td colSpan={6}>
                          <PriceRatesEditor practitionerId={practitioner.id} initialRates={practitioner.priceRates} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

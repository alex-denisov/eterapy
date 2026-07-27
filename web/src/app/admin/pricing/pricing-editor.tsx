"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { PriceRatesEditor } from "@/components/schedule/price-rates-editor";
import { COMPACT_INPUT_CLASS } from "@/components/admin/compact-table";
import { AdminCompactDataTable, type AdminCompactColumn, type AdminCompactRow } from "@/components/admin/compact-client-table";

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
  { key: "product.reframe.price", label: "Переосмысление", unit: "₽", recommended: 299 },
  { key: "product.deep-report.price", label: "Подробный разбор", unit: "₽", recommended: 890 },
  { key: "product.chat-analysis.price", label: "Анализ переписки", unit: "₽", recommended: 590 },
  { key: "product.tarot.price", label: "Расклад Таро", unit: "₽", recommended: 590 },
  { key: "product.natal-chart.price", label: "Натальная карта", unit: "₽", recommended: 590 },
  { key: "product.compatibility-by-date.price", label: "Синастрия", unit: "₽", recommended: 890 },
  { key: "product.numerology.price", label: "Матрица судьбы", unit: "₽", recommended: 890 },
  { key: "product.horoscope.price", label: "Гороскоп", unit: "₽", recommended: 590 },
  { key: "product.arcana.price", label: "Арканы судьбы", unit: "₽", recommended: 890 },
  { key: "product.family-questions.price", label: "Семейные вопросы", unit: "₽", recommended: 1090 },
  { key: "product.human-design.price", label: "Human Design", unit: "₽", recommended: 590 },
  { key: "product.surname-origin.price", label: "Происхождение фамилии", unit: "₽", recommended: 590 },
  { key: "product.circle.price", label: "Круг", unit: "₽", recommended: 890 },
  { key: "product.pair.price", label: "Разобраться вдвоём", unit: "₽", recommended: 890 },
  { key: "product.compatibility.price", label: "Совместимость", unit: "₽", recommended: 890 },
  { key: "product.daily-practice.price", label: "Расширенный разбор практики", unit: "₽", recommended: 199 },
  { key: "product.map-upgrade.price", label: "Апгрейд карты", unit: "₽", recommended: 990 },
  { key: "subscription.plus.price", label: "Plus: подписка клиента", unit: "₽/мес", recommended: 590 },
  { key: "subscription.premium.price", label: "Premium: подписка клиента", unit: "₽/мес", recommended: 1490 },
  { key: "subscription.practitioner-pro.price", label: "Practitioner Pro: подписка практика", unit: "₽/мес", recommended: 1490 },
  { key: "subscription.practitioner-pro-plus.price", label: "Practitioner Pro+: подписка практика", unit: "₽/мес", recommended: 2990 },
];

const PRODUCT_CREDIT_KEYS: PriceKey[] = [
  { key: "product.tarot.credits", label: "Расклад Таро", unit: "баллы", recommended: 2 },
  { key: "product.natal-chart.credits", label: "Натальная карта", unit: "баллы", recommended: 2 },
  { key: "product.compatibility-by-date.credits", label: "Синастрия", unit: "баллы", recommended: 3 },
  { key: "product.numerology.credits", label: "Матрица судьбы", unit: "баллы", recommended: 3 },
  { key: "product.horoscope.credits", label: "Гороскоп", unit: "баллы", recommended: 2 },
  { key: "product.arcana.credits", label: "Арканы судьбы", unit: "баллы", recommended: 3 },
  { key: "product.family-questions.credits", label: "Семейные вопросы", unit: "баллы", recommended: 4 },
  { key: "product.human-design.credits", label: "Human Design", unit: "баллы", recommended: 2 },
  { key: "product.surname-origin.credits", label: "Происхождение фамилии", unit: "баллы", recommended: 2 },
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
  // M6/M7: per-practitioner commission editing.
  const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({});
  const [savingCommission, setSavingCommission] = useState<string | null>(null);
  const [basePriceDraft, setBasePriceDraft] = useState<Record<string, string>>({});
  const [editingBasePrice, setEditingBasePrice] = useState<string | null>(null);
  const [savingBasePrice, setSavingBasePrice] = useState<string | null>(null);

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
    const columns: AdminCompactColumn[] = [
      { key: "label", label: "Параметр", sortable: true, filterKind: "text" },
      { key: "key", label: "Ключ", sortable: true, filterKind: "text" },
      { key: "value", label: "Значение", sortable: true, filterKind: "text" },
      { key: "unit", label: "Ед.", sortable: true, filterKind: "select" },
    ];
    const unitOptions = [...new Set(rows.map((row) => row.unit))]
      .sort((a, b) => a.localeCompare(b, "ru"))
      .map((unit) => ({ value: unit, label: unit }));
    const tableRows: AdminCompactRow[] = rows.map(({ key, label, unit, recommended }) => {
      const current = settings[key] ?? "";
      return {
        id: key,
        cells: {
          label,
          key: {
            kind: "node",
            node: <code>{key}</code>,
            filterValue: key,
            sortValue: key,
          },
          value: {
            kind: "node",
            node: (
              <input
                type="number"
                min={0}
                value={current}
                placeholder={recommended !== undefined ? `реком. ${recommended}` : ""}
                onChange={(event) => setSettings((currentSettings) => ({ ...currentSettings, [key]: event.target.value }))}
                className={`${COMPACT_INPUT_CLASS} mt-0 h-8 w-32 min-w-32`}
              />
            ),
            filterValue: current || String(recommended ?? ""),
            sortValue: Number(current || recommended || 0),
          },
          unit,
        },
      };
    });
    return (
      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <h2 className="mb-3 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{title}</h2>
        <AdminCompactDataTable
          columns={columns.map((column) => column.key === "unit" ? { ...column, options: unitOptions } : column)}
          rows={tableRows}
          minWidth="720px"
          pageSize={20}
        />
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
      {settingsTable("Стоимость эзотерических продуктов в баллах", PRODUCT_CREDIT_KEYS, "product-credits")}

      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Тарифы практиков</h2>
            <p className="text-xs text-[var(--soft-ink-faint)]">Базовая цена (60 мин), индивидуальная комиссия и ставки по длительности.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setBulkMode(!bulkMode)} className="soft-admin-action">
              {bulkMode ? "Закрыть массовое" : "Массовое применение"}
            </button>
          </div>
        </div>

        {bulkMode && (
          <div className="mb-4 rounded-lg border border-[var(--soft-paper-edge)] bg-white/55 p-3">
            <AdminCompactDataTable
              columns={[
                { key: "duration", label: "Длительность", sortable: true, filterKind: "select", options: Object.entries(DURATION_LABELS).map(([, label]) => ({ value: label, label })) },
                { key: "enabled", label: "Включить", sortable: true, filterKind: "select", options: [{ value: "да", label: "Да" }, { value: "нет", label: "Нет" }] },
                { key: "price", label: "Цена", sortable: true, filterKind: "text" },
              ]}
              rows={Object.entries(DURATION_LABELS).map(([duration, label]) => {
                const durationMin = Number(duration);
                const rate = bulkRates[durationMin];
                return {
                  id: duration,
                  cells: {
                    duration: label,
                    enabled: {
                      kind: "node",
                      node: (
                        <input
                          type="checkbox"
                          checked={rate.enabled}
                          onChange={() => setBulkRates((current) => ({ ...current, [durationMin]: { ...current[durationMin], enabled: !current[durationMin].enabled } }))}
                          aria-label={`Включить ${label}`}
                        />
                      ),
                      filterValue: rate.enabled ? "да" : "нет",
                      sortValue: rate.enabled ? 1 : 0,
                    },
                    price: {
                      kind: "node",
                      node: (
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={rate.price}
                          disabled={!rate.enabled}
                          onChange={(event) => setBulkRates((current) => ({ ...current, [durationMin]: { ...current[durationMin], price: Number(event.target.value) } }))}
                          className={`${COMPACT_INPUT_CLASS} mt-0 h-8 w-32 min-w-32`}
                        />
                      ),
                      filterValue: String(rate.price),
                      sortValue: rate.price,
                    },
                  },
                };
              })}
              minWidth="760px"
              pageSize={20}
            />
            <button onClick={handleBulkApply} disabled={applyingBulk} className="soft-admin-action mt-3" data-variant="primary">
              {applyingBulk ? "Применяем..." : `Применить к ${practitioners.length} практикам`}
            </button>
          </div>
        )}

        <AdminCompactDataTable
          columns={[
            { key: "practitioner", label: "Практик", sortable: true, filterKind: "text" },
            { key: "email", label: "Email", sortable: true, filterKind: "text" },
            { key: "status", label: "Статус", sortable: true, filterKind: "select", options: [...new Set(practitioners.map((item) => item.status))].sort().map((status) => ({ value: status, label: status })) },
            { key: "base", label: "Базовая цена (60 мин)", sortable: true, filterKind: "text", align: "right" },
            { key: "commission", label: "Комиссия", sortable: true, filterKind: "text", align: "right" },
            { key: "rates", label: "Ставки", sortable: false, filterKind: "none" },
          ]}
          rows={practitioners.map((practitioner) => {
                const base = basePrice60(practitioner);
                const expanded = expandedPrac === practitioner.id;
                return {
                  id: practitioner.id,
                  cells: {
                    practitioner: practitioner.user.name,
                    email: practitioner.user.email,
                    status: {
                      kind: "status",
                      label: practitioner.status,
                      tone: practitioner.status === "ACTIVE" ? "ok" : "warn",
                      filterValue: practitioner.status,
                      sortValue: practitioner.status,
                    },
                    base: {
                      kind: "node",
                      filterValue: base !== null ? String(base) : "",
                      sortValue: base ?? 0,
                      node: (
                        <div className="relative inline-flex items-center justify-end gap-1.5">
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
                                className={`${COMPACT_INPUT_CLASS} mt-0 h-8 w-28 min-w-28`}
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
                      ),
                    },
                    commission: {
                      kind: "node",
                      filterValue: String(commissionDraft[practitioner.id] ?? practitioner.commissionPercent ?? 35),
                      sortValue: Number(commissionDraft[practitioner.id] ?? practitioner.commissionPercent ?? 35),
                      node: (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={commissionDraft[practitioner.id] ?? String(practitioner.commissionPercent ?? 35)}
                            onChange={(event) => setCommissionDraft((current) => ({ ...current, [practitioner.id]: event.target.value }))}
                            className={`${COMPACT_INPUT_CLASS} mt-0 h-8 w-16 min-w-16`}
                            aria-label={`Комиссия ${practitioner.user.email}`}
                          />
                          <span className="text-xs text-[var(--soft-ink-faint)]">%</span>
                          <button
                            type="button"
                            className="soft-admin-icon-button"
                            data-variant="primary"
                            disabled={savingCommission === practitioner.id}
                            onClick={() => saveCommission(practitioner.id)}
                            title="Сохранить комиссию"
                            aria-label={`Сохранить комиссию ${practitioner.user.email}`}
                          >
                            {savingCommission === practitioner.id ? "…" : <Check className="size-3.5" aria-hidden="true" />}
                          </button>
                        </div>
                      ),
                    },
                    rates: {
                      kind: "node",
                      node: (
                        <div className="grid gap-2">
                          <button
                            type="button"
                            className="soft-admin-icon-button"
                            onClick={() => setExpandedPrac(expanded ? null : practitioner.id)}
                            title={expanded ? "Скрыть ставки" : "Показать ставки"}
                            aria-label={expanded ? "Скрыть ставки" : "Показать ставки"}
                          >
                            {expanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                          </button>
                          {expanded ? (
                            <div className="min-w-[28rem]">
                              <PriceRatesEditor practitionerId={practitioner.id} initialRates={practitioner.priceRates} />
                            </div>
                          ) : null}
                        </div>
                      ),
                      filterValue: practitioner.priceRates.map((rate) => `${DURATION_LABELS[rate.durationMin] ?? rate.durationMin} ${rate.priceRub}`).join(" "),
                    },
                  },
                };
              })}
          minWidth="1180px"
          pageSize={20}
        />
      </section>
    </div>
  );
}

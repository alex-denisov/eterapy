"use client";

import { useEffect, useState } from "react";
import { Fragment } from "react";
import { useRouter } from "next/navigation";
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

const PLAN_KEYS: PriceKey[] = [
  { key: "plan.free.sessions", label: "Бесплатный: сессий/мес", unit: "шт", recommended: 0 },
  { key: "platform.commission_pct", label: "Комиссия платформы", unit: "%", recommended: 20 },
  { key: "tools.default_limit", label: "Лимит инструментов по умолчанию", unit: "шт", recommended: 3 },
  { key: "session.min_price", label: "Минимальная цена сессии", unit: "₽", recommended: 1500 },
  { key: "subscription.practitioner-pro.price", label: "Practitioner Pro", unit: "₽/мес", recommended: 1490 },
  { key: "subscription.practitioner-pro-plus.price", label: "Practitioner Pro+", unit: "₽/мес", recommended: 2990 },
];

const PRODUCT_PRICE_KEYS: PriceKey[] = [
  { key: "product.perspectives.price", label: "4 ракурса ответа", unit: "₽", recommended: 299 },
  { key: "product.deep-report.price", label: "Глубокий отчёт", unit: "₽", recommended: 690 },
  { key: "product.chat-analysis.price", label: "Анализ переписки", unit: "₽", recommended: 790 },
  { key: "product.seven-days.price", label: "7 дней к ясности", unit: "₽", recommended: 790 },
  { key: "product.circle.price", label: "Круг ясности", unit: "₽", recommended: 790 },
  { key: "product.pair.price", label: "Разобраться вдвоём", unit: "₽", recommended: 790 },
  { key: "product.compatibility.price", label: "Совместимость", unit: "₽", recommended: 790 },
  { key: "product.daily-practice.price", label: "Расширенный разбор практики", unit: "₽", recommended: 199 },
  { key: "product.map-upgrade.price", label: "Апгрейд карты", unit: "₽", recommended: 990 },
  { key: "subscription.plus.price", label: "Plus: подписка клиента", unit: "₽/мес", recommended: 490 },
  { key: "subscription.premium.price", label: "Premium: подписка клиента", unit: "₽/мес", recommended: 1290 },
];

const DURATION_LABELS: Record<number, string> = {
  15: "15 мин",
  30: "30 мин",
  45: "45 мин",
  60: "1 час",
  90: "1.5 ч",
  120: "2 ч",
};

function minRate(practitioner: Practitioner) {
  return practitioner.priceRates
    .filter((rate) => rate.enabled && rate.priceRub > 0)
    .sort((a, b) => a.priceRub - b.priceRub)[0] ?? null;
}

export function PricingEditor({ initialSettings, practitioners }: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);

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

  async function handleSaveSettings() {
    setSavingSettings(true);
    const toSave = { ...settings, "session.test_mode": testMode ? "true" : "false" };
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: toSave }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Настройки сохранены");
        // Re-read from the server so the inputs reflect persisted DB values.
        router.refresh();
      } else {
        toast.error(data.error ?? "Ошибка");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingSettings(false);
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

  function settingsTable(title: string, rows: PriceKey[]) {
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
        <button onClick={handleSaveSettings} disabled={savingSettings} className="soft-admin-action" data-variant="primary">
          {savingSettings ? "Сохранение..." : "Сохранить все настройки"}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {settingsTable("Тарифные планы и комиссия", PLAN_KEYS)}
        {settingsTable("Цифровые продукты и подписки", PRODUCT_PRICE_KEYS)}
      </div>

      <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Тарифы практиков</h2>
            <p className="text-xs text-[var(--soft-ink-faint)]">Индивидуальные ставки по длительности сессии.</p>
          </div>
          <button onClick={() => setBulkMode(!bulkMode)} className="soft-admin-action">
            {bulkMode ? "Закрыть массовое" : "Массовое применение"}
          </button>
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
            <thead><tr><th>Практик</th><th>Email</th><th>Статус</th><th>Базовая цена</th><th>Минимальная ставка</th><th>Действия</th></tr></thead>
            <tbody>
              {practitioners.map((practitioner) => {
                const rate = minRate(practitioner);
                const expanded = expandedPrac === practitioner.id;
                return (
                  <Fragment key={practitioner.id}>
                    <tr>
                      <td>{practitioner.user.name}</td>
                      <td>{practitioner.user.email}</td>
                      <td><span className="soft-admin-status-pill" data-tone={practitioner.status === "ACTIVE" ? "ok" : "warn"}>{practitioner.status}</span></td>
                      <td>{practitioner.pricePerSession.toLocaleString("ru-RU")} ₽ / {practitioner.sessionDuration} мин</td>
                      <td>{rate ? `${rate.priceRub.toLocaleString("ru-RU")} ₽ / ${DURATION_LABELS[rate.durationMin]}` : "нет ставок"}</td>
                      <td>
                        <button className="soft-admin-action" onClick={() => setExpandedPrac(expanded ? null : practitioner.id)}>
                          {expanded ? "Скрыть" : "Редактировать"}
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

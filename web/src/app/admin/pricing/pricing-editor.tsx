"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const PLAN_KEYS = [
  { key: "plan.free.sessions",     label: "Бесплатный — сессий/мес",    type: "number" },
  { key: "plan.starter.sessions",  label: "Стартовый — сессий/мес",     type: "number" },
  { key: "plan.starter.price",     label: "Стартовый — цена ₽/мес",     type: "number" },
  { key: "plan.standard.sessions", label: "Стандартный — сессий/мес",   type: "number" },
  { key: "plan.standard.price",    label: "Стандартный — цена ₽/мес",   type: "number" },
  { key: "plan.unlimited.price",   label: "Безлимитный — цена ₽/мес",   type: "number" },
  { key: "platform.commission_pct",label: "Комиссия платформы %",        type: "number" },
  { key: "tools.default_limit",    label: "Лимит инструментов (default)",type: "number" },
  { key: "session.min_price",      label: "Минимальная цена сессии ₽",   type: "number" },
];

const PRODUCT_PRICE_KEYS = [
  { key: "product.perspectives.price",  label: "4 Ракурса ответа ₽",     type: "number" },
  { key: "product.deep-report.price",   label: "Глубокий отчёт ₽",       type: "number" },
  { key: "product.chat-analysis.price", label: "Анализ переписки ₽",     type: "number" },
  { key: "product.seven-days.price",    label: "7 дней к ясности ₽",     type: "number" },
  { key: "product.circle.price",        label: "Круг ясности ₽",         type: "number" },
  { key: "product.pair.price",          label: "Разобраться вдвоём ₽",   type: "number" },
  { key: "subscription.plus.price",     label: "Подписка Plus ₽/мес",    type: "number" },
  { key: "subscription.premium.price",  label: "Подписка Premium ₽/мес", type: "number" },
  { key: "subscription.pro.price",      label: "Practitioner Pro ₽/мес", type: "number" },
];

export function PricingEditor({ initialSettings, practitioners }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
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
      const d = await res.json();
      if (d.ok) toast.success("Настройки сохранены");
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setSavingSettings(false); }
  }

  async function handleBulkApply() {
    const activeDurations = Object.entries(bulkRates).filter(([,v]) => v.enabled && v.price > 0);
    if (activeDurations.length === 0) { toast.error("Включите хотя бы один тариф"); return; }

    const targets = filteredPractitioners;
    if (!confirm(`Применить тарифы к ${targets.length} практикам?`)) return;

    setApplyingBulk(true);
    let ok = 0;
    for (const p of targets) {
      const rates = Object.entries(bulkRates).map(([dur, v]) => ({
        durationMin: Number(dur),
        priceRub: v.price,
        enabled: v.enabled,
      }));
      const res = await fetch(`/api/admin/practitioners/${p.id}/rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates }),
      });
      if ((await res.json()).ok) ok++;
    }
    toast.success(`Тарифы применены к ${ok} практикам`);
    setApplyingBulk(false);
  }

  const filteredPractitioners = practitioners;

  const DURATION_LABELS: Record<number, string> = {
    15: "15 мин", 30: "30 мин", 45: "45 мин", 60: "1 час", 90: "1.5 ч", 120: "2 ч",
  };

  return (
    <div className="space-y-8">
      {/* Тестовый режим */}
      <Card className={`border-2 ${testMode ? "border-yellow-500/40 bg-yellow-500/5" : "border-border/40 bg-card/50"}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">🧪 Тестовый режим</h2>
                {testMode && <Badge className="bg-yellow-500/20 text-yellow-400">Активен</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                В тестовом режиме стоимость сессий = 0 ₽. Для тестирования видеочата.
              </p>
            </div>
            <button
              onClick={() => setTestMode(!testMode)}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${testMode ? "bg-yellow-500" : "bg-muted/40"}`}
            >
              <span
                className={`h-6 w-6 transform rounded-full bg-white shadow transition-transform ${testMode ? "translate-x-7" : "translate-x-1"}`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Настройки платформы */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Тарифные планы и комиссия</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLAN_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
                <input type="number" min={0}
                  value={settings[key] ?? ""}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            ))}
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings}
            className="mt-5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
            {savingSettings ? "Сохранение..." : "Сохранить"}
          </button>
        </CardContent>
      </Card>

      {/* Цифровые продукты и подписки */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-1">Цены цифровых продуктов и подписок</h2>
          <p className="text-xs text-muted-foreground mb-5">Цены в рублях. Изменения сохраняются через кнопку &laquo;Сохранить&raquo; выше.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_PRICE_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
                <input type="number" min={0}
                  value={settings[key] ?? ""}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            ))}
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings}
            className="mt-5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
            {savingSettings ? "Сохранение..." : "Сохранить продуктовые цены"}
          </button>
        </CardContent>
      </Card>

      {/* Тарифы практиков */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold">Тарифы практиков</h2>
            <button onClick={() => setBulkMode(!bulkMode)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                bulkMode ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}>
              {bulkMode ? "Отмена массового" : "⚡ Массовое применение"}
            </button>
          </div>

          {/* Массовое применение */}
          {bulkMode && (
            <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium mb-3">Задать тарифы для всех практиков:</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(DURATION_LABELS).map(([dur, label]) => {
                  const d = Number(dur);
                  const r = bulkRates[d];
                  return (
                    <div key={d} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${r.enabled ? "border-primary/30" : "border-border/20 opacity-60"}`}>
                      <button onClick={() => setBulkRates(prev => ({ ...prev, [d]: { ...prev[d], enabled: !prev[d].enabled } }))}
                        className={`h-4 w-8 rounded-full transition-colors ${r.enabled ? "bg-primary" : "bg-muted/40"}`}>
                        <span className={`block h-3 w-3 rounded-full bg-white mx-0.5 transition-transform ${r.enabled ? "translate-x-4" : ""}`} />
                      </button>
                      <span className="text-xs w-12">{label}</span>
                      <input type="number" min={0} step={50} value={r.price}
                        onChange={e => setBulkRates(prev => ({ ...prev, [d]: { ...prev[d], price: Number(e.target.value) } }))}
                        disabled={!r.enabled}
                        className="w-20 rounded border border-border/30 bg-background/50 px-2 py-1 text-xs disabled:opacity-40 focus:border-primary focus:outline-none" />
                      <span className="text-xs text-muted-foreground">₽</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={handleBulkApply} disabled={applyingBulk}
                className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">
                {applyingBulk ? "Применяем..." : `Применить к ${filteredPractitioners.length} практикам`}
              </button>
            </div>
          )}

          {/* Список практиков */}
          <div className="space-y-2">
            {filteredPractitioners.map(p => {
              const minRate = p.priceRates.filter(r => r.enabled && r.priceRub > 0)
                .sort((a, b) => a.priceRub - b.priceRub)[0];
              const isExpanded = expandedPrac === p.id;

              return (
                <div key={p.id} className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedPrac(isExpanded ? null : p.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.user.name}</p>
                      <p className="text-xs text-muted-foreground">{p.user.email}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {minRate ? (
                        <span className="text-xs text-primary">
                          от {minRate.priceRub.toLocaleString("ru")} ₽/{DURATION_LABELS[minRate.durationMin]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">нет тарифов</span>
                      )}
                      <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/20 px-4 py-4">
                      <PriceRatesEditor
                        practitionerId={p.id}
                        initialRates={p.priceRates}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

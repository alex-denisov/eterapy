"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Practitioner {
  id: string;
  pricePerSession: number;
  sessionDuration: number;
  status: string;
  user: { name: string; email: string };
}

interface Props {
  initialSettings: Record<string, string>;
  practitioners: Practitioner[];
}

const PLAN_KEYS = [
  { key: "plan.free.sessions",     label: "Бесплатный — сессий/мес",    type: "number", min: 0 },
  { key: "plan.starter.sessions",  label: "Стартовый — сессий/мес",     type: "number", min: 1 },
  { key: "plan.starter.price",     label: "Стартовый — цена ₽/мес",     type: "number", min: 0 },
  { key: "plan.standard.sessions", label: "Стандартный — сессий/мес",   type: "number", min: 1 },
  { key: "plan.standard.price",    label: "Стандартный — цена ₽/мес",   type: "number", min: 0 },
  { key: "plan.unlimited.price",   label: "Безлимитный — цена ₽/мес",   type: "number", min: 0 },
  { key: "platform.commission_pct",label: "Комиссия платформы %",        type: "number", min: 0, max: 100 },
  { key: "tools.default_limit",    label: "Лимит инструментов (default)",type: "number", min: 0 },
  { key: "session.test_mode",      label: "Тестовый режим (0 руб. сессия)", type: "bool" },
  { key: "session.min_price",      label: "Минимальная цена сессии ₽",   type: "number", min: 0 },
];

export function PricingEditor({ initialSettings, practitioners }: Props) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [pracPrices, setPracPrices] = useState<Record<string, { price: string; duration: string }>>(
    Object.fromEntries(practitioners.map(p => [p.id, {
      price: String(p.pricePerSession),
      duration: String(p.sessionDuration ?? 60),
    }]))
  );
  const [savingPrac, setSavingPrac] = useState<string | null>(null);

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const d = await res.json();
      if (d.ok) toast.success("Настройки сохранены");
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setSavingSettings(false); }
  }

  async function handleSavePractitioner(practitionerId: string) {
    const { price, duration } = pracPrices[practitionerId];
    setSavingPrac(practitionerId);
    try {
      const res = await fetch("/api/admin/practitioners/price", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practitionerId,
          pricePerSession: Number(price),
          sessionDuration: Number(duration),
        }),
      });
      const d = await res.json();
      if (d.ok) toast.success("Цена практика обновлена");
      else toast.error(d.error ?? "Ошибка");
    } catch { toast.error("Ошибка сети"); }
    finally { setSavingPrac(null); }
  }

  const testMode = settings["session.test_mode"] === "true";

  return (
    <div className="space-y-8">
      {/* Тестовый режим — вверху, заметно */}
      <Card className={`border-2 ${testMode ? "border-yellow-500/40 bg-yellow-500/5" : "border-border/40 bg-card/50"}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">🧪 Тестовый режим</h2>
                {testMode && <Badge className="bg-yellow-500/20 text-yellow-400">Активен</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                В тестовом режиме стоимость сессий = 0 ₽. Используйте для тестирования видеочата без реальных платежей.
              </p>
            </div>
            <button
              onClick={() => setSettings(s => ({ ...s, "session.test_mode": testMode ? "false" : "true" }))}
              className={`relative h-7 w-14 rounded-full transition-colors ${testMode ? "bg-yellow-500" : "bg-muted/40"}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${testMode ? "translate-x-7" : "translate-x-0.5"}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Тарифные планы */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Тарифные планы</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLAN_KEYS.filter(k => k.key !== "session.test_mode").map(({ key, label, type, min, max }) => (
              <div key={key}>
                <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
                {type === "bool" ? (
                  <button
                    onClick={() => setSettings(s => ({ ...s, [key]: s[key] === "true" ? "false" : "true" }))}
                    className={`h-6 w-12 rounded-full transition-colors ${settings[key] === "true" ? "bg-primary" : "bg-muted/40"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform mx-0.5 ${settings[key] === "true" ? "translate-x-6" : ""}`} />
                  </button>
                ) : (
                  <input
                    type="number" min={min} max={max}
                    value={settings[key] ?? ""}
                    onChange={(e) => setSettings(s => ({ ...s, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
          <button onClick={handleSaveSettings} disabled={savingSettings}
            className="mt-5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-navy disabled:opacity-50">
            {savingSettings ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </CardContent>
      </Card>

      {/* Цены практиков */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-5">Цены и длительность сессий практиков</h2>
          <div className="space-y-3">
            {practitioners.map(p => {
              const pp = pracPrices[p.id];
              return (
                <div key={p.id} className="flex items-center gap-4 rounded-xl border border-border/30 bg-card/20 px-4 py-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.user.name}</p>
                    <p className="text-xs text-muted-foreground">{p.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Цена ₽</label>
                      <input type="number" min={0} value={pp.price}
                        onChange={(e) => setPracPrices(prev => ({ ...prev, [p.id]: { ...prev[p.id], price: e.target.value } }))}
                        className="w-24 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Длит. мин</label>
                      <select value={pp.duration}
                        onChange={(e) => setPracPrices(prev => ({ ...prev, [p.id]: { ...prev[p.id], duration: e.target.value } }))}
                        className="w-24 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 text-sm focus:border-primary focus:outline-none">
                        {[30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d} мин</option>)}
                      </select>
                    </div>
                    <button onClick={() => handleSavePractitioner(p.id)} disabled={savingPrac === p.id}
                      className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 mt-4">
                      {savingPrac === p.id ? "..." : "Сохранить"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

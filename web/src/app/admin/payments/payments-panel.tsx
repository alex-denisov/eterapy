"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Practitioner {
  id: string;
  userId: string;
  name: string;
  email: string;
  sessionCount: number;
  totalRevenue: number;
  platformFee: number;
  practitionerEarnings: number;
  lastPayout: string | null;
}

export function PaymentsPanel({ practitioners }: { practitioners: Practitioner[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const filtered = practitioners.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function markPaid(practitionerId: string) {
    setProcessing(practitionerId);
    // Placeholder — реальная выплата через ЮKassa API или банковский перевод
    await new Promise(r => setTimeout(r, 800));
    toast.success("Помечено как выплачено");
    setProcessing(null);
  }

  async function pausePayout(practitionerId: string) {
    const c = comment[practitionerId];
    if (!c?.trim()) { toast.error("Укажите причину приостановки выплаты"); return; }
    setProcessing(practitionerId);
    // TODO: запись в PayoutRecord с паузой
    await new Promise(r => setTimeout(r, 400));
    toast.success("Выплата приостановлена");
    setProcessing(null);
  }

  const totalSelected = [...selected].reduce((sum, id) => {
    const p = practitioners.find(x => x.id === id);
    return sum + (p?.practitionerEarnings ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Input placeholder="Поиск практика..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="bg-card/50 max-w-xs h-8 text-sm" />
        {selected.size > 0 && (
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-muted-foreground">
              Выбрано: {selected.size} · {totalSelected.toLocaleString("ru")} ₽
            </span>
            <button onClick={() => { [...selected].forEach(id => markPaid(id)); setSelected(new Set()); }}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-navy">
              Отметить оплаченными
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card/30 border-b border-border/20">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
                  className="accent-primary" />
              </th>
              <th className="text-left p-3 text-xs text-muted-foreground font-medium">Практик</th>
              <th className="text-right p-3 text-xs text-muted-foreground font-medium">Сессий</th>
              <th className="text-right p-3 text-xs text-muted-foreground font-medium">Оборот</th>
              <th className="text-right p-3 text-xs text-muted-foreground font-medium">Комиссия 15%</th>
              <th className="text-right p-3 text-xs text-muted-foreground font-medium">К выплате</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {filtered.map(p => (
              <tr key={p.id} className={`hover:bg-white/2 ${selected.has(p.id) ? "bg-primary/3" : ""}`}>
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)} className="accent-primary" />
                </td>
                <td className="p-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </td>
                <td className="p-3 text-right text-muted-foreground">{p.sessionCount}</td>
                <td className="p-3 text-right">{p.totalRevenue.toLocaleString("ru")} ₽</td>
                <td className="p-3 text-right text-primary">{p.platformFee.toLocaleString("ru")} ₽</td>
                <td className="p-3 text-right font-semibold text-green-400">
                  {p.practitionerEarnings.toLocaleString("ru")} ₽
                </td>
                <td className="p-3">
                  <div className="flex gap-1 items-center justify-end">
                    <button onClick={() => markPaid(p.id)}
                      disabled={processing === p.id || p.practitionerEarnings === 0}
                      className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs text-primary hover:bg-primary/25 disabled:opacity-40 transition-colors">
                      {processing === p.id ? "..." : "Выплатить"}
                    </button>
                    <div className="relative group">
                      <button className="rounded-lg border border-border/30 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                        ⏸
                      </button>
                      {/* Всплывающая форма приостановки */}
                      <div className="absolute right-0 top-full mt-1 z-10 hidden group-focus-within:block w-56 rounded-xl border border-border/40 bg-card p-3 shadow-xl">
                        <p className="text-xs font-semibold mb-2">Причина приостановки</p>
                        <Input
                          value={comment[p.id] ?? ""}
                          onChange={e => setComment(prev => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Напр.: проверка документов"
                          className="h-7 text-xs bg-card/50 mb-2" />
                        <button onClick={() => pausePayout(p.id)}
                          className="w-full rounded-lg bg-orange-500/15 px-3 py-1 text-xs text-orange-400 hover:bg-orange-500/25">
                          Приостановить
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Нет практиков</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        * Оборот считается по всем завершённым сессиям за всё время. Фактические выплаты
        отслеживаются вручную до интеграции ЮKassa Payout API.
      </p>
    </div>
  );
}

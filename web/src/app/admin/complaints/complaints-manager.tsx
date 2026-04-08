"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Complaint {
  id: string;
  status: string;
  reason: string;
  description: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  clientName: string;
  clientEmail: string;
  practitionerName: string;
  practitionerId: string;
  practitionerSlug?: string;
  bookingId: string;
  priceRub: number;
}

const REASON_LABELS: Record<string, string> = {
  PRACTITIONER_NO_SHOW: "Практик не явился",
  ETHICAL_VIOLATION:    "Нарушение этического кодекса",
  MANIPULATION:         "Запугивание/манипуляции",
  TECHNICAL_ISSUE:      "Технический сбой",
  EARLY_TERMINATION:    "Сессия закончилась раньше",
  PAYMENT_ISSUE:        "Проблема с оплатой",
  OTHER:                "Другое",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  OPEN:      { label: "Новая",         color: "bg-red-500/10 text-red-400" },
  REVIEWING: { label: "На рассмотрении", color: "bg-yellow-500/10 text-yellow-400" },
  RESOLVED:  { label: "Решена",        color: "bg-green-500/10 text-green-400" },
  CLOSED:    { label: "Закрыта",       color: "bg-muted/20 text-muted-foreground" },
};

export function ComplaintsManager({ complaints: initial }: { complaints: Complaint[] }) {
  const [complaints, setComplaints] = useState(initial);
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const filtered = complaints.filter(c => filterStatus === "all" || c.status === filterStatus);

  async function updateStatus(id: string, status: string) {
    setProcessing(id);
    const res = await fetch(`/api/complaints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution: resolution[id] }),
    });
    if ((await res.json()).ok) {
      setComplaints(prev => prev.map(c => c.id === id ? { ...c, status, resolution: resolution[id] ?? c.resolution } : c));
      toast.success(`Статус обновлён: ${STATUS_META[status]?.label}`);
    } else toast.error("Ошибка");
    setProcessing(null);
  }

  const counts = { OPEN: 0, REVIEWING: 0, RESOLVED: 0, CLOSED: 0 };
  complaints.forEach(c => { counts[c.status as keyof typeof counts] = (counts[c.status as keyof typeof counts] ?? 0) + 1; });

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex gap-1 flex-wrap">
        {[
          ["all", "Все"],
          ["OPEN", `Новые (${counts.OPEN})`],
          ["REVIEWING", `На рассмотрении (${counts.REVIEWING})`],
          ["RESOLVED", `Решены (${counts.RESOLVED})`],
          ["CLOSED", `Закрыты (${counts.CLOSED})`],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              filterStatus === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length}</span>
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm rounded-xl border border-border/20">
          Жалоб нет
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.OPEN;
            const isExpanded = expandedId === c.id;
            return (
              <div key={c.id} className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
                {/* Заголовок */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge className={`${meta.color} text-xs`}>{meta.label}</Badge>
                      <span className="text-sm font-medium">{REASON_LABELS[c.reason] ?? c.reason}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.clientName} → {c.practitionerName} · {c.priceRub.toLocaleString("ru")} ₽
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                    <span className="text-muted-foreground/40 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Детали */}
                {isExpanded && (
                  <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-4">
                    {/* Описание */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Описание</p>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{c.description}</p>
                    </div>

                    {/* Контакт */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Клиент</p>
                        <p className="text-sm">{c.clientName}</p>
                        <p className="text-xs text-muted-foreground">{c.clientEmail}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Практик</p>
                        <a href={`/practitioners/${c.practitionerSlug ?? c.practitionerId}`} target="_blank"
                          className="text-sm text-primary hover:underline">{c.practitionerName} ↗</a>
                      </div>
                    </div>

                    {/* Резолюция */}
                    <div>
                      <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Решение / комментарий администратора
                      </label>
                      <textarea
                        value={resolution[c.id] ?? c.resolution ?? ""}
                        onChange={e => setResolution(prev => ({ ...prev, [c.id]: e.target.value }))}
                        placeholder="Опишите принятое решение..."
                        className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {/* Кнопки статусов */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.status !== "REVIEWING" && (
                        <button onClick={() => updateStatus(c.id, "REVIEWING")} disabled={processing === c.id}
                          className="rounded-lg border border-yellow-500/30 px-3 py-1.5 text-xs text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50">
                          На рассмотрение
                        </button>
                      )}
                      {c.status !== "RESOLVED" && (
                        <button onClick={() => updateStatus(c.id, "RESOLVED")} disabled={processing === c.id}
                          className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10 disabled:opacity-50">
                          ✓ Решена
                        </button>
                      )}
                      {c.status !== "CLOSED" && (
                        <button onClick={() => updateStatus(c.id, "CLOSED")} disabled={processing === c.id}
                          className="rounded-lg border border-border/30 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                          Закрыть
                        </button>
                      )}
                      {processing === c.id && <span className="text-xs text-muted-foreground">Обновление...</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

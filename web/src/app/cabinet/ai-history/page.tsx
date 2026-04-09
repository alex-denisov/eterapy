"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  TAROT:      { label: "Таро",         icon: "🃏" },
  CHECKIN:    { label: "Рефлексия",    icon: "💭" },
  NATAL:      { label: "Натальная карта", icon: "⭐" },
  NUMEROLOGY: { label: "Нумерология",  icon: "🔢" },
  HOROSCOPE:  { label: "Гороскоп",     icon: "♈" },
  GUIDE:      { label: "Личный гид",   icon: "🧭" },
};

interface LogEntry {
  id: string;
  tool: string;
  title: string;
  createdAt: string;
}

export default function AIHistoryPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ tool: string; title: string; prompt: string | null; result: string } | null>(null);

  useEffect(() => {
    fetch("/api/ai/history?limit=50")
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function openLog(id: string) {
    const res = await fetch(`/api/ai/history/${id}`);
    const d = await res.json();
    if (d.log) setSelected(d.log);
  }

  async function deleteLog(id: string) {
    await fetch(`/api/ai/history/${id}`, { method: "DELETE" });
    setLogs(prev => prev.filter(l => l.id !== id));
    toast.success("Запись удалена");
  }

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">История AI-инструментов</h1>
        <Link href="/tools" className="text-sm text-primary hover:underline">
          Открыть инструменты →
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground animate-pulse">Загружаем...</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-border/30 bg-card/20 py-16 text-center">
          <p className="text-4xl mb-4">✦</p>
          <p className="text-muted-foreground mb-2">Нет сохранённых сессий</p>
          <p className="text-sm text-muted-foreground/60">Результаты инструментов сохраняются автоматически</p>
          <Link href="/tools"
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy">
            Попробовать инструменты
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(l => {
            const meta = TOOL_LABELS[l.tool] ?? { label: l.tool, icon: "✦" };
            return (
              <div key={l.id} className="flex items-center gap-3 rounded-xl border border-border/20 bg-card/20 px-4 py-3 hover:bg-card/30 transition-colors">
                <span className="text-2xl shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openLog(l.id)}>
                  <p className="text-sm font-medium truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta.label} · {new Date(l.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openLog(l.id)}
                    className="text-xs text-primary hover:underline">Открыть</button>
                  <button onClick={() => deleteLog(l.id)}
                    className="text-xs text-muted-foreground/50 hover:text-red-400 transition-colors">×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно просмотра */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={(isOpen) => { if (!isOpen) setSelected(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh]" showCloseButton>
            <DialogHeader>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>{TOOL_LABELS[selected.tool]?.label}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selected.prompt && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Запрос</p>
                  <p className="text-sm text-muted-foreground bg-card/30 rounded-lg px-3 py-2">{selected.prompt}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Результат</p>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{selected.result}</div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { appUrl } from "@/lib/subdomain";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  TAROT:      { label: "Таро",         icon: "01" },
  CHECKIN:    { label: "Диалог ясности", icon: "02" },
  NATAL:      { label: "Натальная карта", icon: "03" },
  NUMEROLOGY: { label: "Нумерология",  icon: "04" },
  HOROSCOPE:  { label: "Гороскоп",     icon: "05" },
  GUIDE:      { label: "Личный гид",   icon: "06" },
  BOOKING:    { label: "Запись к практику", icon: "07" },
};

interface LogEntry {
  id: string;
  tool: string;
  title: string;
  createdAt: string;
}

interface FullReading {
  id: string;
  tool: string;
  title: string;
  createdAt: string;
  costKopecks: number;
  prompt: string | null;
  result: string;
}

export default function AIHistoryPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullReadings, setFullReadings] = useState<FullReading[]>([]);
  const [loadingReadings, setLoadingReadings] = useState(true);
  const [selected, setSelected] = useState<{ tool: string; title: string; prompt: string | null; result: string } | null>(null);
  const [expandedReading, setExpandedReading] = useState<FullReading | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "readings">("all");

  useEffect(() => {
    fetch("/api/modalities/history?limit=50")
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/cabinet/full-readings")
      .then(r => r.json())
      .then(d => { setFullReadings(d.readings ?? []); setLoadingReadings(false); })
      .catch(() => setLoadingReadings(false));
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
    <div className="max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="premium-eyebrow">Моя карта ETerapy</p>
          <h1 className="premium-title mt-2 text-3xl md:text-5xl">История разборов</h1>
        </div>
        <Link href={appUrl("/cabinet/modalities")} className="soft-button soft-button-ghost text-sm">
          Открыть направления →
        </Link>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Все действия
        </button>
        <button
          onClick={() => setActiveTab("readings")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "readings"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          История раскладов
        </button>
      </div>

      {activeTab === "all" && (
        loading ? (
          <div className="space-y-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon="✦"
            title="Нет сохранённых сессий"
            description="Результаты направлений сохраняются автоматически"
            actionHref={appUrl("/cabinet/modalities")}
            actionLabel="Попробовать направления"
          />
        ) : (
          <div className="space-y-2">
            {logs.map(l => {
              const meta = TOOL_LABELS[l.tool] ?? { label: l.tool, icon: "✦" };
              return (
                <div key={l.id} className="soft-card flex items-center gap-3 px-4 py-3 transition-colors hover:-translate-y-0.5">
                  <span className="font-heading text-2xl text-primary shrink-0">{meta.icon}</span>
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
        )
      )}

      {activeTab === "readings" && (
        loadingReadings ? (
          <div className="space-y-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        ) : fullReadings.length === 0 ? (
          <EmptyState
            icon="✦"
            title="Нет полных раскладов"
            description="Полные расклады появляются здесь после оплаты"
            actionHref={appUrl("/cabinet/modalities")}
            actionLabel="Перейти к инструментам"
          />
        ) : (
          <div className="space-y-2">
            {fullReadings.map(r => {
              const meta = TOOL_LABELS[r.tool] ?? { label: r.tool, icon: "✦" };
              const isExpanded = expandedReading?.id === r.id;
              return (
                <div key={r.id} className="soft-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-2xl text-primary shrink-0">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} · {(r.costKopecks / 100).toLocaleString("ru-RU")} ₽
                      </p>
                    </div>
                    <button
                      onClick={() => setExpandedReading(isExpanded ? null : r)}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      {isExpanded ? "Свернуть" : "Посмотреть результат"}
                    </button>
                  </div>
                  {isExpanded && expandedReading && (
                    <div className="mt-4 pt-4 border-t border-border/20 space-y-3">
                      {expandedReading.prompt && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Запрос</p>
                          <p className="text-sm text-muted-foreground bg-card/30 rounded-lg px-3 py-2">{expandedReading.prompt}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Результат</p>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{expandedReading.result}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
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

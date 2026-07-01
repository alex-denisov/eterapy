"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileWarning, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type EventRow = {
  id: string;
  subjectType: string;
  subjectId: string | null;
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  riskScore: number;
  riskFlags: string[];
  action: string;
  status: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

type AntifraudData = {
  metrics: Record<string, number>;
  statusGroups: Array<{ status: string; count: number }>;
  actionGroups: Array<{ action: string; count: number }>;
  subjectGroups: Array<{ subjectType: string; count: number }>;
  recentEvents: EventRow[];
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  logged: { label: "лог", className: "bg-slate-500/10 text-slate-600" },
  review: { label: "проверка", className: "bg-yellow-500/10 text-yellow-700" },
  blocked: { label: "блок", className: "bg-red-500/10 text-red-700" },
  clawback: { label: "clawback", className: "bg-orange-500/10 text-orange-700" },
  resolved: { label: "решено", className: "bg-emerald-500/10 text-emerald-700" },
};

const SECTION_CARDS = [
  { key: "referralRisk", label: "Реферальный риск", hint: "цепочки и удержание бонусов" },
  { key: "creditHolds", label: "Баллы и удержания", hint: "pending/revoked credits" },
  { key: "heldPayouts", label: "Платежные споры", hint: "удержанные выплаты" },
  { key: "practitionerRisk", label: "Риск практиков", hint: "риск практиков" },
  { key: "riskyReviews", label: "Модерация контента", hint: "отзывы на проверке" },
  { key: "appealQueue", label: "Апелляции", hint: "апелляции" },
];

function riskTone(score: number) {
  if (score >= 80) return "text-red-700";
  if (score >= 60) return "text-orange-700";
  if (score >= 31) return "text-yellow-700";
  return "text-emerald-700";
}

function evidenceText(evidence: Record<string, unknown>) {
  const entries = Object.entries(evidence).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) return "Нет дополнительных данных";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export function AdminAntifraudPanel({ initialData }: { initialData: AntifraudData }) {
  const [events, setEvents] = useState(initialData.recentEvents);
  const [filter, setFilter] = useState("review");
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "high") return events.filter((event) => event.riskScore >= 70);
    if (filter === "appeals") return events.filter((event) => event.action === "appeal_submitted");
    return events.filter((event) => event.status === filter);
  }, [events, filter]);

  async function decide(eventId: string, status: string) {
    setBusy(eventId);
    const res = await fetch("/api/admin/antifraud", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, status, note: note[eventId] ?? "" }),
    });
    const json = await res.json();
    if (json.ok) {
      setEvents((prev) => prev.map((event) => (event.id === eventId ? { ...event, status } : event)));
      toast.success("Решение сохранено");
    } else {
      toast.error(json.error ?? "Не удалось сохранить решение");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <section
        className="grid gap-3 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4 md:grid-cols-3"
        data-testid="admin-antifraud-v42-guardrails"
      >
        <div>
          <p className="soft-eyebrow">значимое действие</p>
          <p className="mt-2 text-sm font-medium">Бонусы не за клик, а за завершённый шаг</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Реферальные и канальные награды проходят удержание до первичного разбора, покупки или состоявшейся встречи.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">контур баллов</p>
          <p className="mt-2 text-sm font-medium">Баллы можно отозвать при fraud</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Журнал баллов хранит источник, статус, отзыв и срок действия; живые консультации не превращаются в бесплатный вывод бонусов.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">доверие к практикам</p>
          <p className="mt-2 text-sm font-medium">Hold выплат до решения модератора</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Фиктивные бронирования, внешние оплаты, жалобы и комплаенс-флаги видны рядом с доказательствами и апелляциями.
          </p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["todayEvents", "За 24 часа", AlertTriangle],
          ["reviewQueue", "Ручная проверка", FileWarning],
          ["blockedEvents", "Блокировки", ShieldCheck],
          ["clawbackEvents", "Clawback", RotateCcw],
          ["highRiskEvents", "Высокий риск", CheckCircle2],
        ].map(([key, label, Icon]) => (
          <div key={key as string} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{label as string}</p>
              <Icon className="h-4 w-4 text-[var(--soft-bordeaux)]" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{initialData.metrics[key as string] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTION_CARDS.map((section) => (
          <div key={section.key} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] p-4">
            <p className="text-sm font-medium">{section.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{section.hint}</p>
            <p className="mt-3 text-xl font-semibold">{initialData.metrics[section.key] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--soft-paper-edge)] px-4 py-3">
            {[
              ["review", "Проверка"],
              ["blocked", "Блок"],
              ["clawback", "Clawback"],
              ["high", "Высокий риск"],
              ["appeals", "Апелляции"],
              ["all", "Все"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  filter === value ? "bg-[var(--soft-bordeaux)] text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} событий</span>
          </div>

          <div className="divide-y divide-[var(--soft-paper-edge)]">
            {filtered.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">Очередь пуста</div>
            ) : (
              filtered.map((event) => {
                const status = STATUS_META[event.status] ?? STATUS_META.logged;
                return (
                  <div key={event.id} className="space-y-3 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={status.className}>{status.label}</Badge>
                          <span className={`text-sm font-semibold ${riskTone(event.riskScore)}`}>риск {event.riskScore}</span>
                          <span className="text-sm font-medium">{event.action}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.subjectType}{event.subjectId ? `:${event.subjectId}` : ""} · {event.actorName} ·{" "}
                          {new Date(event.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </div>
                      <div className="soft-admin-table-actions shrink-0">
                        <button
                          type="button"
                          className="soft-admin-icon-button"
                          data-variant="primary"
                          disabled={busy === event.id}
                          onClick={() => decide(event.id, "resolved")}
                          title="Отметить решенным"
                          aria-label="Отметить антифрод-событие решенным"
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="soft-admin-icon-button"
                          data-variant="danger"
                          disabled={busy === event.id}
                          onClick={() => decide(event.id, "blocked")}
                          title="Заблокировать"
                          aria-label="Заблокировать по антифрод-событию"
                        >
                          <ShieldCheck className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {event.riskFlags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Без кодов причины</span>
                      ) : (
                        event.riskFlags.map((flag) => (
                          <span key={flag} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {flag}
                          </span>
                        ))
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{evidenceText(event.evidence)}</p>
                    <input
                      value={note[event.id] ?? ""}
                      onChange={(e) => setNote((prev) => ({ ...prev, [event.id]: e.target.value }))}
                      placeholder="Заметка к решению"
                      className="h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-background px-3 text-xs outline-none focus:border-[var(--soft-bordeaux)]"
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
            <h2 className="text-sm font-semibold">Аналитика действий</h2>
            <div className="mt-3 space-y-2">
              {initialData.actionGroups.slice(0, 8).map((row) => (
                <div key={row.action} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{row.action}</span>
                  <span className="font-medium">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
            <h2 className="text-sm font-semibold">Карта доказательств</h2>
            <div className="mt-3 space-y-2">
              {initialData.subjectGroups.map((row) => (
                <div key={row.subjectType} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{row.subjectType}</span>
                  <span className="font-medium">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

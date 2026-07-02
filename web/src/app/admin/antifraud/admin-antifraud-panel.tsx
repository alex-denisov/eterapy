"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileWarning, RotateCcw, ShieldCheck } from "lucide-react";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

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

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  logged: { label: "лог", tone: "neutral" },
  review: { label: "проверка", tone: "warn" },
  blocked: { label: "блок", tone: "danger" },
  clawback: { label: "clawback", tone: "warn" },
  resolved: { label: "решено", tone: "ok" },
};

const SECTION_CARDS = [
  { key: "referralRisk", label: "Реферальный риск", hint: "цепочки и удержание бонусов" },
  { key: "creditHolds", label: "Баллы и удержания", hint: "pending/revoked credits" },
  { key: "heldPayouts", label: "Платежные споры", hint: "удержанные выплаты" },
  { key: "practitionerRisk", label: "Риск практиков", hint: "риск практиков" },
  { key: "riskyReviews", label: "Модерация контента", hint: "отзывы на проверке" },
  { key: "appealQueue", label: "Апелляции", hint: "апелляции" },
];

function evidenceText(evidence: Record<string, unknown>) {
  const entries = Object.entries(evidence).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) return "Нет дополнительных данных";
  return entries
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((value) => ({ value, label: value }));
}

function eventStatusOptions(events: EventRow[]) {
  return Array.from(new Set(events.map((event) => event.status)))
    .sort((a, b) => (STATUS_META[a]?.label ?? a).localeCompare(STATUS_META[b]?.label ?? b, "ru"))
    .map((value) => ({ value, label: STATUS_META[value]?.label ?? value }));
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function AdminAntifraudPanel({ initialData }: { initialData: AntifraudData }) {
  const [events, setEvents] = useState(initialData.recentEvents);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const eventColumns = useMemo<AdminCompactColumn[]>(() => [
    { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
    { key: "risk", label: "Риск", sortable: true, align: "right" },
    { key: "status", label: "Статус", sortable: true, filterKind: "select", options: eventStatusOptions(events) },
    { key: "action", label: "Действие", sortable: true, filterKind: "select", options: uniqueOptions(events.map((event) => event.action)) },
    { key: "actor", label: "Актор", sortable: true },
    { key: "subject", label: "Объект", sortable: true },
    { key: "flags", label: "Флаги и доказательства", sortable: true },
    { key: "note", label: "Заметка к решению", sortable: false, filterKind: "none" },
    { key: "actions", label: "Действия", filterKind: "none", align: "center" },
  ], [events]);

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

  const eventRows = events.map((event) => {
    const status = STATUS_META[event.status] ?? STATUS_META.logged;
    const subject = `${event.subjectType}${event.subjectId ? `:${event.subjectId}` : ""}`;
    const evidence = evidenceText(event.evidence);
    const flags = event.riskFlags.length > 0 ? event.riskFlags.join(", ") : "Без кодов причины";
    return {
      id: event.id,
      cells: {
        createdAt: {
          value: formatEventTime(event.createdAt),
          filterValue: formatEventTime(event.createdAt),
          sortValue: new Date(event.createdAt).getTime(),
        },
        risk: {
          kind: "status" as const,
          label: `${event.riskScore}/100`,
          tone: event.riskScore >= 80 ? "danger" as const : event.riskScore >= 60 ? "warn" as const : "ok" as const,
          filterValue: String(event.riskScore),
          sortValue: event.riskScore,
        },
        status: {
          kind: "status" as const,
          label: status.label,
          tone: status.tone,
          filterValue: `${event.status} ${status.label}`,
          sortValue: status.label,
        },
        action: event.action,
        actor: {
          value: event.actorName,
          subvalue: event.actorRole ?? event.actorUserId ?? "",
          filterValue: `${event.actorName} ${event.actorRole ?? ""} ${event.actorUserId ?? ""}`,
          sortValue: event.actorName,
        },
        subject: {
          value: subject,
          title: subject,
          filterValue: subject,
          sortValue: subject,
        },
        flags: {
          value: flags,
          subvalue: evidence,
          title: `${flags} · ${evidence}`,
          filterValue: `${flags} ${evidence}`,
          sortValue: flags,
        },
        note: {
          kind: "node" as const,
          filterValue: note[event.id] ?? "",
          node: (
            <input
              value={note[event.id] ?? ""}
              onChange={(e) => setNote((prev) => ({ ...prev, [event.id]: e.target.value }))}
              placeholder="Заметка"
              className="h-7 w-full min-w-[10rem] rounded border border-[var(--soft-paper-edge)] bg-white px-2 text-[11px] outline-none focus:ring-1 focus:ring-[var(--soft-bordeaux)]"
              aria-label={`Заметка к решению ${event.id}`}
            />
          ),
        },
        actions: {
          kind: "actions" as const,
          actions: [
            {
              label: "Отметить решенным",
              icon: "check" as const,
              variant: "primary" as const,
              disabled: busy === event.id,
              onClick: () => { void decide(event.id, "resolved"); },
            },
            {
              label: "Заблокировать",
              icon: "cancel" as const,
              variant: "danger" as const,
              disabled: busy === event.id,
              onClick: () => { void decide(event.id, "blocked"); },
            },
          ],
        },
      },
    };
  });

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.75fr)]">
        <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
          <div className="border-b border-[var(--soft-paper-edge)] px-4 py-3">
            <h2 className="text-sm font-semibold">Очередь антифрод-событий</h2>
            <p className="mt-1 text-xs text-muted-foreground">Фильтры, сортировка, заметка и решение по каждому событию в едином формате таблиц суперадминки.</p>
          </div>
          <div className="p-3">
            <AdminCompactDataTable
              columns={eventColumns}
              rows={eventRows}
              empty="Очередь пуста"
              minWidth="1420px"
              pageSize={20}
            />
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

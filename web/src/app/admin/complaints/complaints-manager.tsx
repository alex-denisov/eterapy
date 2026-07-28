"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { dispatchAdminCountsChanged } from "@/lib/admin-counts-events";

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
  heldPayoutKopecks: number | null;
  transcriptText: string | null;
  recordingUrl: string | null;
  recordingExpiry: string | null;
  summaryText: string | null;
  practitionerNotesText: string | null;
  clientFollowupDraft: string | null;
  sessionTranscriptText: string | null;
  complianceStatus: string | null;
  complianceRiskScore: number | null;
  complianceEvidence: {
    status: string;
    riskScore: number;
    riskFlags: string[];
    severity: string;
    summary: string;
    evidenceQuotes: string[];
    moderatorRecommendation: string;
  } | null;
  sessionMessages: Array<{ text: string | null; fileName: string | null; fileUrl: string | null; senderName: string; createdAt: string }>;
}

type PayoutDecision = "release" | "withhold";

const REASON_LABELS: Record<string, string> = {
  PRACTITIONER_NO_SHOW: "Практик не явился",
  ETHICAL_VIOLATION: "Нарушение этического кодекса",
  MANIPULATION: "Запугивание/манипуляции",
  TECHNICAL_ISSUE: "Технический сбой",
  EARLY_TERMINATION: "Сессия закончилась раньше",
  PAYMENT_ISSUE: "Проблема с оплатой",
  OTHER: "Другое",
};

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  OPEN: { label: "Новая", tone: "danger" },
  REVIEWING: { label: "На рассмотрении", tone: "warn" },
  RESOLVED: { label: "Решена", tone: "ok" },
  CLOSED: { label: "Закрыта", tone: "neutral" },
};

const complaintColumns: AdminCompactColumn[] = [
  { key: "complaint", label: "Жалоба", sortable: true },
  { key: "client", label: "Клиент", sortable: true },
  { key: "practitioner", label: "Практик", sortable: true },
  { key: "amount", label: "Сумма", sortable: true, align: "right" },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "OPEN", label: "Новые" },
      { value: "REVIEWING", label: "На рассмотрении" },
      { value: "RESOLVED", label: "Решены" },
      { value: "CLOSED", label: "Закрыты" },
    ],
  },
  { key: "createdAt", label: "Создано", sortable: true, filterKind: "date" },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export function ComplaintsManager({ complaints: initial }: { complaints: Complaint[] }) {
  const [complaints, setComplaints] = useState(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Record<string, PayoutDecision>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    const complaint = complaints.find((item) => item.id === id);
    const isTerminal = status === "RESOLVED" || status === "CLOSED";
    const hasHeld = (complaint?.heldPayoutKopecks ?? 0) > 0;
    const payoutDecision = isTerminal && hasHeld ? decision[id] : undefined;

    if (isTerminal && hasHeld && !payoutDecision) {
      toast.error("Сначала выберите: освободить или удержать выплату");
      return;
    }

    setProcessing(id);
    const response = await fetch(`/api/complaints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution: resolution[id], payoutDecision }),
    });
    const payload = await response.json();
    if (payload.ok) {
      setComplaints((current) =>
        current.map((item) =>
          item.id === id
            ? {
              ...item,
              status,
              resolution: resolution[id] ?? item.resolution,
              heldPayoutKopecks: payload.payoutAction === "released" || payload.payoutAction === "withheld" ? null : item.heldPayoutKopecks,
            }
            : item,
        ),
      );
      dispatchAdminCountsChanged();
      const suffix = payload.payoutAction === "released"
        ? " · выплата освобождена"
        : payload.payoutAction === "withheld"
          ? " · выплата удержана, клиенту возвращены деньги"
          : "";
      toast.success(`Статус обновлён: ${STATUS_META[status]?.label}${suffix}`);
    } else if (response.status === 422 && payload.error === "Требуется решение по выплате") {
      toast.error("Выберите решение по удержанной выплате");
    } else {
      toast.error(payload.error ?? "Ошибка");
    }
    setProcessing(null);
  }

  return (
    <div className="space-y-4">
      <AdminCompactDataTable
        columns={complaintColumns}
        rows={complaints.map((complaint) => {
          const meta = STATUS_META[complaint.status] ?? STATUS_META.OPEN;
          const isExpanded = expandedId === complaint.id;
          const reason = REASON_LABELS[complaint.reason] ?? complaint.reason;
          const heldRub = (complaint.heldPayoutKopecks ?? 0) / 100;
          return {
            id: complaint.id,
            cells: {
              complaint: {
                kind: "node",
                filterValue: `${reason} ${complaint.description} ${complaint.complianceEvidence?.riskFlags.join(" ") ?? ""}`,
                sortValue: reason,
                node: (
                  <span className="block min-w-[20rem]">
                    <button
                      type="button"
                      className="mr-1 inline-flex size-6 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white align-middle text-[var(--soft-bordeaux)]"
                      onClick={() => setExpandedId(isExpanded ? null : complaint.id)}
                      aria-label={isExpanded ? "Свернуть жалобу" : "Раскрыть жалобу"}
                      title={isExpanded ? "Свернуть" : "Раскрыть"}
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                    </button>
                    <span className="font-medium">{reason}</span>
                    {complaint.complianceRiskScore !== null ? <span className="ml-2 text-xs text-red-500">риск {complaint.complianceRiskScore}</span> : null}
                    {isExpanded ? (
                      <span className="mt-3 grid gap-3 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-xs text-[var(--soft-ink-soft)]">
                        <span><b className="text-[var(--soft-ink)]">Описание:</b> {complaint.description}</span>
                        {complaint.complianceEvidence ? (
                          <span className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2">
                            <span className="block font-medium text-yellow-700">Compliance: {complaint.complianceEvidence.status} · риск {complaint.complianceEvidence.riskScore}/100 · {complaint.complianceEvidence.severity}</span>
                            {complaint.complianceEvidence.summary ? <span className="mt-1 block">{complaint.complianceEvidence.summary}</span> : null}
                            {complaint.complianceEvidence.riskFlags.length > 0 ? <span className="mt-1 block">Флаги: {complaint.complianceEvidence.riskFlags.join(", ")}</span> : null}
                            {complaint.complianceEvidence.evidenceQuotes.length > 0 ? (
                              <span className="mt-1 grid gap-1">
                                {complaint.complianceEvidence.evidenceQuotes.slice(0, 4).map((quote, index) => (
                                  <span key={`${quote}-${index}`} className="border-l border-yellow-500/30 pl-2">{quote}</span>
                                ))}
                              </span>
                            ) : null}
                            {complaint.complianceEvidence.moderatorRecommendation ? <span className="mt-1 block">Рекомендация: {complaint.complianceEvidence.moderatorRecommendation}</span> : null}
                          </span>
                        ) : null}
                        {complaint.recordingUrl ? (
                          <a href={complaint.recordingUrl} target="_blank" rel="noreferrer" className="text-[var(--soft-bordeaux)] hover:underline">
                            Открыть запись {complaint.recordingExpiry ? `(до ${formatDate(complaint.recordingExpiry)})` : ""}
                          </a>
                        ) : null}
                        {complaint.summaryText ? <span><b className="text-[var(--soft-ink)]">AI-резюме:</b> {complaint.summaryText}</span> : null}
                        {complaint.practitionerNotesText ? <span><b className="text-[var(--soft-ink)]">Заметки практику:</b> {complaint.practitionerNotesText}</span> : null}
                        {complaint.clientFollowupDraft ? <span><b className="text-[var(--soft-ink)]">Черновик клиенту:</b> {complaint.clientFollowupDraft}</span> : null}
                        {complaint.sessionTranscriptText ? <span className="max-h-40 overflow-auto whitespace-pre-line"><b className="text-[var(--soft-ink)]">STT-транскрипт:</b> {complaint.sessionTranscriptText}</span> : null}
                        {complaint.sessionMessages.length > 0 ? (
                          <span className="max-h-40 overflow-auto rounded bg-white/60 p-2">
                            <b className="text-[var(--soft-ink)]">Чат сессии:</b>
                            {complaint.sessionMessages.slice(0, 50).map((message, index) => (
                              <span key={`${message.createdAt}-${index}`} className="block">
                                [{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}] {message.senderName}:{" "}
                                {message.text ?? ""}
                                {message.fileUrl && message.fileName ? <a href={message.fileUrl} target="_blank" rel="noreferrer" className="ml-1 text-[var(--soft-bordeaux)]">Файл: {message.fileName}</a> : null}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        <span className="grid gap-1">
                          <label className="font-medium text-[var(--soft-ink)]" htmlFor={`resolution-${complaint.id}`}>Решение / комментарий администратора</label>
                          <textarea
                            id={`resolution-${complaint.id}`}
                            value={resolution[complaint.id] ?? complaint.resolution ?? ""}
                            onChange={(event) => setResolution((current) => ({ ...current, [complaint.id]: event.target.value }))}
                            placeholder="Опишите принятое решение..."
                            className="min-h-20 rounded border border-[var(--soft-paper-edge)] bg-white px-2 py-1 text-xs text-[var(--soft-ink)] outline-none focus:bg-slate-50"
                          />
                        </span>
                        {heldRub > 0 ? (
                          <span className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2">
                            <span className="block font-medium text-yellow-700">Удержанная выплата: {heldRub.toLocaleString("ru-RU")} ₽</span>
                            <label className="mt-2 flex items-start gap-2">
                              <input
                                type="radio"
                                name={`decision-${complaint.id}`}
                                checked={decision[complaint.id] === "release"}
                                onChange={() => setDecision((current) => ({ ...current, [complaint.id]: "release" }))}
                              />
                              <span>Освободить выплату практику, клиенту возврата нет.</span>
                            </label>
                            <label className="mt-1 flex items-start gap-2">
                              <input
                                type="radio"
                                name={`decision-${complaint.id}`}
                                checked={decision[complaint.id] === "withhold"}
                                onChange={() => setDecision((current) => ({ ...current, [complaint.id]: "withhold" }))}
                              />
                              <span>Удержать выплату, клиенту возвращается {complaint.priceRub.toLocaleString("ru-RU")} ₽.</span>
                            </label>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              client: { value: complaint.clientName, subvalue: complaint.clientEmail, filterValue: `${complaint.clientName} ${complaint.clientEmail}` },
              practitioner: {
                kind: "link",
                href: `/practitioners/${complaint.practitionerSlug ?? complaint.practitionerId}`,
                label: complaint.practitionerName,
                external: true,
                filterValue: complaint.practitionerName,
                sortValue: complaint.practitionerName,
              },
              amount: { value: `${complaint.priceRub.toLocaleString("ru-RU")} ₽`, sortValue: complaint.priceRub, filterValue: String(complaint.priceRub) },
              status: { kind: "status", label: meta.label, tone: meta.tone, filterValue: complaint.status, sortValue: meta.label },
              createdAt: { value: formatDate(complaint.createdAt), sortValue: new Date(complaint.createdAt).getTime(), filterValue: formatDate(complaint.createdAt) },
              actions: {
                kind: "actions",
                actions: [
                  ...(complaint.status !== "REVIEWING" ? [{ label: "На рассмотрение", icon: "refresh" as const, disabled: processing === complaint.id, onClick: () => { void updateStatus(complaint.id, "REVIEWING"); } }] : []),
                  ...(complaint.status !== "RESOLVED" ? [{ label: "Решена", icon: "check" as const, variant: "primary" as const, disabled: processing === complaint.id, onClick: () => { void updateStatus(complaint.id, "RESOLVED"); } }] : []),
                  ...(complaint.status !== "CLOSED" ? [{ label: "Закрыть", icon: "cancel" as const, disabled: processing === complaint.id, onClick: () => { void updateStatus(complaint.id, "CLOSED"); } }] : []),
                ],
              },
            },
          };
        })}
        empty="Жалоб нет"
        minWidth="1180px"
      />
    </div>
  );
}

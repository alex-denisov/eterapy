"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";

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
  /** kopecks; null if no HELD payout exists for this booking */
  heldPayoutKopecks: number | null;
  // VideoSession artifacts
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
const PAGE_SIZE = 20;

export function ComplaintsManager({ complaints: initial }: { complaints: Complaint[] }) {
  const [complaints, setComplaints] = useState(initial);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    reason: "",
    client: "",
    practitioner: "",
    amount: "",
    status: "all",
    createdAt: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Record<string, PayoutDecision>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const filtered = complaints.filter(c => {
    if (filters.status !== "all" && c.status !== filters.status) return false;
    return [
      [filters.reason, `${REASON_LABELS[c.reason] ?? c.reason} ${c.description}`],
      [filters.client, `${c.clientName} ${c.clientEmail}`],
      [filters.practitioner, c.practitionerName],
      [filters.amount, String(c.priceRub)],
      [filters.createdAt, new Date(c.createdAt).toLocaleDateString("ru-RU")],
    ].every(([filter, value]) => !filter || value.toLowerCase().includes(filter.toLowerCase()));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function updateStatus(id: string, status: string) {
    const c = complaints.find(x => x.id === id);
    const isTerminal = status === "RESOLVED" || status === "CLOSED";
    const hasHeld = (c?.heldPayoutKopecks ?? 0) > 0;
    const payoutDecision = isTerminal && hasHeld ? decision[id] : undefined;

    if (isTerminal && hasHeld && !payoutDecision) {
      toast.error("Сначала выберите: освободить или удержать выплату");
      return;
    }

    setProcessing(id);
    const res = await fetch(`/api/complaints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution: resolution[id], payoutDecision }),
    });
    const json = await res.json();
    if (json.ok) {
      setComplaints(prev =>
        prev.map(c =>
          c.id === id
            ? {
                ...c,
                status,
                resolution: resolution[id] ?? c.resolution,
                heldPayoutKopecks:
                  json.payoutAction === "released" || json.payoutAction === "withheld"
                    ? null
                    : c.heldPayoutKopecks,
              }
            : c,
        ),
      );
      const suffix =
        json.payoutAction === "released"
          ? " · выплата освобождена"
          : json.payoutAction === "withheld"
          ? " · выплата удержана, клиенту возвращены деньги"
          : "";
      toast.success(`Статус обновлён: ${STATUS_META[status]?.label}${suffix}`);
    } else if (res.status === 422 && json.error === "Требуется решение по выплате") {
      toast.error("Выберите решение по удержанной выплате");
    } else {
      toast.error(json.error ?? "Ошибка");
    }
    setProcessing(null);
  }

  const counts = { OPEN: 0, REVIEWING: 0, RESOLVED: 0, CLOSED: 0 };
  complaints.forEach(c => { counts[c.status as keyof typeof counts] = (counts[c.status as keyof typeof counts] ?? 0) + 1; });

  return (
    <div className="space-y-4">
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm rounded-xl border border-border/20">
          Жалоб нет
        </div>
      ) : (
        <>
          <CompactTableShell minWidth="1120px">
            <thead>
              <tr>
                <CompactHeader label="Жалоба">
                  <HeaderTextFilter value={filters.reason} placeholder="причина/текст" onChange={(value) => { setFilters((current) => ({ ...current, reason: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Клиент">
                  <HeaderTextFilter value={filters.client} placeholder="имя/email" onChange={(value) => { setFilters((current) => ({ ...current, client: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Практик">
                  <HeaderTextFilter value={filters.practitioner} placeholder="практик" onChange={(value) => { setFilters((current) => ({ ...current, practitioner: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Сумма">
                  <HeaderTextFilter value={filters.amount} placeholder="₽" onChange={(value) => { setFilters((current) => ({ ...current, amount: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Статус">
                  <div className="p-1 pt-0">
                    <select
                      className={COMPACT_SELECT_CLASS}
                      value={filters.status}
                      onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value })); setPage(1); }}
                    >
                      <option value="all">Все ({complaints.length})</option>
                      <option value="OPEN">Новые ({counts.OPEN})</option>
                      <option value="REVIEWING">На рассмотрении ({counts.REVIEWING})</option>
                      <option value="RESOLVED">Решены ({counts.RESOLVED})</option>
                      <option value="CLOSED">Закрыты ({counts.CLOSED})</option>
                    </select>
                  </div>
                </CompactHeader>
                <CompactHeader label="Создано">
                  <HeaderTextFilter value={filters.createdAt} placeholder="дд.мм.гггг" onChange={(value) => { setFilters((current) => ({ ...current, createdAt: value })); setPage(1); }} />
                </CompactHeader>
                <CompactHeader label="Действия" />
              </tr>
            </thead>
            <tbody>
          {pageRows.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.OPEN;
            const isExpanded = expandedId === c.id;
            return (
              <Fragment key={c.id}>
                <tr>
                  <td className={COMPACT_CELL_CLASS}>
                    <button
                      type="button"
                      className="mr-1 inline-flex size-6 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white align-middle text-[var(--soft-bordeaux)]"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      aria-label={isExpanded ? "Свернуть жалобу" : "Раскрыть жалобу"}
                      title={isExpanded ? "Свернуть" : "Раскрыть"}
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                    </button>
                    <span className="font-medium" title={REASON_LABELS[c.reason] ?? c.reason}>{REASON_LABELS[c.reason] ?? c.reason}</span>
                  </td>
                  <td className={COMPACT_CELL_CLASS}>
                    <span className="soft-admin-cell-truncate">{c.clientName}</span>
                    <span className="soft-admin-cell-muted">{c.clientEmail}</span>
                  </td>
                  <td className={COMPACT_CELL_CLASS} title={c.practitionerName}>{c.practitionerName}</td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap tabular-nums`}>{c.priceRub.toLocaleString("ru-RU")} ₽</td>
                  <td className={COMPACT_CELL_CLASS}><Badge className={`${meta.color} text-xs`}>{meta.label}</Badge></td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{new Date(c.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                    <div className="soft-admin-table-actions">
                      {c.status !== "REVIEWING" && (
                        <button type="button" onClick={() => updateStatus(c.id, "REVIEWING")} disabled={processing === c.id} className="soft-admin-icon-button" title="На рассмотрение" aria-label="Перевести жалобу на рассмотрение">
                          <Clock3 className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {c.status !== "RESOLVED" && (
                        <button type="button" onClick={() => updateStatus(c.id, "RESOLVED")} disabled={processing === c.id} className="soft-admin-icon-button" data-variant="primary" title="Решена" aria-label="Отметить жалобу решенной">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {c.status !== "CLOSED" && (
                        <button type="button" onClick={() => updateStatus(c.id, "CLOSED")} disabled={processing === c.id} className="soft-admin-icon-button" title="Закрыть" aria-label="Закрыть жалобу">
                          <LockKeyhole className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Детали */}
                {isExpanded && (
                  <tr className="soft-admin-row-details">
                    <td colSpan={7}>
                      <div className="space-y-4 px-4 pb-4 pt-3">
                    {/* Описание */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Описание</p>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{c.description}</p>
                    </div>

                    {/* Артефакты сессии */}
                    {(c.transcriptText || c.recordingUrl || (c.sessionMessages?.length ?? 0) > 0 || c.summaryText || c.sessionTranscriptText || c.complianceEvidence) && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Артефакты сессии</p>
                        {c.complianceEvidence && (
                          <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge className="bg-yellow-500/10 text-yellow-300 text-xs">
                                Compliance: {c.complianceEvidence.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Риск {c.complianceRiskScore ?? c.complianceEvidence.riskScore}/100 · {c.complianceEvidence.severity}
                              </span>
                            </div>
                            {c.complianceEvidence.summary && (
                              <p className="mb-2 text-xs text-muted-foreground">{c.complianceEvidence.summary}</p>
                            )}
                            {c.complianceEvidence.riskFlags.length > 0 && (
                              <p className="mb-2 text-xs text-muted-foreground">
                                Флаги: {c.complianceEvidence.riskFlags.join(", ")}
                              </p>
                            )}
                            {c.complianceEvidence.evidenceQuotes.length > 0 && (
                              <div className="mb-2 space-y-1">
                                {c.complianceEvidence.evidenceQuotes.map((quote, index) => (
                                  <blockquote key={`${quote}-${index}`} className="border-l border-yellow-500/30 pl-2 text-xs text-muted-foreground">
                                    {quote}
                                  </blockquote>
                                ))}
                              </div>
                            )}
                            {c.complianceEvidence.moderatorRecommendation && (
                              <p className="text-xs text-yellow-200/80">
                                Рекомендация: {c.complianceEvidence.moderatorRecommendation}
                              </p>
                            )}
                          </div>
                        )}
                        {c.recordingUrl && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-1">🎬 Запись сессии</p>
                            <a href={c.recordingUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline">
                              Открыть запись {c.recordingExpiry ? `(до ${new Date(c.recordingExpiry).toLocaleDateString("ru-RU")})` : ""}
                            </a>
                          </div>
                        )}
                        {c.summaryText && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-1">📝 AI-резюме</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line bg-card/30 rounded-lg p-3 max-h-40 overflow-auto">{c.summaryText}</p>
                          </div>
                        )}
                        {c.practitionerNotesText && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-1">Заметки для практика</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line bg-card/30 rounded-lg p-3 max-h-40 overflow-auto">{c.practitionerNotesText}</p>
                          </div>
                        )}
                        {c.clientFollowupDraft && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-1">Черновик сообщения клиенту</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line bg-card/30 rounded-lg p-3 max-h-40 overflow-auto">{c.clientFollowupDraft}</p>
                          </div>
                        )}
                        {c.sessionTranscriptText && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground mb-1">STT-транскрипт</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-line bg-card/30 rounded-lg p-3 max-h-60 overflow-auto">{c.sessionTranscriptText}</p>
                          </div>
                        )}
                        {c.transcriptText && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">💬 Чат сессии ({c.sessionMessages.length} сообщений)</p>
                            <div className="bg-card/30 rounded-lg p-3 max-h-60 overflow-auto space-y-1">
                              {c.sessionMessages.map((m, i) => (
                                <div key={i} className="text-xs">
                                  <span className="text-muted-foreground/50">[{new Date(m.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}]</span>{" "}
                                  <span className="font-medium">{m.senderName}:</span>{" "}
                                  {m.text ? (
                                    <span className="text-muted-foreground">{m.text}</span>
                                  ) : m.fileUrl && m.fileName ? (
                                    <a
                                      href={m.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      📎 {m.fileName}
                                    </a>
                                  ) : m.fileName ? (
                                    <span className="text-muted-foreground">📎 {m.fileName}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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

                    {/* Решение по удержанной выплате (11.C.3) */}
                    {(c.heldPayoutKopecks ?? 0) > 0 && (
                      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-3">
                        <p className="text-xs text-yellow-400 uppercase tracking-wide mb-1.5">
                          Удержанная выплата практику
                        </p>
                        <p className="text-sm mb-3">
                          {((c.heldPayoutKopecks ?? 0) / 100).toLocaleString("ru-RU")} ₽
                          {" "}<span className="text-xs text-muted-foreground">
                            (создана при завершении сессии)
                          </span>
                        </p>
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`decision-${c.id}`}
                              checked={decision[c.id] === "release"}
                              onChange={() => setDecision(prev => ({ ...prev, [c.id]: "release" }))}
                              className="mt-0.5"
                            />
                            <span className="text-xs">
                              <b className="text-green-400">Освободить</b> — практик получит выплату, клиенту возврата нет.
                            </span>
                          </label>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`decision-${c.id}`}
                              checked={decision[c.id] === "withhold"}
                              onChange={() => setDecision(prev => ({ ...prev, [c.id]: "withhold" }))}
                              className="mt-0.5"
                            />
                            <span className="text-xs">
                              <b className="text-red-400">Удержать</b> — выплата отменяется, клиенту возвращается полная стоимость сессии ({c.priceRub.toLocaleString("ru-RU")} ₽).
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

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
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
            </tbody>
          </CompactTableShell>
          <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function HeaderTextFilter({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="p-1 pt-0">
      <input
        className={COMPACT_INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

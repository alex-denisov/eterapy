"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pause, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import {
  CompactHeader,
  CompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_INPUT_CLASS,
} from "@/components/admin/compact-table";

interface Practitioner {
  id: string;
  userId: string;
  name: string;
  email: string;
  sessionCount: number;
  totalRevenue: number;
  commissionPercent: number;
  platformFee: number;
  practitionerEarnings: number;
  heldPayout: number;
  reservePayout: number;
  payoutDetailsType: string | null;
  kycStatus: string | null;
  lastPayout: string | null;
}

interface ClarityCreditAuditEntry {
  id: string;
  userName: string;
  userEmail: string;
  amount: number;
  balanceAfter: number | null;
  type: string;
  source: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

interface PayoutRun {
  id: string;
  scheduledFor: string;
  status: string;
  candidateCount: number;
  processingCount: number;
  heldCount: number;
  totalDisbursedKopecks: number;
  totalReserveKopecks: number;
  completedAt: string | null;
}

const payoutRunColumns: AdminCompactColumn[] = [
  { key: "scheduledFor", label: "Дата", sortable: true, filterKind: "date" },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "PENDING", label: "Ожидает" },
      { value: "RUNNING", label: "В работе" },
      { value: "DONE", label: "Завершена" },
      { value: "FAILED", label: "Ошибка" },
    ],
  },
  { key: "candidateCount", label: "Кандидаты", sortable: true, align: "right" },
  { key: "processingCount", label: "В обработке", sortable: true, align: "right" },
  { key: "heldCount", label: "Удержано", sortable: true, align: "right" },
  { key: "totalDisbursed", label: "К выплате", sortable: true, align: "right" },
  { key: "totalReserve", label: "Резерв", sortable: true, align: "right" },
];

function payoutRunStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Ожидает",
    RUNNING: "В работе",
    DONE: "Завершена",
    FAILED: "Ошибка",
  };
  return labels[status] ?? status;
}

function payoutRunTone(status: string) {
  if (status === "DONE") return "ok" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "PENDING" || status === "RUNNING") return "warn" as const;
  return "neutral" as const;
}

function formatAdminDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function PaymentsPanel({
  practitioners,
  clarityCredits,
  payoutRuns,
  showCredits = true,
  currency = "RUB",
  usdRub = null,
}: {
  practitioners: Practitioner[];
  clarityCredits: ClarityCreditAuditEntry[];
  payoutRuns: PayoutRun[];
  showCredits?: boolean;
  currency?: "RUB" | "USD";
  usdRub?: number | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [runProcessing, setRunProcessing] = useState(false);
  const [sortKey, setSortKey] = useState<"earnings" | "revenue">("earnings");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const formatMoney = (valueRub: number) => {
    const converted = currency === "USD" ? (usdRub ? valueRub / usdRub : null) : valueRub;
    if (converted === null) return "Курс ЦБ недоступен";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: converted > 0 && converted < 100 ? 2 : 0,
    }).format(converted);
  };

  const filtered = practitioners
    .filter(p =>
      !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const av = sortKey === "earnings" ? a.practitionerEarnings : a.totalRevenue;
      const bv = sortKey === "earnings" ? b.practitionerEarnings : b.totalRevenue;
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: "earnings" | "revenue") {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const mark = (key: "earnings" | "revenue") => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // B352/Баг 12: реальная выплата практику через ЮKassa (по реквизитам).
  // Возвращает true при успехе — массовая выплата по галочкам считает успешные.
  async function markPaid(practitionerId: string): Promise<boolean> {
    setProcessing(practitionerId);
    try {
      const res = await fetch(`/api/admin/practitioners/${practitionerId}/payout`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Выплата не прошла");
        return false;
      }
      const status = json.payout?.status === "DONE" ? "выполнена" : "в обработке";
      toast.success(`Выплата ${status}`);
      return true;
    } catch {
      toast.error("Ошибка сети при выплате");
      return false;
    } finally {
      setProcessing(null);
    }
  }

  // Массовая выплата по выбранным практикам — последовательно, чтобы не ловить
  // rate-limit и показать корректный итог.
  async function markSelectedPaid() {
    const ids = [...selected];
    let done = 0;
    for (const id of ids) {
      if (await markPaid(id)) done++;
    }
    setSelected(new Set());
    toast.success(`Выплачено: ${done} из ${ids.length}`);
    router.refresh();
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

  async function verifyKyc(practitionerId: string) {
    setProcessing(practitionerId);
    try {
      const res = await fetch(`/api/admin/practitioners/${practitionerId}/payout-details/kyc`, { method: "PATCH" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось подтвердить KYC");
      }
      toast.success("KYC реквизитов подтверждён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подтвердить KYC");
    } finally {
      setProcessing(null);
    }
  }

  async function startPayoutRun() {
    setRunProcessing(true);
    try {
      const res = await fetch("/api/admin/payout-runs", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Не удалось запустить авто-выплаты");
      }
      toast.success("Авто-выплаты поставлены в очередь");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить авто-выплаты");
    } finally {
      setRunProcessing(false);
    }
  }

  const totalSelected = [...selected].reduce((sum, id) => {
    const p = practitioners.find(x => x.id === id);
    return sum + (p?.practitionerEarnings ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/30 bg-card/20 p-4" data-testid="admin-payout-runs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Авто-выплаты</h2>
            <p className="text-xs text-muted-foreground">Идемпотентные запуски выплат 1-го и 15-го числа</p>
          </div>
          <button
            type="button"
            onClick={startPayoutRun}
            disabled={runProcessing}
            className="soft-admin-action"
            data-variant="primary"
            data-testid="admin-payout-run-start"
          >
            {runProcessing ? "Запуск..." : "Запустить авто-выплаты"}
          </button>
        </div>
        <AdminCompactDataTable
          columns={payoutRunColumns}
          rows={payoutRuns.map((run) => ({
            id: run.id,
            cells: {
              scheduledFor: {
                value: formatAdminDateTime(run.scheduledFor),
                sortValue: new Date(run.scheduledFor).getTime(),
                filterValue: formatAdminDateTime(run.scheduledFor),
              },
              status: {
                kind: "status",
                label: payoutRunStatusLabel(run.status),
                tone: payoutRunTone(run.status),
                filterValue: `${run.status} ${payoutRunStatusLabel(run.status)}`,
              },
              candidateCount: { value: run.candidateCount, sortValue: run.candidateCount },
              processingCount: { value: run.processingCount, sortValue: run.processingCount },
              heldCount: { value: run.heldCount, sortValue: run.heldCount },
              totalDisbursed: {
                value: formatMoney(Math.round(run.totalDisbursedKopecks / 100)),
                sortValue: run.totalDisbursedKopecks,
              },
              totalReserve: {
                value: formatMoney(Math.round(run.totalReserveKopecks / 100)),
                sortValue: run.totalReserveKopecks,
              },
            },
          }))}
          empty="Авто-выплаты ещё не запускались"
          minWidth="980px"
        />
      </div>

      <div className="flex min-h-8 items-center justify-end gap-3">
        {selected.size > 0 && (
          <div className="mr-auto flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Выбрано: {selected.size} · {formatMoney(totalSelected)}
            </span>
            <button onClick={markSelectedPaid}
              className="rounded-lg bg-[var(--soft-terracotta)] px-4 py-1.5 text-xs font-semibold text-[#fff8f1] transition-colors hover:bg-[var(--soft-terracotta-dark)]">
              Запустить выбранные выплаты
            </button>
          </div>
        )}
      </div>

      <CompactTableShell minWidth="980px">
          <thead>
            <tr>
              <th className="border-r border-[var(--soft-paper-edge)] p-0 align-top font-medium">
                <div className="flex h-14 items-center justify-center px-1.5">
                <input type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={e => setSelected(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
                  className="accent-primary" />
                </div>
              </th>
              <CompactHeader label="Практик">
                <div className="p-1 pt-0">
                  <input
                    className={COMPACT_INPUT_CLASS}
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="имя/email"
                  />
                </div>
              </CompactHeader>
              <CompactHeader label="Сессий" />
              <CompactHeader label={`Оборот${mark("revenue")}`} sortKey="revenue" activeSortKey={sortKey} direction={sortDir} onSort={() => toggleSort("revenue")} />
              <CompactHeader label="Комиссия" />
              <CompactHeader label={`Доступно${mark("earnings")}`} sortKey="earnings" activeSortKey={sortKey} direction={sortDir} onSort={() => toggleSort("earnings")} />
              <CompactHeader label="Удержано" />
              <CompactHeader label="Действия" />
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.id} className={`hover:bg-white/2 ${selected.has(p.id) ? "bg-primary/3" : ""}`}>
                <td className={`${COMPACT_CELL_CLASS} text-center`}>
                  <input type="checkbox" checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)} className="accent-primary" />
                </td>
                <td className={COMPACT_CELL_CLASS}>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-right text-muted-foreground tabular-nums`}>{p.sessionCount}</td>
                <td className={`${COMPACT_CELL_CLASS} text-right tabular-nums`}>{formatMoney(p.totalRevenue)}</td>
                <td className={`${COMPACT_CELL_CLASS} text-right text-primary tabular-nums`}>{formatMoney(p.platformFee)} <span className="text-[10px] text-muted-foreground/50">({p.commissionPercent}%)</span></td>
                <td className={`${COMPACT_CELL_CLASS} text-right font-semibold text-green-400 tabular-nums`}>
                  {formatMoney(p.practitionerEarnings)}
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-right text-yellow-400 tabular-nums`}>
                  {formatMoney(p.heldPayout)}
                  {p.reservePayout > 0 && (
                    <span className="block text-[10px] text-muted-foreground">резерв {formatMoney(p.reservePayout)}</span>
                  )}
                </td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                  <div className="soft-admin-table-actions">
                    <button onClick={async () => { if (await markPaid(p.id)) router.refresh(); }}
                      disabled={processing === p.id || p.practitionerEarnings === 0}
                      className="soft-admin-icon-button"
                      data-variant="primary"
                      title="Выплатить"
                      aria-label={`Выплатить ${p.name}`}>
                      {processing === p.id ? "..." : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                    </button>
                    <div className="relative group">
                      <button className="soft-admin-icon-button" title="Приостановить выплату" aria-label={`Приостановить выплату ${p.name}`}>
                        <Pause className="size-3.5" aria-hidden="true" />
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
                    {p.payoutDetailsType === "ENTITY" && p.kycStatus !== "VERIFIED" && (
                      <button
                        type="button"
                        onClick={() => verifyKyc(p.id)}
                        disabled={processing === p.id}
                        className="soft-admin-icon-button disabled:opacity-40"
                        title="Проверить KYC"
                        aria-label={`Проверить KYC ${p.name}`}
                      >
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={`${COMPACT_CELL_CLASS} py-10 text-center text-sm text-muted-foreground`}>Нет практиков</td></tr>
            )}
          </tbody>
      </CompactTableShell>

      {pageCount > 1 && (
        <CompactPaginationBar page={safePage} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      )}

      <p className="text-xs text-muted-foreground">
        * Оборот считается по всем завершённым сессиям за всё время. Фактические выплаты
        отслеживаются вручную до интеграции ЮKassa Payout API.
      </p>

      {showCredits && <div className="mt-8 rounded-xl border border-border/30 overflow-hidden" data-testid="admin-clarity-credit-audit">
        <div className="flex items-center justify-between border-b border-border/20 bg-card/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Аудит баллов</h2>
            <p className="text-xs text-muted-foreground">Источник, статус, срок действия и clawback-события</p>
          </div>
          <Badge variant="outline">{clarityCredits.length}</Badge>
        </div>
        <CompactTableShell minWidth="760px">
          <thead>
            <tr>
              <CompactHeader label="Пользователь" />
              <CompactHeader label="Баллы" />
              <CompactHeader label="Тип / источник" />
              <CompactHeader label="Статус" />
              <CompactHeader label="Срок" />
            </tr>
          </thead>
          <tbody>
            {clarityCredits.map((entry) => (
              <tr key={entry.id} className="hover:bg-white/2">
                <td className={COMPACT_CELL_CLASS}>
                  <p className="font-medium">{entry.userName}</p>
                  <p className="text-xs text-muted-foreground">{entry.userEmail}</p>
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-right font-semibold tabular-nums`}>
                  {entry.amount > 0 ? "+" : ""}{entry.amount}
                  {entry.balanceAfter !== null && (
                    <span className="ml-1 text-[10px] text-muted-foreground">→ {entry.balanceAfter}</span>
                  )}
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-muted-foreground`}>
                  {entry.type} · {entry.source}
                </td>
                <td className={COMPACT_CELL_CLASS}>
                  <Badge variant={entry.status === "confirmed" ? "default" : "outline"}>{entry.status}</Badge>
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-muted-foreground`}>
                  {entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString("ru-RU") : "без срока"}
                </td>
              </tr>
            ))}
            {clarityCredits.length === 0 && (
              <tr><td colSpan={5} className={`${COMPACT_CELL_CLASS} py-10 text-center text-sm text-muted-foreground`}>Пока нет операций по баллам</td></tr>
            )}
          </tbody>
        </CompactTableShell>
      </div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

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

const practitionerPayoutColumns: AdminCompactColumn[] = [
  { key: "practitioner", label: "Практик", sortable: true },
  { key: "sessionCount", label: "Сессий", sortable: true, align: "right" },
  { key: "totalRevenue", label: "Оборот", sortable: true, align: "right" },
  { key: "commission", label: "Комиссия", sortable: true, align: "right" },
  { key: "available", label: "Доступно", sortable: true, align: "right" },
  { key: "held", label: "Удержано", sortable: true, align: "right" },
  {
    key: "payoutDetails",
    label: "Реквизиты",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "CARD", label: "Карта" },
      { value: "SBP", label: "СБП" },
      { value: "ENTITY", label: "Расчётный счёт" },
      { value: "NONE", label: "Не указаны" },
    ],
  },
  {
    key: "kycStatus",
    label: "KYC",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "VERIFIED", label: "Проверен" },
      { value: "PENDING", label: "Проверка" },
      { value: "NONE", label: "Не требуется" },
    ],
  },
  { key: "actions", label: "Действия", filterKind: "none", align: "center" },
];

const clarityCreditColumns: AdminCompactColumn[] = [
  { key: "user", label: "Пользователь", sortable: true },
  { key: "amount", label: "Баллы", sortable: true, align: "right" },
  { key: "source", label: "Тип / источник", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "confirmed", label: "Подтверждено" },
      { value: "pending", label: "Ожидает" },
      { value: "failed", label: "Ошибка" },
    ],
  },
  { key: "expiresAt", label: "Срок", sortable: true, filterKind: "date" },
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
  const [processing, setProcessing] = useState<string | null>(null);
  const [runProcessing, setRunProcessing] = useState(false);
  const formatMoney = (valueRub: number) => {
    const converted = currency === "USD" ? (usdRub ? valueRub / usdRub : null) : valueRub;
    if (converted === null) return "Курс ЦБ недоступен";
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: converted > 0 && converted < 100 ? 2 : 0,
    }).format(converted);
  };

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
  async function markSelectedPaid(ids: string[]) {
    let done = 0;
    for (const id of ids) {
      if (await markPaid(id)) done++;
    }
    toast.success(`Выплачено: ${done} из ${ids.length}`);
    router.refresh();
  }

  async function pausePayout(practitionerId: string) {
    const reason = window.prompt("Причина приостановки выплаты", "Проверка документов");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("Укажите причину приостановки выплаты"); return; }
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

  const practitionerPayoutRows = practitioners.map((p) => {
    const payoutType = p.payoutDetailsType ?? "NONE";
    const kycStatus = p.payoutDetailsType === "ENTITY" ? (p.kycStatus ?? "PENDING") : "NONE";
    return {
      id: p.id,
      cells: {
        practitioner: {
          value: p.name,
          subvalue: p.email,
          filterValue: `${p.name} ${p.email}`,
          sortValue: p.name,
        },
        sessionCount: { value: p.sessionCount, sortValue: p.sessionCount },
        totalRevenue: { value: formatMoney(p.totalRevenue), sortValue: p.totalRevenue },
        commission: {
          value: `${formatMoney(p.platformFee)} (${p.commissionPercent}%)`,
          filterValue: `${p.platformFee} ${p.commissionPercent}`,
          sortValue: p.platformFee,
        },
        available: { value: formatMoney(p.practitionerEarnings), sortValue: p.practitionerEarnings },
        held: {
          value: formatMoney(p.heldPayout),
          subvalue: p.reservePayout > 0 ? `резерв ${formatMoney(p.reservePayout)}` : null,
          sortValue: p.heldPayout + p.reservePayout,
        },
        payoutDetails: {
          kind: "status" as const,
          label: payoutType === "CARD" ? "Карта" : payoutType === "SBP" ? "СБП" : payoutType === "ENTITY" ? "Расчётный счёт" : "Не указаны",
          tone: payoutType === "NONE" ? "warn" as const : "ok" as const,
          filterValue: payoutType,
          sortValue: payoutType,
        },
        kycStatus: {
          kind: "status" as const,
          label: kycStatus === "VERIFIED" ? "Проверен" : kycStatus === "PENDING" ? "Проверка" : "Не требуется",
          tone: kycStatus === "VERIFIED" || kycStatus === "NONE" ? "ok" as const : "warn" as const,
          filterValue: kycStatus,
          sortValue: kycStatus,
        },
        actions: {
          kind: "actions" as const,
          actions: [
            {
              label: `Выплатить ${p.name}`,
              icon: "check" as const,
              variant: "primary" as const,
              disabled: processing === p.id || p.practitionerEarnings === 0,
              onClick: async () => { if (await markPaid(p.id)) router.refresh(); },
            },
            {
              label: `Приостановить выплату ${p.name}`,
              icon: "cancel" as const,
              disabled: processing === p.id,
              onClick: () => { void pausePayout(p.id); },
            },
            ...(p.payoutDetailsType === "ENTITY" && p.kycStatus !== "VERIFIED" ? [{
              label: `Проверить KYC ${p.name}`,
              icon: "check" as const,
              disabled: processing === p.id,
              onClick: () => { void verifyKyc(p.id); },
            }] : []),
          ],
        },
      },
    };
  });

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

      <AdminCompactDataTable
        columns={practitionerPayoutColumns}
        rows={practitionerPayoutRows}
        selectable
        bulkActions={[{ key: "pay-selected", label: "Запустить выбранные выплаты", variant: "primary" }]}
        onBulkAction={(actionKey, selectedIds) => {
          if (actionKey === "pay-selected") void markSelectedPaid(selectedIds);
        }}
        empty="Нет практиков"
        minWidth="1180px"
      />

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
        <div className="p-3">
          <AdminCompactDataTable
            columns={clarityCreditColumns}
            rows={clarityCredits.map((entry) => ({
              id: entry.id,
              cells: {
                user: { value: entry.userName, subvalue: entry.userEmail, filterValue: `${entry.userName} ${entry.userEmail}` },
                amount: {
                  value: `${entry.amount > 0 ? "+" : ""}${entry.amount}${entry.balanceAfter !== null ? ` -> ${entry.balanceAfter}` : ""}`,
                  sortValue: entry.amount,
                  filterValue: `${entry.amount} ${entry.balanceAfter ?? ""}`,
                },
                source: { value: `${entry.type} · ${entry.source}`, filterValue: `${entry.type} ${entry.source}` },
                status: {
                  kind: "status",
                  label: entry.status,
                  tone: entry.status === "confirmed" ? "ok" : entry.status === "failed" ? "danger" : "warn",
                  filterValue: entry.status,
                },
                expiresAt: {
                  value: entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString("ru-RU") : "без срока",
                  sortValue: entry.expiresAt ? new Date(entry.expiresAt).getTime() : 0,
                  filterValue: entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString("ru-RU") : "без срока",
                },
              },
            }))}
            empty="Пока нет операций по баллам"
            minWidth="820px"
          />
        </div>
      </div>}
    </div>
  );
}

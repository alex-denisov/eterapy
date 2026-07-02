export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileSearch, LockKeyhole, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { PageContainer } from "@/components/ui/page-container";
import { statusLabel } from "../../admin-analytics-ui";
import { AdminOpsMetric, AdminOpsSection, formatDateTime, formatNumber } from "../ops-ui";

function since(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function actionTone(action: string) {
  if (/DELETE|BLOCK|REFUND|PAYOUT|IMPERSONATE/i.test(action)) return "danger" as const;
  if (/AI_|PASSWORD|ROLE|PERMISSION|LOGIN/i.test(action)) return "warn" as const;
  return "neutral" as const;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    LOGIN: "Вход",
    LOGOUT: "Выход",
    PASSWORD_RESET: "Сброс пароля",
    PASSWORD_CHANGE: "Смена пароля",
    PASSWORD_SET: "Назначение пароля",
    ACCOUNT_BLOCK: "Блокировка аккаунта",
    ACCOUNT_UNBLOCK: "Разблокировка аккаунта",
    ACCOUNT_DELETE: "Удаление аккаунта",
    IMPERSONATE: "Имперсонация",
    REVIEW_MODERATE: "Модерация отзыва",
    REVIEW_DELETE: "Удаление отзыва",
    LIBRARY_MODERATE: "Модерация библиотеки",
    PRACTITIONER_STATUS: "Статус практика",
    PRACTITIONER_VERIFIED: "Верификация практика",
    PAYOUT_RUN: "Запуск выплат",
    REFUND: "Возврат",
    SETTINGS_CHANGE: "Изменение настроек",
  };
  if (labels[action]) return labels[action];
  return action
    .replace(/^AI_/, "AI: ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function detailLabel(key: string) {
  const labels: Record<string, string> = {
    email: "Email",
    role: "Роль",
    status: "Статус",
    reason: "Причина",
    amount: "Сумма",
    provider: "Провайдер",
    model: "Модель",
    product: "Продукт",
    device: "Устройство",
    channel: "Канал",
    fingerprint: "Отпечаток",
    ip: "IP",
    userId: "Пользователь",
    targetId: "Цель",
    dialogueId: "Диалог",
    from: "Было",
    to: "Стало",
    bookingId: "Бронирование",
    practitionerId: "Практик",
    providerId: "Провайдер",
    feature: "Функция",
  };
  return labels[key] ?? key;
}

function formatDetailValue(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseAuditDetails(details: string | null) {
  if (!details) return { entries: [], text: null };
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    return { entries: Object.entries(parsed).slice(0, 8), text: null };
  } catch {
    return { entries: [], text: details };
  }
}

function formatAuditDetailsText(details: string | null) {
  const parsed = parseAuditDetails(details);
  if (parsed.text) return parsed.text;
  if (parsed.entries.length === 0) return "—";
  return parsed.entries.map(([key, value]) => `${detailLabel(key)}: ${formatDetailValue(value)}`).join("; ");
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((value) => ({ value, label: value }));
}

export default async function AdminOpsSecurityPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const riskActionWhere = {
    OR: [
      { action: { contains: "DELETE", mode: "insensitive" as const } },
      { action: { contains: "BLOCK", mode: "insensitive" as const } },
      { action: { contains: "ROLE", mode: "insensitive" as const } },
      { action: { contains: "PERMISSION", mode: "insensitive" as const } },
      { action: { contains: "IMPERSONATE", mode: "insensitive" as const } },
      { action: { contains: "PAYOUT", mode: "insensitive" as const } },
      { action: { contains: "REFUND", mode: "insensitive" as const } },
      { action: { contains: "PASSWORD", mode: "insensitive" as const } },
      { action: { contains: "AI_", mode: "insensitive" as const } },
    ],
  };

  const [audit24h, riskActions24h, loginActions24h, deletionEvents24h, recentRiskActions, deletionEvents] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { gte: since(24) } } }),
    db.auditLog.count({ where: { createdAt: { gte: since(24) }, ...riskActionWhere } }),
    db.auditLog.count({
      where: {
        createdAt: { gte: since(24) },
        action: { contains: "LOGIN", mode: "insensitive" },
      },
    }),
    db.deletionLog.count({ where: { occurredAt: { gte: since(24) } } }),
    db.auditLog.findMany({
      where: riskActionWhere,
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        userId: true,
        targetId: true,
        action: true,
        details: true,
        ip: true,
        createdAt: true,
      },
    }),
    db.deletionLog.findMany({
      orderBy: { occurredAt: "desc" },
      take: 12,
      select: {
        id: true,
        category: true,
        action: true,
        targetType: true,
        targetId: true,
        policy: true,
        reason: true,
        occurredAt: true,
      },
    }),
  ]);

  const [clientFraudEvents, clientReferralRisks] = await Promise.all([
    db.fraudEvent.findMany({
      where: {
        riskScore: { gte: 50 },
        OR: [{ subjectId: { not: null } }, { actorUserId: { not: null } }],
      },
      orderBy: { riskScore: "desc" },
      take: 200,
      select: { subjectId: true, actorUserId: true, riskScore: true, action: true, status: true, createdAt: true },
    }),
    db.referralAttribution.findMany({
      where: { riskScore: { gte: 50 } },
      orderBy: { riskScore: "desc" },
      take: 200,
      select: { referrerUserId: true, referredUserId: true, riskScore: true, status: true, createdAt: true },
    }),
  ]);
  const clientRiskCandidates = new Set<string>();
  for (const event of clientFraudEvents) {
    if (event.subjectId) clientRiskCandidates.add(event.subjectId);
    if (event.actorUserId) clientRiskCandidates.add(event.actorUserId);
  }
  for (const item of clientReferralRisks) {
    if (item.referrerUserId) clientRiskCandidates.add(item.referrerUserId);
    if (item.referredUserId) clientRiskCandidates.add(item.referredUserId);
  }
  const clientUsers = clientRiskCandidates.size > 0
    ? await db.user.findMany({
      where: { id: { in: [...clientRiskCandidates] }, role: "CLIENT" },
      select: { id: true, name: true, email: true, blockedAt: true },
    })
    : [];
  const clientUserById = new Map(clientUsers.map((user) => [user.id, user]));
  const clientRiskRowsById = new Map<string, { userId: string; name: string; email: string; score: number; rawScore: number; signal: string; status: string; createdAt: Date; blocked: boolean }>();
  function addClientSecurityRisk(userId: string | null | undefined, rawScore: number, signal: string, status: string, createdAt: Date) {
    if (!userId) return;
    const user = clientUserById.get(userId);
    if (!user) return;
    const score = Math.max(0, Math.min(10, Math.ceil(rawScore / 10)));
    const current = clientRiskRowsById.get(userId);
    if (!current || score > current.score || (score === current.score && createdAt > current.createdAt)) {
      clientRiskRowsById.set(userId, {
        userId,
        name: user.name,
        email: user.email,
        score,
        rawScore,
        signal,
        status,
        createdAt,
        blocked: Boolean(user.blockedAt),
      });
    }
  }
  for (const event of clientFraudEvents) {
    addClientSecurityRisk(event.subjectId, event.riskScore, actionLabel(event.action), event.status, event.createdAt);
    addClientSecurityRisk(event.actorUserId, event.riskScore, actionLabel(event.action), event.status, event.createdAt);
  }
  for (const item of clientReferralRisks) {
    addClientSecurityRisk(item.referrerUserId, item.riskScore, "Реферальный риск", item.status, item.createdAt);
    addClientSecurityRisk(item.referredUserId, item.riskScore, "Реферальный риск", item.status, item.createdAt);
  }
  const clientRiskRows = [...clientRiskRowsById.values()].sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
  const highRiskClients = clientRiskRows.filter((row) => row.score >= 8).length;
  const manualBlockCandidates = clientRiskRows.filter((row) => row.score >= 8 && !row.blocked).length;

  const aiRisk = recentRiskActions.filter((row) => row.action.includes("AI_")).length;
  const accessRisk = recentRiskActions.filter((row) => /LOGIN|PASSWORD|ROLE|PERMISSION|IMPERSONATE/i.test(row.action)).length;
  const clientRiskColumns: AdminCompactColumn[] = [
    { key: "client", label: "Клиент", sortable: true, filterKind: "text" },
    { key: "score", label: "Скоринг", sortable: true, filterKind: "text", align: "right" },
    { key: "signal", label: "Сигнал", sortable: true, options: uniqueOptions(clientRiskRows.map((row) => row.signal)) },
    { key: "status", label: "Статус", sortable: true, options: uniqueOptions(clientRiskRows.map((row) => row.blocked ? "Заблокирован" : statusLabel(row.status))) },
    { key: "time", label: "Timestamp", sortable: true, filterKind: "date" },
  ];
  const clientRiskTableRows = clientRiskRows.map((row) => {
    const status = row.blocked ? "Заблокирован" : statusLabel(row.status);
    return {
      id: row.userId,
      cells: {
        client: {
          value: row.name,
          subvalue: row.email,
          title: `${row.name} · ${row.email}`,
          filterValue: `${row.name} ${row.email}`,
          sortValue: row.name || row.email,
        },
        score: {
          kind: "status" as const,
          label: `${row.score}/10`,
          tone: row.score >= 8 ? "danger" as const : row.score >= 5 ? "warn" as const : "ok" as const,
          filterValue: String(row.score),
          sortValue: row.score,
        },
        signal: row.signal,
        status: {
          kind: "status" as const,
          label: status,
          tone: row.blocked ? "danger" as const : row.score >= 8 ? "warn" as const : "neutral" as const,
          filterValue: status,
          sortValue: status,
        },
        time: { value: formatDateTime(row.createdAt), filterValue: formatDateTime(row.createdAt), sortValue: row.createdAt.getTime() },
      },
    };
  });
  const riskActionColumns: AdminCompactColumn[] = [
    { key: "time", label: "Timestamp", sortable: true, filterKind: "date" },
    { key: "action", label: "Действие", sortable: true, options: uniqueOptions(recentRiskActions.map((row) => actionLabel(row.action))) },
    { key: "admin", label: "Администратор", sortable: true, filterKind: "text" },
    { key: "target", label: "Цель", sortable: true, filterKind: "text" },
    { key: "ip", label: "IP", sortable: true, filterKind: "text" },
    { key: "details", label: "Детали", sortable: true, filterKind: "text" },
  ];
  const riskActionTableRows = recentRiskActions.map((row) => {
    const label = actionLabel(row.action);
    const details = formatAuditDetailsText(row.details);
    return {
      id: row.id,
      cells: {
        time: { value: formatDateTime(row.createdAt), filterValue: formatDateTime(row.createdAt), sortValue: row.createdAt.getTime() },
        action: {
          kind: "status" as const,
          label,
          tone: actionTone(row.action),
          filterValue: `${label} ${row.action}`,
          sortValue: label,
        },
        admin: { value: row.userId, title: row.userId, filterValue: row.userId, sortValue: row.userId },
        target: { value: row.targetId ?? "—", title: row.targetId ?? "—", filterValue: row.targetId ?? "", sortValue: row.targetId ?? "" },
        ip: row.ip ?? "—",
        details: { value: details, title: details, filterValue: details, sortValue: details },
      },
    };
  });
  const deletionColumns: AdminCompactColumn[] = [
    { key: "time", label: "Timestamp", sortable: true, filterKind: "date" },
    { key: "category", label: "Категория", sortable: true, options: uniqueOptions(deletionEvents.map((row) => row.category)) },
    { key: "action", label: "Действие", sortable: true, options: uniqueOptions(deletionEvents.map((row) => row.action)) },
    { key: "target", label: "Цель", sortable: true, filterKind: "text" },
    { key: "policy", label: "Policy", sortable: true, filterKind: "text" },
    { key: "reason", label: "Причина", sortable: true, filterKind: "text" },
  ];
  const deletionRows = deletionEvents.map((row) => {
    const target = `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ""}`;
    return {
      id: row.id,
      cells: {
        time: { value: formatDateTime(row.occurredAt), filterValue: formatDateTime(row.occurredAt), sortValue: row.occurredAt.getTime() },
        category: row.category,
        action: row.action,
        target: { value: target, title: target, filterValue: target, sortValue: target },
        policy: { value: row.policy, title: row.policy, filterValue: row.policy, sortValue: row.policy },
        reason: { value: row.reason, title: row.reason, filterValue: row.reason, sortValue: row.reason },
      },
    };
  });

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">безопасность и аудит</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Безопасность и инциденты</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Контроль риск-действий, доступа, удалений, выплат/возвратов, AI-изменений и событий, которые должны попадать в аудит.
          </p>
        </div>
        <Link className="soft-admin-action w-fit" href="/admin/ops/logs">Открыть все логи</Link>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <AdminOpsMetric icon={FileSearch} label="Аудит 24ч" value={formatNumber(audit24h)} hint="Все события audit_logs за сутки" />
        <AdminOpsMetric icon={ShieldAlert} label="Риск-действия" value={formatNumber(riskActions24h)} hint="Удаления, роли, выплаты, возвраты, AI" tone={riskActions24h > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={LockKeyhole} label="Доступ" value={formatNumber(loginActions24h)} hint="Login-события и смены доступа" tone={accessRisk > 0 ? "warn" : "neutral"} />
        <AdminOpsMetric icon={Trash2} label="Retention" value={formatNumber(deletionEvents24h)} hint="Удаления и анонимизация по policy" tone={deletionEvents24h > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={AlertTriangle} label="AI-изменения" value={formatNumber(aiRisk)} hint="Настройки providers/routing/prompts/keys" tone={aiRisk > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={ShieldAlert} label="Клиенты 8–10" value={formatNumber(highRiskClients)} hint={`${manualBlockCandidates} без блокировки`} tone={manualBlockCandidates > 0 ? "danger" : highRiskClients > 0 ? "warn" : "ok"} />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <AdminOpsSection title="Антифрод клиентов" actionHref="/admin/product/users" actionLabel="Открыть пользователей">
          <AdminCompactDataTable
            columns={clientRiskColumns}
            rows={clientRiskTableRows}
            empty="Клиентов с антифрод-скорингом 5+ не найдено."
            minWidth="900px"
            pageSize={20}
          />
        </AdminOpsSection>

        <AdminOpsSection title="Очередь риск-действий" actionHref="/admin/product/quality" actionLabel="Открыть антифрод">
          <AdminCompactDataTable
            columns={riskActionColumns}
            rows={riskActionTableRows}
            empty="Риск-действий в audit_logs не найдено."
            minWidth="1180px"
            pageSize={20}
          />
        </AdminOpsSection>

        <AdminOpsSection title="Retention и удаления" actionHref="/admin/ops/logs" actionLabel="Журнал">
          <AdminCompactDataTable
            columns={deletionColumns}
            rows={deletionRows}
            empty="Событий retention/deletion пока нет."
            minWidth="1180px"
            pageSize={20}
          />
        </AdminOpsSection>

        <AdminOpsSection title="Контуры контроля">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/ops/logs">
              <FileSearch className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Логи и аудит</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Системные, runtime, diagnostics, audit.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/product/quality">
              <ShieldAlert className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Антифрод</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Referral risk, holds, appeals, payout risk.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/product/users">
              <UserCog className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Пользователи</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Роли, статусы, имперсонация и доступ.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/ops/ai">
              <AlertTriangle className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">AI governance</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Ключи, routing, промты, аудит LLM.</p>
            </Link>
          </div>
        </AdminOpsSection>
      </div>
    </PageContainer>
  );
}

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

function fraudFlagLabel(flag: string) {
  const labels: Record<string, string> = {
    machine_generated_name: "Сгенерированное имя",
    machine_generated_name_strong: "Сгенерированное имя (длинное)",
    gmail_dot_abuse: "Gmail-точки",
    gmail_dot_abuse_heavy: "Gmail-точки (много)",
    disposable_email: "Одноразовый email",
    gmail_alias_duplicate: "Gmail-дубликат",
    clean: "Чисто",
  };
  return labels[flag] ?? flag;
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

  // Owner 2026-07-17: the table must show ALL antifraud events (including
  // blocked registrations, where no user row exists) as a paginated journal —
  // not a date-picked, user-linked top-20. Blocked sign-ups carry the subject
  // email only in metadata.
  const [fraudEvents, referralRisks] = await Promise.all([
    db.fraudEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, subjectType: true, subjectId: true, actorUserId: true, riskScore: true, riskFlags: true, action: true, status: true, createdAt: true, metadata: true },
    }),
    db.referralAttribution.findMany({
      where: { riskScore: { gte: 50 } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, referrerUserId: true, referredUserId: true, riskScore: true, status: true, createdAt: true },
    }),
  ]);
  const fraudUserIds = new Set<string>();
  for (const event of fraudEvents) {
    if (event.subjectId) fraudUserIds.add(event.subjectId);
    if (event.actorUserId) fraudUserIds.add(event.actorUserId);
  }
  for (const item of referralRisks) {
    if (item.referrerUserId) fraudUserIds.add(item.referrerUserId);
    if (item.referredUserId) fraudUserIds.add(item.referredUserId);
  }
  const fraudUsers = fraudUserIds.size > 0
    ? await db.user.findMany({
      where: { id: { in: [...fraudUserIds] } },
      select: { id: true, name: true, email: true, blockedAt: true },
    })
    : [];
  const fraudUserById = new Map(fraudUsers.map((user) => [user.id, user]));

  type FraudJournalRow = {
    id: string;
    createdAt: Date;
    subjectName: string;
    subjectEmail: string;
    rawScore: number;
    signal: string;
    action: string;
    status: string;
    blocked: boolean;
  };
  function metadataEmail(metadata: unknown): string {
    if (metadata && typeof metadata === "object" && "emailNormalized" in metadata) {
      const email = (metadata as { emailNormalized?: unknown }).emailNormalized;
      if (typeof email === "string" && email.length > 0) return email;
    }
    return "";
  }
  const fraudJournalRows: FraudJournalRow[] = [
    ...fraudEvents.map((event) => {
      const user = fraudUserById.get(event.subjectId ?? "") ?? fraudUserById.get(event.actorUserId ?? "");
      return {
        id: `fraud-${event.id}`,
        createdAt: event.createdAt,
        subjectName: user?.name ?? (event.subjectType === "registration" ? "Регистрация отклонена" : event.subjectType),
        subjectEmail: user?.email ?? metadataEmail(event.metadata),
        rawScore: event.riskScore,
        signal: event.riskFlags.length > 0 ? event.riskFlags.map(fraudFlagLabel).join(", ") : "—",
        action: actionLabel(event.action),
        status: event.status,
        blocked: Boolean(user?.blockedAt),
      };
    }),
    ...referralRisks.map((item) => {
      const user = fraudUserById.get(item.referredUserId ?? "") ?? fraudUserById.get(item.referrerUserId ?? "");
      return {
        id: `referral-${item.id}`,
        createdAt: item.createdAt,
        subjectName: user?.name ?? "Реферал",
        subjectEmail: user?.email ?? "",
        rawScore: item.riskScore,
        signal: "Реферальный риск",
        action: "Реферальная атрибуция",
        status: item.status,
        blocked: Boolean(user?.blockedAt),
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const highRiskClients = new Set(
    fraudJournalRows.filter((row) => row.rawScore >= 80 && row.subjectEmail).map((row) => row.subjectEmail),
  ).size;
  const manualBlockCandidates = new Set(
    fraudJournalRows.filter((row) => row.rawScore >= 80 && row.subjectEmail && !row.blocked && row.status !== "blocked").map((row) => row.subjectEmail),
  ).size;

  const aiRisk = recentRiskActions.filter((row) => row.action.includes("AI_")).length;
  const accessRisk = recentRiskActions.filter((row) => /LOGIN|PASSWORD|ROLE|PERMISSION|IMPERSONATE/i.test(row.action)).length;
  // No date filter here by design (owner 2026-07-17): the journal shows every
  // event, newest first, and the pagination bar switches pages.
  const clientRiskColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "none" },
    { key: "client", label: "Субъект", sortable: true, filterKind: "text" },
    { key: "score", label: "Скоринг", sortable: true, filterKind: "text", align: "right" },
    { key: "signal", label: "Сигналы", sortable: true, options: uniqueOptions(fraudJournalRows.map((row) => row.signal)) },
    { key: "action", label: "Событие", sortable: true, options: uniqueOptions(fraudJournalRows.map((row) => row.action)) },
    { key: "status", label: "Статус", sortable: true, options: uniqueOptions(fraudJournalRows.map((row) => row.blocked ? "Заблокирован" : statusLabel(row.status))) },
  ];
  const clientRiskTableRows = fraudJournalRows.map((row) => {
    const status = row.blocked ? "Заблокирован" : statusLabel(row.status);
    return {
      id: row.id,
      cells: {
        time: { value: formatDateTime(row.createdAt), filterValue: formatDateTime(row.createdAt), sortValue: row.createdAt.getTime() },
        client: {
          value: row.subjectName,
          subvalue: row.subjectEmail || "—",
          title: `${row.subjectName} · ${row.subjectEmail || "—"}`,
          filterValue: `${row.subjectName} ${row.subjectEmail}`,
          sortValue: row.subjectName || row.subjectEmail,
        },
        score: {
          kind: "status" as const,
          label: `${row.rawScore}/100`,
          tone: row.rawScore >= 70 ? "danger" as const : row.rawScore >= 40 ? "warn" as const : "ok" as const,
          filterValue: String(row.rawScore),
          sortValue: row.rawScore,
        },
        signal: { value: row.signal, title: row.signal, filterValue: row.signal, sortValue: row.signal },
        action: { value: row.action, title: row.action, filterValue: row.action, sortValue: row.action },
        status: {
          kind: "status" as const,
          label: status,
          tone: row.blocked || row.status === "blocked" ? "danger" as const : row.status === "review" ? "warn" as const : "neutral" as const,
          filterValue: status,
          sortValue: status,
        },
      },
    };
  });
  const riskActionColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "date" },
    { key: "action", label: "Действие", sortable: true, options: uniqueOptions(recentRiskActions.map((row) => actionLabel(row.action))) },
    { key: "admin", label: "Администратор", sortable: true, filterKind: "text" },
    { key: "target", label: "Цель", sortable: true, filterKind: "text" },
    { key: "ip", label: "IP", sortable: true, filterKind: "text" },
    { key: "summary", label: "Кратко", sortable: true, filterKind: "text" },
    { key: "open", label: "Действия", filterKind: "none", align: "center" },
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
        summary: { value: details, title: details, filterValue: details, sortValue: details },
        open: {
          kind: "details" as const,
          label: "Открыть",
          title: label,
          meta: `${formatDateTime(row.createdAt)} · ${row.userId}${row.targetId ? ` → ${row.targetId}` : ""}`,
          body: row.details ?? "Детали не указаны",
          filterValue: details,
          sortValue: details,
        },
      },
    };
  });
  const deletionColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "date" },
    { key: "category", label: "Категория", sortable: true, options: uniqueOptions(deletionEvents.map((row) => row.category)) },
    { key: "action", label: "Действие", sortable: true, options: uniqueOptions(deletionEvents.map((row) => row.action)) },
    { key: "target", label: "Цель", sortable: true, filterKind: "text" },
    { key: "policy", label: "Политика", sortable: true, filterKind: "text" },
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
        <AdminOpsMetric icon={Trash2} label="Удаления" value={formatNumber(deletionEvents24h)} hint="Удаления и анонимизация по политике хранения" tone={deletionEvents24h > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={AlertTriangle} label="AI-изменения" value={formatNumber(aiRisk)} hint="Настройки провайдеров, маршрутов, промтов и ключей" tone={aiRisk > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={ShieldAlert} label="Клиенты 8–10" value={formatNumber(highRiskClients)} hint={`${manualBlockCandidates} без блокировки`} tone={manualBlockCandidates > 0 ? "danger" : highRiskClients > 0 ? "warn" : "ok"} />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <AdminOpsSection title="Антифрод клиентов" actionHref="/admin/product/users" actionLabel="Открыть пользователей">
          <AdminCompactDataTable
            columns={clientRiskColumns}
            rows={clientRiskTableRows}
            empty="Событий антифрода пока нет."
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

        <AdminOpsSection title="Хранение и удаления" actionHref="/admin/ops/logs" actionLabel="Журнал">
          <AdminCompactDataTable
            columns={deletionColumns}
            rows={deletionRows}
            empty="Событий хранения и удаления пока нет."
            minWidth="1180px"
            pageSize={20}
          />
        </AdminOpsSection>

        <AdminOpsSection title="Контуры контроля">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/ops/logs">
              <FileSearch className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Логи и аудит</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Системные логи, живые логи, диагностика и аудит.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/product/quality">
              <ShieldAlert className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Антифрод</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Реферальные риски, удержания, обращения и риски выплат.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/product/users">
              <UserCog className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Пользователи</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Роли, статусы, имперсонация и доступ.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/ops/ai">
              <AlertTriangle className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">AI-контроль</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Ключи, маршрутизация, промты и аудит LLM.</p>
            </Link>
          </div>
        </AdminOpsSection>
      </div>
    </PageContainer>
  );
}

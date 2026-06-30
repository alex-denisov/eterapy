export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileSearch, LockKeyhole, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { CompactHeader, CompactTableShell, COMPACT_CELL_CLASS } from "@/components/admin/compact-table";
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

function AuditDetails({ details }: { details: string | null }) {
  const parsed = parseAuditDetails(details);
  if (parsed.text) {
    return (
      <details className="max-w-[24rem] text-xs">
        <summary className="cursor-pointer text-[var(--soft-bordeaux)]">Показать детали</summary>
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--soft-paper-edge)] bg-white p-2 font-sans text-[11px] leading-snug text-[var(--soft-ink)]">
          {parsed.text}
        </pre>
      </details>
    );
  }
  if (parsed.entries.length === 0) return <span className="text-[var(--soft-ink-faint)]">—</span>;
  return (
    <details className="max-w-[24rem] text-xs">
      <summary className="cursor-pointer text-[var(--soft-bordeaux)]">Показать детали ({parsed.entries.length})</summary>
      <dl className="mt-2 grid max-h-40 gap-1 overflow-auto rounded border border-[var(--soft-paper-edge)] bg-white p-2 text-[11px] leading-snug">
        {parsed.entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[6.5rem_1fr] gap-2">
            <dt className="text-[var(--soft-ink-faint)]">{detailLabel(key)}</dt>
            <dd className="min-w-0 break-words text-[var(--soft-ink)]">{formatDetailValue(value)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
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
          <CompactTableShell minWidth="900px">
            <thead>
              <tr>
                <CompactHeader label="Клиент" />
                <CompactHeader label="Скоринг" />
                <CompactHeader label="Сигнал" />
                <CompactHeader label="Статус" />
                <CompactHeader label="Timestamp" />
              </tr>
            </thead>
            <tbody>
              {clientRiskRows.map((row) => (
                <tr key={row.userId}>
                  <td className={`${COMPACT_CELL_CLASS} min-w-[14rem]`}>
                    <p className="truncate font-medium text-[var(--soft-ink-strong)]">{row.name}</p>
                    <p className="truncate text-[10px] text-[var(--soft-ink-faint)]">{row.email}</p>
                  </td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums ${row.score >= 8 ? "text-red-600" : row.score >= 5 ? "text-amber-600" : "text-emerald-600"}`}>
                    {row.score}/10
                  </td>
                  <td className={COMPACT_CELL_CLASS}>{row.signal}</td>
                  <td className={COMPACT_CELL_CLASS}>{row.blocked ? "Заблокирован" : statusLabel(row.status)}</td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
              {clientRiskRows.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${COMPACT_CELL_CLASS} py-6 text-center text-sm text-[var(--soft-ink-soft)]`}>
                    Клиентов с антифрод-скорингом 5+ не найдено.
                  </td>
                </tr>
              )}
            </tbody>
          </CompactTableShell>
        </AdminOpsSection>

        <AdminOpsSection title="Очередь риск-действий" actionHref="/admin/product/quality" actionLabel="Открыть антифрод">
          <CompactTableShell minWidth="980px">
              <colgroup>
                <col className="w-[11rem]" />
                <col className="w-[11rem]" />
                <col className="w-[12rem]" />
                <col className="w-[12rem]" />
                <col className="w-[8rem]" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <CompactHeader label="Timestamp" />
                  <CompactHeader label="Действие" />
                  <CompactHeader label="Администратор" />
                  <CompactHeader label="Цель" />
                  <CompactHeader label="IP" />
                  <CompactHeader label="Детали" />
                </tr>
              </thead>
              <tbody>
                {recentRiskActions.map((row) => (
                  <tr key={row.id}>
                    <td className={COMPACT_CELL_CLASS}>{formatDateTime(row.createdAt)}</td>
                    <td className={COMPACT_CELL_CLASS}>
                      <span className="soft-admin-status-pill" data-tone={actionTone(row.action)}>
                        {actionLabel(row.action)}
                      </span>
                      <p className="mt-1 break-all text-[10px] text-[var(--soft-ink-faint)]">{row.action}</p>
                    </td>
                    <td className={`${COMPACT_CELL_CLASS} break-all font-mono text-[10px]`}>{row.userId}</td>
                    <td className={`${COMPACT_CELL_CLASS} break-all font-mono text-[10px]`}>{row.targetId ?? "—"}</td>
                    <td className={`${COMPACT_CELL_CLASS} break-all`}>{row.ip ?? "—"}</td>
                    <td className={`${COMPACT_CELL_CLASS} align-top`}><AuditDetails details={row.details} /></td>
                  </tr>
                ))}
                {recentRiskActions.length === 0 && (
                  <tr>
                    <td colSpan={6} className={`${COMPACT_CELL_CLASS} py-6 text-center text-sm text-[var(--soft-ink-soft)]`}>
                      Риск-действий в audit_logs не найдено.
                    </td>
                  </tr>
                )}
              </tbody>
          </CompactTableShell>
        </AdminOpsSection>

        <AdminOpsSection title="Retention и удаления" actionHref="/admin/ops/logs" actionLabel="Журнал">
          <div className="space-y-3">
            {deletionEvents.map((row) => (
              <div key={row.id} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{row.category} · {row.action}</p>
                  <span className="text-xs text-[var(--soft-ink-soft)]">{formatDateTime(row.occurredAt)}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{row.targetType} {row.targetId ?? ""}</p>
                <p className="mt-2 text-xs">{row.policy}</p>
                <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{row.reason}</p>
              </div>
            ))}
            {deletionEvents.length === 0 && (
              <p className="text-sm text-[var(--soft-ink-soft)]">Событий retention/deletion пока нет.</p>
            )}
          </div>
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

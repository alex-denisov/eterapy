export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, FileSearch, LockKeyhole, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AdminOpsMetric, AdminOpsSection, formatDateTime, formatNumber } from "../ops-ui";

function since(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function actionTone(action: string) {
  if (/DELETE|BLOCK|REFUND|PAYOUT|IMPERSONATE/i.test(action)) return "danger" as const;
  if (/AI_|PASSWORD|ROLE|PERMISSION|LOGIN/i.test(action)) return "warn" as const;
  return "neutral" as const;
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
  if (parsed.text) return <span className="block max-w-[28rem] whitespace-normal break-words text-xs leading-snug">{parsed.text}</span>;
  if (parsed.entries.length === 0) return <span className="text-[var(--soft-ink-faint)]">—</span>;
  return (
    <dl className="grid max-w-[28rem] grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs leading-snug">
      {parsed.entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-[var(--soft-ink-faint)]">{detailLabel(key)}</dt>
          <dd className="min-w-0 break-words text-[var(--soft-ink)]">{formatDetailValue(value)}</dd>
        </div>
      ))}
    </dl>
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
        <Link className="soft-admin-action w-fit" href="/admin/logs">Открыть все логи</Link>
      </div>

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AdminOpsMetric icon={FileSearch} label="Аудит 24ч" value={formatNumber(audit24h)} hint="Все события audit_logs за сутки" />
        <AdminOpsMetric icon={ShieldAlert} label="Риск-действия" value={formatNumber(riskActions24h)} hint="Удаления, роли, выплаты, возвраты, AI" tone={riskActions24h > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={LockKeyhole} label="Доступ" value={formatNumber(loginActions24h)} hint="Login-события и смены доступа" tone={accessRisk > 0 ? "warn" : "neutral"} />
        <AdminOpsMetric icon={Trash2} label="Retention" value={formatNumber(deletionEvents24h)} hint="Удаления и анонимизация по policy" tone={deletionEvents24h > 0 ? "warn" : "ok"} />
        <AdminOpsMetric icon={AlertTriangle} label="AI-изменения" value={formatNumber(aiRisk)} hint="Настройки providers/routing/prompts/keys" tone={aiRisk > 0 ? "warn" : "ok"} />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <AdminOpsSection title="Очередь риск-действий" actionHref="/admin/antifraud" actionLabel="Открыть антифрод">
          <div className="max-w-full overflow-hidden rounded-lg border border-[var(--soft-paper-edge)]">
            <div className="max-w-full overflow-x-auto">
            <table className="soft-admin-table table-fixed min-w-[980px]">
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
                  <th>Timestamp</th>
                  <th>Действие</th>
                  <th>Администратор</th>
                  <th>Цель</th>
                  <th>IP</th>
                  <th>Детали</th>
                </tr>
              </thead>
              <tbody>
                {recentRiskActions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className="soft-admin-status-pill" data-tone={actionTone(row.action)}>
                        {row.action}
                      </span>
                    </td>
                    <td className="break-all font-mono text-xs">{row.userId}</td>
                    <td className="break-all font-mono text-xs">{row.targetId ?? "—"}</td>
                    <td className="break-all">{row.ip ?? "—"}</td>
                    <td><AuditDetails details={row.details} /></td>
                  </tr>
                ))}
                {recentRiskActions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-[var(--soft-ink-soft)]">
                      Риск-действий в audit_logs не найдено.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </AdminOpsSection>

        <AdminOpsSection title="Retention и удаления" actionHref="/admin/logs" actionLabel="Журнал">
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
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/logs">
              <FileSearch className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Логи и аудит</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Системные, runtime, diagnostics, audit.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/antifraud">
              <ShieldAlert className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Антифрод</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Referral risk, holds, appeals, payout risk.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/users">
              <UserCog className="mb-3 h-5 w-5 text-[var(--soft-bordeaux)]" />
              <p className="text-sm font-semibold">Пользователи</p>
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">Роли, статусы, имперсонация и доступ.</p>
            </Link>
            <Link className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-4 hover:border-[var(--soft-bordeaux)]" href="/admin/ai">
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

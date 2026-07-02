export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  BookOpenText,
  BrainCircuit,
  Gauge,
  ListTodo,
  ServerCog,
} from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getAdminSystemStatus } from "@/lib/admin-system-status";
import { getAIControlCenterData } from "@/lib/ai-gateway/admin-config";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { PageContainer } from "@/components/ui/page-container";
import { formatAdminAiCost, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../admin-currency";
import { AdminCurrencySelector } from "../admin-currency-selector";
import {
  AdminOpsLinkCard,
  AdminOpsMetric,
  AdminOpsSection,
  formatNumber,
  formatPercent,
} from "./ops-ui";

function statusTone(status: string) {
  if (status === "ok") return "ok" as const;
  if (status === "down") return "danger" as const;
  return "warn" as const;
}

function statusLabel(status: string) {
  if (status === "ok") return "работает";
  if (status === "down") return "сбой";
  return "требует внимания";
}

const serviceColumns: AdminCompactColumn[] = [
  { key: "name", label: "Сервис", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "ok", label: "работает" },
      { value: "degraded", label: "требует внимания" },
      { value: "missing_config", label: "требует внимания" },
      { value: "down", label: "сбой" },
    ],
  },
  { key: "latency", label: "Задержка", sortable: true, align: "right" },
  { key: "detail", label: "Детали", sortable: true },
];

const cronColumns: AdminCompactColumn[] = [
  { key: "path", label: "Задача", sortable: true },
  { key: "cadence", label: "Расписание", sortable: true },
  { key: "purpose", label: "Назначение", sortable: true },
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminOpsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");
  const currency = resolveAdminCurrency(params);

  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  const [status, ai, audit24h, securityEvents24h, currencyRates] = await Promise.all([
    getAdminSystemStatus(requestContextFromHeaders()),
    permissions.includes("ai.configure")
      ? getAIControlCenterData(undefined, { includeSecrets: false })
      : Promise.resolve(null),
    db.auditLog.count({
      where: {
        createdAt: { gte: oneDayAgo },
      },
    }),
    db.auditLog.count({
      where: {
        createdAt: { gte: oneDayAgo },
        OR: [
          { action: { contains: "DELETE", mode: "insensitive" } },
          { action: { contains: "BLOCK", mode: "insensitive" } },
          { action: { contains: "IMPERSONATE", mode: "insensitive" } },
          { action: { contains: "PAYOUT", mode: "insensitive" } },
          { action: { contains: "REFUND", mode: "insensitive" } },
          { action: { contains: "AI_", mode: "insensitive" } },
        ],
      },
    }),
    getAdminCurrencyRates(),
  ]);

  const aiCostMicros = ai?.usageDetails.reduce((sum, row) => sum + row.costMicros, 0) ?? 0;
  const aiTokens = ai?.usageDetails.reduce((sum, row) => sum + row.totalTokens, 0) ?? 0;
  const aiRequests = ai?.usageDetails.reduce((sum, row) => sum + row.requestCount, 0) ?? status.stats.aiRequests24h;
  const aiErrors = ai?.usageDetails.reduce((sum, row) => sum + Math.max(row.attemptCount - row.successCount, 0), 0) ?? status.stats.aiErrors24h;
  const aiErrorRate = aiRequests > 0 ? (aiErrors / aiRequests) * 100 : 0;
  const unhealthyServices = status.services.filter((service) => service.status !== "ok").length;
  const queuePressure = status.stats.jobsPending + status.stats.jobsFailed + status.stats.jobsDead;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">операционный центр</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Операционный центр платформы</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Центр ежедневного контроля платформы: здоровье сервисов, очереди, AI-расходы, уведомления, файлы, база данных, логи и риск-события.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminCurrencySelector basePath="/admin/ops" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
          <div className="soft-admin-status-pill w-fit gap-2 px-3 py-1.5 text-sm" data-tone={statusTone(status.status)}>
            <ServerCog className="h-4 w-4" />
            {statusLabel(status.status)}
          </div>
        </div>
      </div>
      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <AdminOpsMetric
          icon={Gauge}
          label="Статус"
          value={statusLabel(status.status)}
          hint={`${unhealthyServices} сервисов требуют внимания`}
          tone={statusTone(status.status)}
        />
        <AdminOpsMetric
          icon={ListTodo}
          label="Очереди"
          value={formatNumber(queuePressure)}
          hint={`${status.stats.jobsPending} ожидают, ${status.stats.jobsFailed} failed, ${status.stats.jobsDead} dead`}
          tone={status.stats.jobsFailed || status.stats.jobsDead ? "danger" : queuePressure ? "warn" : "ok"}
        />
        <AdminOpsMetric
          icon={BrainCircuit}
          label="AI деньги"
          value={formatAdminAiCost(aiCostMicros, currencyRates, currency)}
          hint={`${formatNumber(aiTokens)} токенов`}
          tone={aiCostMicros > 0 ? "neutral" : "ok"}
        />
        <AdminOpsMetric
          icon={AlertTriangle}
          label="Ошибки AI"
          value={formatPercent(aiErrorRate)}
          hint={`${formatNumber(aiErrors)} ошибок на ${formatNumber(aiRequests)} запросов`}
          tone={aiErrorRate >= 10 ? "danger" : aiErrorRate > 0 ? "warn" : "ok"}
        />
        <AdminOpsMetric
          icon={BookOpenText}
          label="Аудит 24ч"
          value={formatNumber(audit24h)}
          hint={`${formatNumber(securityEvents24h)} риск-действий за сутки`}
          tone={securityEvents24h > 0 ? "warn" : "ok"}
        />
        <AdminOpsMetric
          icon={BellRing}
          label="Уведомления"
          value={formatNumber(status.stats.notificationPreferences)}
          hint={`${formatNumber(status.stats.telegramLinked)} Telegram-привязок`}
          tone="neutral"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminOpsSection title="Карта здоровья платформы">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AdminOpsLinkCard href="/admin/ops/ai-cost" title="AI-затраты и токены" value={formatAdminAiCost(aiCostMicros, currencyRates, currency)} hint="Детализация расхода по продуктам, моделям и статусам." />
            <AdminOpsLinkCard href="/admin/ops/ai" title="Провайдеры и модели" value={formatNumber(ai?.providers.length ?? 0)} hint="Cloudflare Gateway, ключи, стоимость моделей, маршрутизация, промты." />
            <AdminOpsLinkCard href="/admin/ops/notifications" title="Уведомления" value={formatNumber(status.stats.notificationPreferences)} hint="Диагностика доставок, очереди notification.delivery, Telegram/email." />
            <AdminOpsLinkCard href="/admin/ops/files" title="Файлы" value="просмотр" hint="Файловое хранилище, типы, владельцы, размеры, даты." />
            <AdminOpsLinkCard href="/admin/ops/database" title="База данных" value="read-only" hint="Табличный просмотр ключевых сущностей без ручного SQL." />
            <AdminOpsLinkCard href="/admin/ops/jobs" title="Очереди и задачи" value={formatNumber(queuePressure)} hint="Durable jobs, статусы, повторы, ошибки, dead jobs." />
            <AdminOpsLinkCard href="/admin/ops/logs" title="Журналы и аудит" value={formatNumber(audit24h)} hint="Аудит, runtime, diagnostics, поиск и фильтры." />
            <AdminOpsLinkCard href="/admin/ops/system" title="Надежность сервисов" value={statusLabel(status.status)} hint="Health/readiness, зависимости, cron-контур." />
            <AdminOpsLinkCard href="/admin/ops/security" title="Безопасность и инциденты" value={formatNumber(securityEvents24h)} hint="Риск-действия, админские операции, доступ и инциденты." />
          </div>
        </AdminOpsSection>

        <AdminOpsSection title="Сервисы и зависимости" actionHref="/admin/ops/system" actionLabel="Открыть мониторинг">
          <AdminCompactDataTable
            columns={serviceColumns}
            rows={status.services.slice(0, 10).map((service) => ({
              id: service.key,
              cells: {
                name: { value: service.name, sortValue: service.name, filterValue: `${service.name} ${service.key}` },
                status: {
                  kind: "status",
                  label: statusLabel(service.status),
                  tone: statusTone(service.status),
                  filterValue: `${service.status} ${statusLabel(service.status)}`,
                  sortValue: statusLabel(service.status),
                },
                latency: { value: service.latencyMs !== undefined ? `${service.latencyMs} ms` : "—", sortValue: service.latencyMs ?? -1, filterValue: service.latencyMs !== undefined ? String(service.latencyMs) : "" },
                detail: { value: service.detail, title: service.detail, filterValue: service.detail, sortValue: service.detail },
              },
            }))}
            empty="Сервисы не найдены"
            minWidth="900px"
          />
        </AdminOpsSection>

        <AdminOpsSection title="Очереди и cron-контур" actionHref="/admin/ops/jobs" actionLabel="Открыть задачи">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3">
              <p className="text-xl font-semibold tabular-nums">{formatNumber(status.stats.jobsPending)}</p>
              <p className="text-xs text-[var(--soft-ink-soft)]">Ожидают запуска</p>
            </div>
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3">
              <p className="text-xl font-semibold tabular-nums">{formatNumber(status.stats.jobsFailed)}</p>
              <p className="text-xs text-[var(--soft-ink-soft)]">Ошибки</p>
            </div>
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white p-3">
              <p className="text-xl font-semibold tabular-nums">{formatNumber(status.stats.jobsDead)}</p>
              <p className="text-xs text-[var(--soft-ink-soft)]">Dead jobs</p>
            </div>
          </div>
          <div className="mt-4">
            <AdminCompactDataTable
              columns={cronColumns}
              rows={status.crons.map((cron) => ({
                id: cron.path,
                cells: {
                  path: { value: cron.path, title: cron.path, filterValue: cron.path, sortValue: cron.path },
                  cadence: cron.cadence,
                  purpose: { value: cron.purpose, title: cron.purpose, filterValue: cron.purpose, sortValue: cron.purpose },
                },
              }))}
              empty="Cron-задачи не найдены"
              minWidth="820px"
            />
          </div>
        </AdminOpsSection>

        <AdminOpsSection title="Контуры данных" actionHref="/admin/ops/database" actionLabel="Открыть БД">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminOpsLinkCard href="/admin/ops/database?table=users" title="Пользователи" value={formatNumber(status.stats.users)} hint="Аккаунты, роли, каналы, доступ." />
            <AdminOpsLinkCard href="/admin/ops/database?table=practitioners" title="Практики" value={formatNumber(status.stats.practitioners)} hint="Профили, статусы, тарифы." />
            <AdminOpsLinkCard href="/admin/ops/database?table=bookings" title="Бронирования" value={formatNumber(status.stats.bookings)} hint={`${formatNumber(status.stats.pendingBookings)} ожидают решения.`} />
            <AdminOpsLinkCard href="/admin/ops/logs" title="Журнал аудита" value={formatNumber(status.stats.auditLogs)} hint="Админские действия и системные события." />
          </div>
        </AdminOpsSection>
      </div>
    </PageContainer>
  );
}

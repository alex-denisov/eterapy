export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Database, Server, Settings2, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAdminSystemStatus } from "@/lib/admin-system-status";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { PageContainer } from "@/components/ui/page-container";

function statusLabel(status: "ok" | "degraded" | "down" | "missing_config") {
  if (status === "ok") return "ОК";
  if (status === "degraded") return "Деградация";
  if (status === "missing_config") return "Нет настройки";
  return "Недоступен";
}

type Tone = "ok" | "warn" | "danger" | "neutral";

// D6: readable semantic colors on the light admin shell (the old -300 Tailwind
// shades washed out on the warm paper background).
const TONE_COLOR: Record<Tone, string> = {
  ok: "#2e7d4f",
  warn: "var(--soft-terracotta-dark)",
  danger: "#b3261e",
  neutral: "var(--soft-bordeaux)",
};

function statusTone(status: "ok" | "degraded" | "down" | "missing_config"): "ok" | "warn" | "danger" {
  if (status === "ok") return "ok";
  if (status === "down") return "danger";
  return "warn";
}

// A metric is green when healthy (0 problems) and red/amber otherwise.
function statTone(label: string, value: number): Tone {
  if (["Ошибки задач", "Невосстановимые задачи", "Ошибки AI за 24ч"].includes(label)) return value > 0 ? "danger" : "ok";
  if (["Ожидают", "Задачи ожидают"].includes(label)) return value > 0 ? "warn" : "ok";
  return "neutral";
}

function StatusIcon({ status }: { status: "ok" | "degraded" | "down" | "missing_config" }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "missing_config" || status === "degraded") return <AlertTriangle className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

const serviceColumns: AdminCompactColumn[] = [
  { key: "name", label: "Сервис", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "ok", label: "ОК" },
      { value: "degraded", label: "Деградация" },
      { value: "missing_config", label: "Нет настройки" },
      { value: "down", label: "Недоступен" },
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

export default async function AdminSystemPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("system.read")) redirect("/admin");

  const status = await getAdminSystemStatus(requestContextFromHeaders());
  const statCards = [
    { label: "Пользователей", value: status.stats.users },
    { label: "Практиков", value: status.stats.practitioners },
    { label: "Бронирований", value: status.stats.bookings },
    { label: "Ожидают", value: status.stats.pendingBookings },
    { label: "Журнал аудита", value: status.stats.auditLogs },
    { label: "Telegram", value: status.stats.telegramLinked },
    { label: "Задачи ожидают", value: status.stats.jobsPending },
    { label: "Ошибки задач", value: status.stats.jobsFailed },
    { label: "Невосстановимые задачи", value: status.stats.jobsDead },
    { label: "AI за 24ч", value: status.stats.aiRequests24h },
    { label: "Ошибки AI за 24ч", value: status.stats.aiErrors24h },
    { label: "Настройки уведомлений", value: status.stats.notificationPreferences },
  ];
  const queuePressure = status.stats.jobsPending + status.stats.jobsFailed + status.stats.jobsDead;
  const aiErrorRate = status.stats.aiRequests24h > 0
    ? Math.round((status.stats.aiErrors24h / status.stats.aiRequests24h) * 100)
    : 0;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">операционный центр</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Надежность сервисов</h1>
          <p className="mt-1 text-sm text-muted-foreground">Живой статус платформы, зависимостей и production cron-контуров</p>
        </div>
        <div className="soft-admin-status-pill w-fit gap-2 px-3 py-1.5 text-sm" data-tone={statusTone(status.status)} data-testid="system-overall-status">
          <StatusIcon status={status.status} />
          {statusLabel(status.status)}
        </div>
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-primary" />
            Доступность
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[status.live.status === "ok" ? "ok" : "danger"] }}>{status.live.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">uptime {status.live.uptimeSec}s · v{status.live.version}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-primary" />
            Готовность
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[status.ready.status === "ok" ? "ok" : "danger"] }}>{status.ready.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.ready.checks.length} проверок зависимостей</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock3 className="h-4 w-4 text-primary" />
            Последний замер
          </div>
          <p className="text-sm font-medium">{new Date(status.ready.timestamp).toLocaleString("ru-RU")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.env.nodeEnv} · {status.env.appUrl}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4 text-primary" />
            Нагрузка очередей
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[queuePressure === 0 ? "ok" : (status.stats.jobsFailed > 0 || status.stats.jobsDead > 0 ? "danger" : "warn")] }}>{queuePressure.toLocaleString("ru-RU")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.stats.jobsFailed} ошибок · {status.stats.jobsDead} dead</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Ошибки AI
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[aiErrorRate === 0 ? "ok" : aiErrorRate >= 15 ? "danger" : "warn"] }}>{aiErrorRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.stats.aiErrors24h}/{status.stats.aiRequests24h} за 24 часа</p>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">База данных и нагрузка</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border/30 bg-card/30 px-4 py-3">
              <p className="text-xl font-bold" style={{ color: TONE_COLOR[statTone(stat.label, stat.value)] }}>{stat.value.toLocaleString("ru")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
        {status.stats.message && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Статистика БД недоступна: {status.stats.message}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Зависимости</h2>
          <AdminCompactDataTable
            columns={serviceColumns}
            rows={status.services.map((service) => ({
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
            empty="Зависимости не найдены"
            minWidth="900px"
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cron-задачи</h2>
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
          <div className="mt-4 rounded-lg border border-border/30 bg-card/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4 text-primary" />
              API diagnostics
            </div>
            <p className="text-xs text-muted-foreground">
              Read-only status API: <code>/api/admin/system/status</code>. Доступ только для роли с permission <code>system.read</code>.
            </p>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

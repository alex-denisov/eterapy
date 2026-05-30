export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Database, Server, Settings2, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { getAdminSystemStatus, type SystemService } from "@/lib/admin-system-status";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { requestContextFromHeaders } from "@/lib/request-context";
import { PageContainer } from "@/components/ui/page-container";

function statusLabel(status: "ok" | "degraded" | "down" | "missing_config") {
  if (status === "ok") return "OK";
  if (status === "degraded") return "Degraded";
  if (status === "missing_config") return "Config";
  return "Down";
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
  if (["Jobs failed", "Jobs dead", "AI errors 24h"].includes(label)) return value > 0 ? "danger" : "ok";
  if (["Ожидают", "Jobs pending"].includes(label)) return value > 0 ? "warn" : "ok";
  return "neutral";
}

function StatusIcon({ status }: { status: "ok" | "degraded" | "down" | "missing_config" }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "missing_config" || status === "degraded") return <AlertTriangle className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

function ServiceRow({ service }: { service: SystemService }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3" data-testid={`system-service-${service.key}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{service.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {service.latencyMs !== undefined ? `${service.detail} · ${service.latencyMs} ms` : service.detail}
        </p>
      </div>
      <span className="soft-admin-status-pill shrink-0 gap-1.5" data-tone={statusTone(service.status)}>
        <StatusIcon status={service.status} />
        {statusLabel(service.status)}
      </span>
    </div>
  );
}

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
    { label: "Audit logs", value: status.stats.auditLogs },
    { label: "Telegram", value: status.stats.telegramLinked },
    { label: "Jobs pending", value: status.stats.jobsPending },
    { label: "Jobs failed", value: status.stats.jobsFailed },
    { label: "Jobs dead", value: status.stats.jobsDead },
    { label: "AI 24h", value: status.stats.aiRequests24h },
    { label: "AI errors 24h", value: status.stats.aiErrors24h },
    { label: "Notify prefs", value: status.stats.notificationPreferences },
  ];
  const queuePressure = status.stats.jobsPending + status.stats.jobsFailed + status.stats.jobsDead;
  const aiErrorRate = status.stats.aiRequests24h > 0
    ? Math.round((status.stats.aiErrors24h / status.stats.aiRequests24h) * 100)
    : 0;

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">ops center</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Система</h1>
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
            Liveness
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[status.live.status === "ok" ? "ok" : "danger"] }}>{status.live.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">uptime {status.live.uptimeSec}s · v{status.live.version}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-primary" />
            Readiness
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[status.ready.status === "ok" ? "ok" : "danger"] }}>{status.ready.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.ready.checks.length} dependency checks</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock3 className="h-4 w-4 text-primary" />
            Last sample
          </div>
          <p className="text-sm font-medium">{new Date(status.ready.timestamp).toLocaleString("ru-RU")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.env.nodeEnv} · {status.env.appUrl}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Settings2 className="h-4 w-4 text-primary" />
            Queue pressure
          </div>
          <p className="text-2xl font-bold" style={{ color: TONE_COLOR[queuePressure === 0 ? "ok" : (status.stats.jobsFailed > 0 || status.stats.jobsDead > 0 ? "danger" : "warn")] }}>{queuePressure.toLocaleString("ru-RU")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{status.stats.jobsFailed} failed · {status.stats.jobsDead} dead</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-primary" />
            AI error rate
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
            DB stats unavailable: {status.stats.message}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Зависимости</h2>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {status.services.map((service) => (
              <ServiceRow key={service.key} service={service} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cron-задачи</h2>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {status.crons.map((cron) => (
              <div key={cron.path} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <code className="text-xs text-primary">{cron.path}</code>
                  <span className="shrink-0 rounded-full border border-border/30 px-2 py-0.5 text-[11px] text-muted-foreground">{cron.cadence}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{cron.purpose}</p>
              </div>
            ))}
          </div>
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

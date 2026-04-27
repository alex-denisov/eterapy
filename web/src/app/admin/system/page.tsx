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

function statusClasses(status: "ok" | "degraded" | "down" | "missing_config") {
  if (status === "ok") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "missing_config" || status === "degraded") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-300";
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
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${statusClasses(service.status)}`}>
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
  ];

  return (
    <PageContainer maxWidth="6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Система</h1>
          <p className="mt-1 text-sm text-muted-foreground">Живой статус платформы, зависимостей и production cron-контуров</p>
        </div>
        <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${statusClasses(status.status)}`} data-testid="system-overall-status">
          <StatusIcon status={status.status} />
          {statusLabel(status.status)}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-primary" />
            Liveness
          </div>
          <p className="text-2xl font-bold text-emerald-300">{status.live.status}</p>
          <p className="mt-1 text-xs text-muted-foreground">uptime {status.live.uptimeSec}s · v{status.live.version}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-primary" />
            Readiness
          </div>
          <p className={`text-2xl font-bold ${status.ready.status === "ok" ? "text-emerald-300" : "text-red-300"}`}>{status.ready.status}</p>
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
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">База данных</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border/30 bg-card/30 px-4 py-3">
              <p className="text-xl font-bold text-primary">{stat.value.toLocaleString("ru")}</p>
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

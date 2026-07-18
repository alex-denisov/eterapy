/**
 * B541 — «Мониторинг флота»: живой статус всех ВМ + one-click редеплой.
 * Только SUPERADMIN: раздел раскрывает адреса нод и запускает деплой.
 */
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ExternalLink, Server } from "lucide-react";
import { auth } from "@/lib/auth";
import { PageContainer } from "@/components/ui/page-container";
import { getFleetNodes } from "@/lib/fleet/nodes";
import { collectFleetStatus, summarizeFleet } from "@/lib/fleet/status";
import { getFleetDispatchConfig } from "@/lib/fleet/dispatch";
import { summarizeContainers } from "@/lib/fleet/node-state";
import { checkCloudflareWorkers, getCloudflareConfig } from "@/lib/fleet/cloudflare";
import { FleetTable, type FleetRow } from "./fleet-table";

export default async function AdminFleetMonitoringPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");

  const nodes = getFleetNodes();
  const statuses = await collectFleetStatus(nodes, {
    opsSecret: process.env.FLEET_OPS_SECRET ?? process.env.CRON_SECRET,
  });
  const summary = summarizeFleet(statuses);
  const dispatch = getFleetDispatchConfig();
  const cloudflare = await checkCloudflareWorkers(getCloudflareConfig());

  const rows: FleetRow[] = statuses.map((status) => ({
    name: status.node.name,
    host: status.node.host,
    role: status.node.role,
    contour: status.node.contour,
    ok: status.ok,
    releaseSha: status.releaseSha ?? null,
    health: status.health ?? null,
    uptimeSec: status.uptimeSec ?? null,
    diskUsedPct: status.disk?.usedPct ?? null,
    memoryUsedPct: status.memory?.usedPct ?? null,
    latencyMs: status.latencyMs ?? null,
    error: status.error ?? null,
    containers: status.host?.containers ?? [],
    containerSummary: status.host ? summarizeContainers(status.host.containers) : null,
    collectorStale: status.host?.stale ?? false,
    backup: status.host?.backup ?? null,
    buckets: status.host?.buckets ?? [],
    haproxy: status.host?.haproxy ?? null,
  }));

  // Рассинхрон версий контейнеров приложения по всему флоту — признак
  // недокатившегося деплоя, который сводка по релиз-SHA может не поймать.
  const allAppVersions = [
    ...new Set(rows.flatMap((row) => row.containerSummary?.appVersions ?? [])),
  ].sort();
  const unhealthyContainers = rows.reduce((sum, row) => sum + (row.containerSummary?.unhealthy ?? 0), 0);

  return (
    <PageContainer maxWidth="full">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">операционный центр</p>
          <h1 className="premium-title mt-2 text-3xl md:text-4xl">Мониторинг флота</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Состояние всех ВМ, их релизы и ресурсы · деплой в один клик
          </p>
        </div>
        <a
          href={`https://github.com/${dispatch.repo}/actions/workflows/${dispatch.workflow}`}
          target="_blank"
          rel="noopener noreferrer"
          className="soft-button-secondary w-fit px-3 py-1.5 text-sm"
        >
          <ExternalLink className="mr-1.5 inline h-3.5 w-3.5" />
          Прогресс деплоя
        </a>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-primary" />
            Нод в инвентаре
          </div>
          <p className="text-2xl font-bold">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-2 text-sm font-medium">Доступны</div>
          <p className="text-2xl font-bold" style={{ color: "#2e7d4f" }}>{summary.up}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-2 text-sm font-medium">Недоступны</div>
          <p className="text-2xl font-bold" style={{ color: summary.down > 0 ? "#b3261e" : "#2e7d4f" }}>{summary.down}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-2 text-sm font-medium">Контейнеры</div>
          <p
            className="text-2xl font-bold"
            style={{ color: unhealthyContainers > 0 ? "#b3261e" : allAppVersions.length > 1 ? "var(--soft-terracotta-dark)" : "#2e7d4f" }}
            data-testid="fleet-containers-summary"
          >
            {unhealthyContainers > 0 ? `${unhealthyContainers} unhealthy` : allAppVersions.length > 1 ? "разные версии" : "в норме"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            версия приложения: {allAppVersions.length ? allAppVersions.join(", ") : "нет данных"}
          </p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card/40 p-4">
          <div className="mb-2 text-sm font-medium">Релизы</div>
          <p
            className="text-2xl font-bold"
            style={{ color: summary.releaseMismatch ? "var(--soft-terracotta-dark)" : "#2e7d4f" }}
            data-testid="fleet-release-consistency"
          >
            {summary.releaseMismatch ? "рассинхрон" : "совпадают"}
          </p>
        </div>
      </div>

      <FleetTable rows={rows} dispatchReady={Boolean(dispatch.token)} />

      <section className="mt-6 rounded-lg border border-border/30 bg-card/40 p-4" data-testid="fleet-cloudflare">
        <h2 className="mb-3 text-sm font-medium">Cloudflare · воркеры на границе</h2>
        {cloudflare.status === "ok" && cloudflare.workers.length > 0 ? (
          <ul className="space-y-1">
            {cloudflare.workers.map((worker) => (
              <li key={worker.name} className="flex flex-wrap items-baseline gap-3 text-sm">
                <span className="font-medium">{worker.name}</span>
                <span className="text-xs text-muted-foreground">
                  {worker.modifiedOn ? `обновлён ${new Date(worker.modifiedOn).toLocaleString("ru-RU")}` : "дата деплоя неизвестна"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="text-sm"
            style={{ color: cloudflare.status === "down" ? "#b3261e" : "var(--soft-bordeaux)" }}
          >
            {cloudflare.detail}
          </p>
        )}
      </section>
    </PageContainer>
  );
}

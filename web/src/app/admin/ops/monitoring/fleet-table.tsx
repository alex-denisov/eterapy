"use client";

/**
 * B541 — таблица нод флота с кнопками редеплоя.
 * Вся авторизация — на сервере (`actions.ts`); здесь только UI и статусы.
 */
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { redeployFleetAction, type DeployActionResult } from "./actions";

export type FleetRow = {
  name: string;
  host: string;
  role: string;
  contour: string;
  ok: boolean;
  releaseSha: string | null;
  health: string | null;
  uptimeSec: number | null;
  diskUsedPct: number | null;
  memoryUsedPct: number | null;
  latencyMs: number | null;
  error: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  primary: "боевая",
  standby: "резерв",
  edge: "edge",
};

const CONTOUR_LABEL: Record<string, string> = { ru: "РФ", foreign: "Foreign" };

function usageTone(pct: number | null): string {
  if (pct === null) return "var(--soft-bordeaux)";
  if (pct >= 90) return "#b3261e";
  if (pct >= 75) return "var(--soft-terracotta-dark)";
  return "#2e7d4f";
}

function formatUptime(sec: number | null): string {
  if (sec === null) return "—";
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  return days > 0 ? `${days}д ${hours}ч` : `${hours}ч ${Math.floor((sec % 3600) / 60)}м`;
}

function Usage({ label, pct }: { label: string; pct: number | null }) {
  return (
    <span className="text-xs" style={{ color: usageTone(pct) }}>
      {label} {pct === null ? "—" : `${pct}%`}
    </span>
  );
}

export function FleetTable({ rows, dispatchReady }: { rows: FleetRow[]; dispatchReady: boolean }) {
  const [pending, startTransition] = useTransition();
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [result, setResult] = useState<DeployActionResult | null>(null);

  function redeploy(nodeName: string | null) {
    const confirmed = window.confirm(
      nodeName
        ? `Запустить редеплой ноды «${nodeName}»?`
        : "Запустить редеплой ВСЕГО флота? Все ноды получат текущий релиз.",
    );
    if (!confirmed) return;

    setBusyNode(nodeName ?? "all");
    setResult(null);
    startTransition(async () => {
      const actionResult = await redeployFleetAction(nodeName);
      setResult(actionResult);
      setBusyNode(null);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-card/40 p-6 text-sm text-muted-foreground">
        Инвентарь флота не настроен. Задайте <code>FLEET_NODES</code> в{" "}
        <code>/opt/eterapy/.env</code> — см. <code>deploy/README-fleet-monitoring.md</code>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="soft-button-primary px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => redeploy(null)}
          disabled={pending || !dispatchReady}
          data-testid="fleet-redeploy-all"
        >
          <RefreshCw className={`mr-2 inline h-4 w-4 ${busyNode === "all" ? "animate-spin" : ""}`} />
          Редеплой всего флота
        </button>
        {!dispatchReady && (
          <span className="text-xs text-muted-foreground">
            Деплой из панели выключен: не задан <code>FLEET_GITHUB_TOKEN</code>.
          </span>
        )}
      </div>

      {result && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: result.ok ? "#2e7d4f" : "#b3261e", color: result.ok ? "#2e7d4f" : "#b3261e" }}
          data-testid="fleet-action-result"
        >
          {result.message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/30 text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Нода</th>
              <th className="py-2 pr-3">Роль</th>
              <th className="py-2 pr-3">Контур</th>
              <th className="py-2 pr-3">Статус</th>
              <th className="py-2 pr-3">Релиз</th>
              <th className="py-2 pr-3">Ресурсы</th>
              <th className="py-2 pr-3">Uptime</th>
              <th className="py-2 pr-3 text-right">Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/20" data-testid={`fleet-row-${row.name}`}>
                <td className="py-2 pr-3">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.host}</div>
                </td>
                <td className="py-2 pr-3 text-xs">{ROLE_LABEL[row.role] ?? row.role}</td>
                <td className="py-2 pr-3 text-xs">{CONTOUR_LABEL[row.contour] ?? row.contour}</td>
                <td className="py-2 pr-3">
                  {row.ok ? (
                    <span className="inline-flex items-center gap-1" style={{ color: row.health === "ok" ? "#2e7d4f" : "var(--soft-terracotta-dark)" }}>
                      {row.health === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {row.health ?? "неизвестно"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1" style={{ color: "#b3261e" }} title={row.error ?? ""}>
                      <XCircle className="h-4 w-4" />
                      недоступна
                    </span>
                  )}
                  {row.latencyMs !== null && <div className="text-xs text-muted-foreground">{row.latencyMs} мс</div>}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{row.releaseSha ?? "—"}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-col">
                    <Usage label="диск" pct={row.diskUsedPct} />
                    <Usage label="память" pct={row.memoryUsedPct} />
                  </div>
                </td>
                <td className="py-2 pr-3 text-xs">{formatUptime(row.uptimeSec)}</td>
                <td className="py-2 pr-3 text-right">
                  <button
                    type="button"
                    className="soft-button-secondary px-3 py-1.5 text-xs disabled:opacity-50"
                    onClick={() => redeploy(row.name)}
                    disabled={pending || !dispatchReady}
                    data-testid={`fleet-redeploy-${row.name}`}
                  >
                    <RefreshCw className={`mr-1.5 inline h-3.5 w-3.5 ${busyNode === row.name ? "animate-spin" : ""}`} />
                    Редеплой
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

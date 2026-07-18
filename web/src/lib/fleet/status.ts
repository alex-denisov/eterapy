/**
 * B541 — сбор статуса флота.
 *
 * Панель суперадмина опрашивает `/api/ops/node-status` каждой ноды. Одна
 * недоступная нода не должна ронять весь экран — ошибки собираются
 * пер-нода, таймаут жёсткий.
 */
import { fleetNodeStatusUrl, type FleetNode } from "./nodes";

export type NodeResourceUsage = { usedPct: number; totalBytes?: number; freeBytes?: number };

export type FleetNodeStatus = {
  node: FleetNode;
  ok: boolean;
  /** SHA релиза, который реально крутится на ноде. */
  releaseSha?: string;
  health?: string;
  uptimeSec?: number;
  disk?: NodeResourceUsage;
  memory?: NodeResourceUsage;
  error?: string;
  latencyMs?: number;
};

export type CollectOptions = {
  fetchImpl?: typeof fetch;
  opsSecret?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 4000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function fetchNodeStatus(
  node: FleetNode,
  { fetchImpl = fetch, opsSecret, timeoutMs = DEFAULT_TIMEOUT_MS }: CollectOptions,
): Promise<FleetNodeStatus> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { accept: "application/json" };
  // Секрет только заголовком: URL попадает в логи прокси и в историю раннера.
  if (opsSecret) headers["x-ops-secret"] = opsSecret;

  try {
    const response = await fetchImpl(fleetNodeStatusUrl(node), {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return { node, ok: false, error: `HTTP ${response.status}`, latencyMs: Date.now() - startedAt };
    }

    const payload = (await response.json()) as Partial<FleetNodeStatus> & Record<string, unknown>;

    return {
      node,
      ok: true,
      releaseSha: typeof payload.releaseSha === "string" ? payload.releaseSha : undefined,
      health: typeof payload.health === "string" ? payload.health : undefined,
      uptimeSec: typeof payload.uptimeSec === "number" ? payload.uptimeSec : undefined,
      disk: (payload.disk as NodeResourceUsage | undefined) ?? undefined,
      memory: (payload.memory as NodeResourceUsage | undefined) ?? undefined,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return { node, ok: false, error: errorMessage(error), latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** Опрашивает все ноды параллельно, сохраняя порядок инвентаря. */
export async function collectFleetStatus(
  nodes: FleetNode[],
  options: CollectOptions = {},
): Promise<FleetNodeStatus[]> {
  return Promise.all(nodes.map((node) => fetchNodeStatus(node, options)));
}

export type FleetSummary = {
  total: number;
  up: number;
  down: number;
  /** true, если живые ноды крутят разные релизы (частичный деплой). */
  releaseMismatch: boolean;
};

export function summarizeFleet(statuses: FleetNodeStatus[]): FleetSummary {
  const up = statuses.filter((status) => status.ok);
  const releases = new Set(
    up.map((status) => status.releaseSha).filter((sha): sha is string => Boolean(sha)),
  );

  return {
    total: statuses.length,
    up: up.length,
    down: statuses.length - up.length,
    releaseMismatch: releases.size > 1,
  };
}

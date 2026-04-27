import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
}

export interface LiveHealth {
  status: "ok";
  timestamp: string;
  version: string;
  uptimeSec: number;
}

export interface ReadinessHealth {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks: HealthCheck[];
}

function appVersion() {
  return process.env.npm_package_version || "0.0.1";
}

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

export function getLiveHealth(): LiveHealth {
  return {
    status: "ok",
    timestamp: nowIso(),
    version: appVersion(),
    uptimeSec: Math.round(process.uptime()),
  };
}

export async function checkDatabase(context: { requestId: string }): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      name: "database",
      status: "ok",
      latencyMs: elapsedMs(startedAt),
    };
  } catch (err) {
    log.error("health-ready-db-check-failed", {
      requestId: context.requestId,
      error: serializeError(err),
    });
    return {
      name: "database",
      status: "down",
      latencyMs: elapsedMs(startedAt),
      message: err instanceof Error ? err.message : "Database check failed",
    };
  }
}

export async function getReadinessHealth(context: { requestId: string }): Promise<ReadinessHealth> {
  const checks = [await checkDatabase(context)];
  const status: HealthStatus = checks.every((check) => check.status === "ok") ? "ok" : "down";

  return {
    status,
    timestamp: nowIso(),
    version: appVersion(),
    checks,
  };
}

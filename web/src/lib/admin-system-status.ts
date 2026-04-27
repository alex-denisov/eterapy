import { BookingStatus } from "@prisma/client";
import db from "@/lib/db";
import { getLiveHealth, getReadinessHealth, type HealthStatus } from "@/lib/health";
import { log, serializeError } from "@/lib/logger";

export const PRODUCT_CRONS = [
  {
    path: "/api/cron/reminders",
    purpose: "Напоминания клиентам и практикам за 24 ч и 1 ч до сессии",
    cadence: "каждые 15 минут",
  },
  {
    path: "/api/cron/cleanup",
    purpose: "Удаление soft-deleted клиентов после 10 дней grace + истёкших телеграм-токенов",
    cadence: "1 раз в сутки (00:00)",
  },
];

export interface SystemStats {
  status: HealthStatus;
  users: number;
  practitioners: number;
  bookings: number;
  pendingBookings: number;
  auditLogs: number;
  notificationPreferences: number;
  telegramLinked: number;
  message?: string;
}

export interface SystemService {
  key: string;
  name: string;
  status: "ok" | "missing_config" | "down";
  detail: string;
  latencyMs?: number;
}

export interface SystemStatus {
  status: HealthStatus;
  live: ReturnType<typeof getLiveHealth>;
  ready: Awaited<ReturnType<typeof getReadinessHealth>>;
  stats: SystemStats;
  services: SystemService[];
  env: {
    nodeEnv: string;
    appUrl: string;
  };
  crons: typeof PRODUCT_CRONS;
}

function configured(ok: boolean): "ok" | "missing_config" {
  return ok ? "ok" : "missing_config";
}

async function getStats(context: { requestId: string }): Promise<SystemStats> {
  try {
    const [users, practitioners, bookings, pendingBookings, auditLogs, notificationPreferences, telegramLinked] = await Promise.all([
      db.user.count(),
      db.practitioner.count(),
      db.booking.count(),
      db.booking.count({ where: { status: BookingStatus.PENDING } }),
      db.auditLog.count(),
      db.notificationPreference.count(),
      db.user.count({ where: { telegramId: { not: null } } }),
    ]);

    return {
      status: "ok",
      users,
      practitioners,
      bookings,
      pendingBookings,
      auditLogs,
      notificationPreferences,
      telegramLinked,
    };
  } catch (err) {
    log.error("admin-system-stats-failed", {
      requestId: context.requestId,
      error: serializeError(err),
    });
    return {
      status: "down",
      users: 0,
      practitioners: 0,
      bookings: 0,
      pendingBookings: 0,
      auditLogs: 0,
      notificationPreferences: 0,
      telegramLinked: 0,
      message: err instanceof Error ? err.message : "Stats query failed",
    };
  }
}

export async function getAdminSystemStatus(context: { requestId: string }): Promise<SystemStatus> {
  const [ready, stats] = await Promise.all([
    getReadinessHealth(context),
    getStats(context),
  ]);
  const live = getLiveHealth();
  const database = ready.checks.find((check) => check.name === "database");

  const services: SystemService[] = [
    {
      key: "database",
      name: "PostgreSQL",
      status: database?.status === "ok" ? "ok" : "down",
      detail: database?.status === "ok" ? "Готова к запросам" : database?.message ?? "Нет ответа",
      latencyMs: database?.latencyMs,
    },
    {
      key: "email",
      name: "Email (Resend)",
      status: configured(Boolean(process.env.RESEND_API_KEY)),
      detail: "RESEND_API_KEY",
    },
    {
      key: "ai",
      name: "AI (OpenRouter)",
      status: configured(Boolean(process.env.OPENROUTER_API_KEY)),
      detail: "OPENROUTER_API_KEY",
    },
    {
      key: "video",
      name: "Video (LiveKit)",
      status: configured(Boolean(process.env.LIVEKIT_API_KEY)),
      detail: "LIVEKIT_API_KEY",
    },
    {
      key: "telegram",
      name: "Telegram Bot",
      status: configured(Boolean(process.env.TELEGRAM_BOT_TOKEN)),
      detail: "TELEGRAM_BOT_TOKEN",
    },
    {
      key: "cron",
      name: "Cron auth",
      status: configured(Boolean(process.env.CRON_SECRET)),
      detail: "CRON_SECRET",
    },
  ];

  const criticalDown = services.some((service) => service.status === "down");
  const missingConfig = services.some((service) => service.status === "missing_config");
  const status: HealthStatus = criticalDown || stats.status === "down"
    ? "down"
    : missingConfig
      ? "degraded"
      : "ok";

  return {
    status,
    live,
    ready,
    stats,
    services,
    env: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "not configured",
    },
    crons: PRODUCT_CRONS,
  };
}

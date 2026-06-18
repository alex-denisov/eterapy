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
    purpose: "retention matrix: анонимизация soft-deleted клиентов через 7 дней + 72ч TTL гостевых диалогов/routing logs + 12м security logs",
    cadence: "1 раз в сутки (00:00)",
  },
  {
    path: "/api/cron/practitioner-sync",
    purpose: "Синхронизация комиссии практиков при смене или истечении Pro/Pro+",
    cadence: "1 раз в сутки",
  },
  {
    path: "/api/cron/payouts",
    purpose: "Идемпотентный PayoutRun для выплат практикам 1-го и 15-го числа",
    cadence: "1-го и 15-го числа, Europe/Moscow",
  },
  {
    path: "/api/cron/credits-expiring",
    purpose: "Реактивация клиентов: баллы сгорают через 2-3 дня",
    cadence: "1 раз в сутки",
  },
  {
    path: "/api/cron/streak-at-risk",
    purpose: "Реактивация клиентов: мягкое сохранение practice streak",
    cadence: "ежедневно вечером",
  },
  {
    path: "/api/cron/moment-of-need",
    purpose: "Реактивация клиентов после 14 дней паузы по сохраненной теме",
    cadence: "1 раз в сутки",
  },
  {
    path: "/api/cron/subscription-renewal",
    purpose: "Напоминание об автопродлении подписки за 3 дня до конца периода",
    cadence: "1 раз в сутки",
  },
  {
    path: "/api/cron/session-escrow-capture",
    purpose: "24ч-grace захват холда сессий, не захваченных при старте (Баг 16)",
    cadence: "ежечасно",
  },
];

export interface SystemStats {
  status: HealthStatus;
  users: number;
  practitioners: number;
  bookings: number;
  pendingBookings: number;
  auditLogs: number;
  jobsPending: number;
  jobsFailed: number;
  jobsDead: number;
  aiRequests24h: number;
  aiErrors24h: number;
  notificationPreferences: number;
  telegramLinked: number;
  message?: string;
}

export interface SystemService {
  key: string;
  name: string;
  status: "ok" | "missing_config" | "down" | "degraded";
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

async function aiProviderServices(context: { requestId: string }): Promise<SystemService[]> {
  const providerEnv: Array<{ provider: string; label: string; envKey: string; configured: boolean }> = [
    { provider: "OPENROUTER", label: "OpenRouter", envKey: "OPENROUTER_API_KEY", configured: Boolean(process.env.OPENROUTER_API_KEY) },
    { provider: "OPENAI", label: "OpenAI", envKey: "OPENAI_API_KEY", configured: Boolean(process.env.OPENAI_API_KEY) },
    { provider: "ANTHROPIC", label: "Anthropic", envKey: "ANTHROPIC_API_KEY", configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { provider: "GEMINI", label: "Gemini", envKey: "GEMINI_API_KEY", configured: Boolean(process.env.GEMINI_API_KEY) },
    { provider: "GROQ", label: "Groq", envKey: "GROQ_API_KEY", configured: Boolean(process.env.GROQ_API_KEY) },
    { provider: "MISTRAL", label: "Mistral", envKey: "MISTRAL_API_KEY", configured: Boolean(process.env.MISTRAL_API_KEY) },
    { provider: "CEREBRAS", label: "Cerebras", envKey: "CEREBRAS_API_KEY", configured: Boolean(process.env.CEREBRAS_API_KEY) },
    { provider: "COHERE", label: "Cohere", envKey: "COHERE_API_KEY", configured: Boolean(process.env.COHERE_API_KEY) },
    { provider: "FIREWORKS", label: "Fireworks", envKey: "FIREWORKS_API_KEY", configured: Boolean(process.env.FIREWORKS_API_KEY) },
  ];

  try {
    const credentials = await db.aIProviderCredential.findMany({
      where: { enabled: true },
      select: {
        provider: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        consecutiveFailures: true,
        regionBlocked: true,
      },
    });
    const credentialsByProvider = new Map<string, typeof credentials>();
    for (const credential of credentials) {
      const key = String(credential.provider);
      const list = credentialsByProvider.get(key) ?? [];
      list.push(credential);
      credentialsByProvider.set(key, list);
    }

    return providerEnv.map((provider) => {
      const rows = credentialsByProvider.get(provider.provider) ?? [];
      const hasDbCredential = rows.length > 0;
      const hasUsableDbCredential = rows.some((row) => !row.regionBlocked && row.consecutiveFailures < 3);
      const hasRecentSuccess = rows.some((row) => Boolean(row.lastSuccessAt));
      const hasRecentErrors = rows.some((row) => Boolean(row.lastErrorAt) && row.consecutiveFailures > 0);

      if (!provider.configured && !hasDbCredential) {
        return {
          key: `ai-${provider.provider.toLowerCase()}`,
          name: `AI ${provider.label}`,
          status: "missing_config" as const,
          detail: `${provider.envKey} или AIProviderCredential`,
        };
      }

      if (hasDbCredential && !hasUsableDbCredential) {
        return {
          key: `ai-${provider.provider.toLowerCase()}`,
          name: `AI ${provider.label}`,
          status: "degraded" as const,
          detail: "все включённые ключи в ошибке, cooldown или region block",
        };
      }

      return {
        key: `ai-${provider.provider.toLowerCase()}`,
        name: `AI ${provider.label}`,
        status: hasRecentErrors && !hasRecentSuccess ? "degraded" as const : "ok" as const,
        detail: hasDbCredential
          ? `${rows.length} ключ(ей) в AI-центре${provider.configured ? ` + ${provider.envKey}` : ""}`
          : provider.envKey,
      };
    });
  } catch (err) {
    log.error("admin-system-ai-services-failed", {
      requestId: context.requestId,
      error: serializeError(err),
    });
    return providerEnv.map((provider) => ({
      key: `ai-${provider.provider.toLowerCase()}`,
      name: `AI ${provider.label}`,
      status: configured(provider.configured),
      detail: `${provider.envKey}; DB credentials unavailable`,
    }));
  }
}

async function getStats(context: { requestId: string }): Promise<SystemStats> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      users,
      practitioners,
      bookings,
      pendingBookings,
      auditLogs,
      jobsPending,
      jobsFailed,
      jobsDead,
      aiRequests24h,
      aiErrors24h,
      notificationPreferences,
      telegramLinked,
    ] = await Promise.all([
      db.user.count(),
      db.practitioner.count(),
      db.booking.count(),
      db.booking.count({ where: { status: BookingStatus.PENDING } }),
      db.auditLog.count(),
      db.job.count({ where: { status: "PENDING" } }),
      db.job.count({ where: { status: "FAILED" } }),
      db.job.count({ where: { status: "DEAD" } }),
      db.aIRequest.count({ where: { createdAt: { gte: oneDayAgo } } }),
      db.aIRequest.count({ where: { status: "FAILED", createdAt: { gte: oneDayAgo } } }),
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
      jobsPending,
      jobsFailed,
      jobsDead,
      aiRequests24h,
      aiErrors24h,
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
      jobsPending: 0,
      jobsFailed: 0,
      jobsDead: 0,
      aiRequests24h: 0,
      aiErrors24h: 0,
      notificationPreferences: 0,
      telegramLinked: 0,
      message: err instanceof Error ? err.message : "Stats query failed",
    };
  }
}

export async function getAdminSystemStatus(context: { requestId: string }): Promise<SystemStatus> {
  const [ready, stats, aiServices] = await Promise.all([
    getReadinessHealth(context),
    getStats(context),
    aiProviderServices(context),
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
    ...aiServices,
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

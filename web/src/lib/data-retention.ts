import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { ACCOUNT_SOFT_DELETE_GRACE_DAYS } from "@/lib/account-deletion-policy";
import { cleanupExpiredGuestDialogues } from "@/lib/guest-dialogue-retention";

export const RETENTION_POLICY = {
  guestPromptResult: {
    category: "guest_prompt_result",
    ttlHours: 72,
  },
  accountProfile: {
    category: "account_profile",
    retention: "while_active",
    // Число живёт в `account-deletion-policy.ts`: его же читают настройки
    // кабинета и письмо о деактивации. Раньше их было три разных.
    softDeleteGraceDays: ACCOUNT_SOFT_DELETE_GRACE_DAYS,
  },
  dialogues: {
    category: "dialogues",
    retention: "while_account_active_or_until_deletion",
  },
  payments: {
    category: "payments",
    ttlYears: 5,
  },
  agentReports: {
    category: "agent_reports",
    ttlYears: 5,
  },
  disputes: {
    category: "disputes",
    ttlYears: 3,
  },
  chargebackEvidence: {
    category: "chargeback_evidence",
    ttlYears: 3,
  },
  routingLogs: {
    category: "routing_logs",
    paidYears: 3,
    guestTtlHours: 72,
  },
  securityLogs: {
    category: "security_logs",
    ttlMonths: 12,
  },
  anonymizedAnalytics: {
    category: "anonymized_analytics",
    retention: "indefinite",
  },
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type RetentionDb = typeof db & {
  deletionLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

interface CleanupRetentionInput {
  now?: Date;
  limit?: number;
}

function subtractYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() - years);
  return copy;
}

function subtractMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

export function retentionCutoffs(now: Date = new Date()) {
  return {
    accountAnonymizeBefore: new Date(now.getTime() - RETENTION_POLICY.accountProfile.softDeleteGraceDays * DAY_MS),
    guestDialogueBefore: now,
    guestRoutingLogBefore: new Date(now.getTime() - RETENTION_POLICY.routingLogs.guestTtlHours * HOUR_MS),
    paidRoutingLogBefore: subtractYears(now, RETENTION_POLICY.routingLogs.paidYears),
    paymentBefore: subtractYears(now, RETENTION_POLICY.payments.ttlYears),
    agentReportBefore: subtractYears(now, RETENTION_POLICY.agentReports.ttlYears),
    disputeBefore: subtractYears(now, RETENTION_POLICY.disputes.ttlYears),
    chargebackEvidenceBefore: subtractYears(now, RETENTION_POLICY.chargebackEvidence.ttlYears),
    securityLogBefore: subtractMonths(now, RETENTION_POLICY.securityLogs.ttlMonths),
  };
}

function retentionDb() {
  return db as RetentionDb;
}

function clampLimit(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? 500, 1000));
}

export async function cleanupRetentionData(input: CleanupRetentionInput = {}) {
  const now = input.now ?? new Date();
  const limit = clampLimit(input.limit);
  const cutoffs = retentionCutoffs(now);
  const client = retentionDb();

  const usersToAnonymize = await client.user.findMany({
    where: {
      deletedAt: { lte: cutoffs.accountAnonymizeBefore },
      retentionAnonymizedAt: null,
    },
    orderBy: [
      { deletedAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      email: true,
      deletedAt: true,
    },
  });

  let usersAnonymized = 0;
  for (const user of usersToAnonymize) {
    const metadata: Prisma.InputJsonObject = {
      deletedAt: user.deletedAt?.toISOString() ?? null,
      originalEmailPresent: Boolean(user.email),
      retainedForLegalAccountingAndDisputes: true,
    };

    await client.$transaction(async (tx) => {
      const retentionTx = tx as RetentionDb;
      await retentionTx.user.update({
        where: { id: user.id },
        data: {
          email: `deleted-${user.id}@retention.eterapy.local`,
          normalizedEmail: null,
          name: "Удаленный пользователь",
          password: `deleted:${user.id}`,
          avatarUrl: null,
          provider: "deleted",
          providerId: null,
          registrationChannel: null,
          telegramId: null,
          telegramUsername: null,
          birthDate: null,
          birthDateSource: null,
          birthTime: null,
          birthPlace: null,
          timezone: null,
          maritalStatus: null,
          occupation: null,
          aiGoals: { set: [] },
          verificationToken: null,
          verificationExpires: null,
          resetToken: null,
          resetExpires: null,
          retentionAnonymizedAt: now,
        },
      });
      await retentionTx.deletionLog.create({
        data: {
          category: RETENTION_POLICY.accountProfile.category,
          action: "ANONYMIZE",
          targetType: "User",
          targetId: user.id,
          policy: "account_profile_7d_anonymize",
          reason: "soft_deleted_account_grace_period_elapsed",
          metadata,
          occurredAt: now,
        },
      });
    });
    usersAnonymized++;
  }

  const guestRoutingLogs = await client.aIRequest.findMany({
    where: {
      userId: null,
      billingEventId: null,
      createdAt: { lte: cutoffs.guestRoutingLogBefore },
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      feature: true,
      status: true,
      totalTokens: true,
      estimatedCostMicros: true,
      createdAt: true,
      attempts: { select: { id: true } },
    },
  });

  let guestRoutingLogsDeleted = 0;
  for (const request of guestRoutingLogs) {
    const metadata: Prisma.InputJsonObject = {
      feature: request.feature,
      status: String(request.status),
      createdAt: request.createdAt.toISOString(),
      totalTokens: request.totalTokens,
      estimatedCostMicros: request.estimatedCostMicros,
      attemptCount: request.attempts.length,
    };

    await client.$transaction(async (tx) => {
      const retentionTx = tx as RetentionDb;
      await retentionTx.deletionLog.create({
        data: {
          category: RETENTION_POLICY.routingLogs.category,
          action: "DELETE",
          targetType: "AIRequest",
          targetId: request.id,
          policy: "routing_logs_guest_72h_delete",
          reason: "anonymous_unpaid_routing_log_ttl_elapsed",
          metadata,
          occurredAt: now,
        },
      });
      await retentionTx.aIRequest.delete({ where: { id: request.id } });
    });
    guestRoutingLogsDeleted++;
  }

  const securityAuditLogs = await client.auditLog.findMany({
    where: {
      createdAt: { lte: cutoffs.securityLogBefore },
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
    },
  });

  let securityAuditLogsDeleted = 0;
  if (securityAuditLogs.length > 0) {
    const actionCounts = securityAuditLogs.reduce<Record<string, number>>((acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    }, {});
    const metadata: Prisma.InputJsonObject = {
      count: securityAuditLogs.length,
      actionCounts,
      oldestCreatedAt: securityAuditLogs[0]?.createdAt.toISOString() ?? null,
      newestCreatedAt: securityAuditLogs[securityAuditLogs.length - 1]?.createdAt.toISOString() ?? null,
    };

    await client.$transaction(async (tx) => {
      const retentionTx = tx as RetentionDb;
      await retentionTx.deletionLog.create({
        data: {
          category: RETENTION_POLICY.securityLogs.category,
          action: "DELETE",
          targetType: "AuditLog",
          targetId: null,
          policy: "security_logs_12mo_delete",
          reason: "security_log_retention_elapsed",
          metadata,
          occurredAt: now,
        },
      });
      const result = await retentionTx.auditLog.deleteMany({
        where: { id: { in: securityAuditLogs.map((row) => row.id) } },
      });
      securityAuditLogsDeleted = result.count;
    });
  }

  const guestDialogueCleanup = await cleanupExpiredGuestDialogues({ now, limit });

  return {
    usersAnonymized,
    guestRoutingLogsDeleted,
    securityAuditLogsDeleted,
    guestDialogueCleanup,
    cutoffs: {
      accountAnonymizeBefore: cutoffs.accountAnonymizeBefore.toISOString(),
      guestRoutingLogBefore: cutoffs.guestRoutingLogBefore.toISOString(),
      securityLogBefore: cutoffs.securityLogBefore.toISOString(),
    },
    timestamp: now.toISOString(),
  };
}

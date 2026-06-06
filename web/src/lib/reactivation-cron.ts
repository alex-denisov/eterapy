import type { Job } from "@prisma/client";
import db from "@/lib/db";
import { NOTIFICATION_DELIVERY_JOB_TYPE } from "@/lib/notification-delivery";
import { notify } from "@/lib/notifications";
import type { NotifEvent } from "@/lib/notification-events";
import type { JobResult } from "@/lib/job-queue";
import { log } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CAP_DAYS = 7;
const MOMENT_OF_NEED_CAP_DAYS = 14;

function jobNow(job: Job) {
  const payload = job.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "requestedAt" in payload) {
    const requestedAt = payload.requestedAt;
    if (typeof requestedAt === "string") return new Date(requestedAt);
  }
  return new Date();
}

function dayStartUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysUntil(date: Date, now: Date) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

export function reactivationDailyDedupeKey(event: NotifEvent, userId: string, now: Date) {
  return `reactivation:${event}:${userId}:${now.toISOString().slice(0, 10)}`;
}

async function recentlyQueued(input: {
  event: NotifEvent;
  userId: string;
  now: Date;
  capDays?: number;
}) {
  const since = new Date(input.now.getTime() - (input.capDays ?? DEFAULT_CAP_DAYS) * DAY_MS);
  const existing = await db.job.findFirst({
    where: {
      queue: "default",
      type: NOTIFICATION_DELIVERY_JOB_TYPE,
      idempotencyKey: {
        startsWith: `reactivation:${input.event}:${input.userId}:`,
      },
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function notifyWithCap(input: {
  userId: string;
  event: NotifEvent;
  data: Record<string, string>;
  now: Date;
  capDays?: number;
}) {
  if (await recentlyQueued(input)) return false;
  await notify({
    userId: input.userId,
    event: input.event,
    data: input.data,
    dedupeKey: reactivationDailyDedupeKey(input.event, input.userId, input.now),
  });
  return true;
}

export async function runCreditsExpiringJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const windowStart = addDays(dayStartUTC(now), 2);
  const windowEnd = addDays(dayStartUTC(now), 4);
  const entries = await db.clarityCreditLedgerEntry.findMany({
    where: {
      amount: { gt: 0 },
      status: { in: ["pending", "confirmed"] },
      expiresAt: {
        gte: windowStart,
        lt: windowEnd,
      },
    },
    select: {
      userId: true,
      amount: true,
      expiresAt: true,
    },
    orderBy: { expiresAt: "asc" },
    take: 5000,
  });

  const grouped = new Map<string, { credits: number; earliest: Date }>();
  for (const entry of entries) {
    if (!entry.expiresAt) continue;
    const current = grouped.get(entry.userId);
    if (current) {
      current.credits += entry.amount;
      if (entry.expiresAt < current.earliest) current.earliest = entry.expiresAt;
      continue;
    }
    grouped.set(entry.userId, { credits: entry.amount, earliest: entry.expiresAt });
  }

  let notified = 0;
  let skippedByCap = 0;
  for (const [userId, item] of grouped) {
    const sent = await notifyWithCap({
      userId,
      event: "CREDITS_EXPIRING",
      now,
      data: {
        credits: String(item.credits),
        days: String(daysUntil(item.earliest, now)),
        expiresAt: item.earliest.toISOString(),
        walletUrl: "/cabinet/wallet",
      },
    });
    if (sent) notified++;
    else skippedByCap++;
  }

  const result = {
    ok: true,
    candidateUsers: grouped.size,
    notified,
    skippedByCap,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    timestamp: now.toISOString(),
  };
  log.info("cron-credits-expiring-completed", { jobId: job.id, ...result });
  return result;
}

export async function runStreakAtRiskJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const today = dayStartUTC(now);
  const yesterday = addDays(today, -1);
  const users = await db.user.findMany({
    where: {
      role: "CLIENT",
      deletedAt: null,
      blockedAt: null,
      practiceStreakCount: { gte: 3 },
      practiceLastDoneDate: {
        gte: yesterday,
        lt: today,
      },
    },
    select: {
      id: true,
      practiceStreakCount: true,
      practiceStreakLongest: true,
      practiceLastDoneDate: true,
    },
    take: 1000,
  });

  let notified = 0;
  let skippedByCap = 0;
  for (const user of users) {
    const sent = await notifyWithCap({
      userId: user.id,
      event: "STREAK_AT_RISK",
      now,
      data: {
        streak: String(user.practiceStreakCount),
        longest: String(user.practiceStreakLongest),
        practiceUrl: "/cabinet/practice",
      },
    });
    if (sent) notified++;
    else skippedByCap++;
  }

  const result = {
    ok: true,
    candidateUsers: users.length,
    notified,
    skippedByCap,
    yesterday: yesterday.toISOString(),
    timestamp: now.toISOString(),
  };
  log.info("cron-streak-at-risk-completed", { jobId: job.id, ...result });
  return result;
}

export async function runMomentOfNeedJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const cutoff = new Date(now.getTime() - MOMENT_OF_NEED_CAP_DAYS * DAY_MS);
  const users = await db.user.findMany({
    where: {
      role: "CLIENT",
      deletedAt: null,
      blockedAt: null,
      createdAt: { lte: cutoff },
      dialogues: { none: { updatedAt: { gt: cutoff } } },
      dailyCards: { none: { createdAt: { gt: cutoff } } },
      productResults: { none: { updatedAt: { gt: cutoff } } },
    },
    select: {
      id: true,
      name: true,
      dialogues: {
        where: {
          deletedAt: null,
          topic: { not: null },
        },
        select: {
          topic: true,
          title: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    take: 1000,
  });

  let notified = 0;
  let skippedByCap = 0;
  let skippedWithoutTopic = 0;
  for (const user of users) {
    const topic = user.dialogues[0]?.topic?.trim();
    if (!topic) {
      skippedWithoutTopic++;
      continue;
    }
    const sent = await notifyWithCap({
      userId: user.id,
      event: "MOMENT_OF_NEED",
      now,
      capDays: MOMENT_OF_NEED_CAP_DAYS,
      data: {
        topic,
        title: user.dialogues[0]?.title ?? "",
        mapUrl: "/cabinet/action-history",
      },
    });
    if (sent) notified++;
    else skippedByCap++;
  }

  const result = {
    ok: true,
    candidateUsers: users.length,
    notified,
    skippedByCap,
    skippedWithoutTopic,
    cutoff: cutoff.toISOString(),
    timestamp: now.toISOString(),
  };
  log.info("cron-moment-of-need-completed", { jobId: job.id, ...result });
  return result;
}

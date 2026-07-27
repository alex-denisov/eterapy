/**
 * INC-063 fix — in-process cron scheduler for the job worker.
 *
 * Root cause found 2026-07-16: nothing on production ever triggered the
 * `/api/cron/*` endpoints (empty crontab, no scheduled GH Actions), so no cron
 * job had EVER been enqueued (last job of any kind 2026-06-08). Soft-deleted
 * accounts were never anonymized, reminders/retention/notifications never ran.
 *
 * Fix: the long-running worker self-enqueues due cron jobs each tick. Every job
 * carries a time-bucketed idempotency key (daily/hourly), so repeated ticks and
 * multiple workers converge to at most one job per bucket — the exact contract
 * the `/api/cron/*` routes already used, now driven from inside the process and
 * independent of any external scheduler.
 *
 * Financial jobs (escrow capture, payout runs) are gated behind
 * `WORKER_CRON_FINANCIAL=1`: enabling the scheduler must not silently replay a
 * month of dormant money movement. Owner enables that deliberately after a
 * backlog review.
 */
import type { Prisma } from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { log } from "@/lib/logger";

type Cadence = "daily" | "hourly";

interface CronSchedule {
  type: string;
  cadence: Cadence;
  /** Idempotency-key prefix used by the existing /api/cron route. */
  keyPrefix: string;
  /** Money-movement job — only scheduled when financial scheduling is enabled. */
  financial?: boolean;
  payload?: (now: Date) => Prisma.InputJsonObject;
}

function dailyBucket(now: Date) {
  return now.toISOString().slice(0, 10);
}
function hourlyBucket(now: Date) {
  return now.toISOString().slice(0, 13);
}
function bucketFor(cadence: Cadence, now: Date) {
  return cadence === "daily" ? dailyBucket(now) : hourlyBucket(now);
}

/**
 * Schedule table. Buckets mirror the `/api/cron/*` routes' idempotency keys so
 * either trigger path stays consistent. Non-financial maintenance jobs are safe
 * to (re)start immediately: each queries a forward time window, so a late first
 * run does not replay stale side effects.
 */
export const CRON_SCHEDULES: CronSchedule[] = [
  // INC-081: страховка за ResultURL. Ежечасно — оплаченный, но не выданный
  // заказ не должен ждать сутки; не «financial», потому что джоб ничего не
  // списывает, а только дочитывает у провайдера уже случившееся.
  { type: "cron.billing-reconcile-pending", cadence: "hourly", keyPrefix: "billing-reconcile-pending" },
  { type: "cron.cleanup-users", cadence: "daily", keyPrefix: "cleanup-users" },
  { type: "cron.booking-reminders", cadence: "hourly", keyPrefix: "booking-reminders" },
  { type: "cron.practitioner-sync", cadence: "daily", keyPrefix: "practitioner-sync" },
  { type: "cron.credits-expiring", cadence: "daily", keyPrefix: "credits-expiring" },
  { type: "cron.streak-at-risk", cadence: "daily", keyPrefix: "streak-at-risk" },
  { type: "cron.moment-of-need", cadence: "daily", keyPrefix: "moment-of-need" },
  { type: "cron.subscription-renewal", cadence: "daily", keyPrefix: "subscription-renewal" },
  // B591 фаза 4: сроки ИП за 10 и за 3 дня. Ежедневно и НЕ financial — джоб
  // ничего не двигает, он только пишет владельцу в Telegram. Под финансовым
  // гейтом напоминания молчали бы ровно там, где нужны.
  { type: "cron.ip-obligation-reminders", cadence: "daily", keyPrefix: "ip-obligation-reminders" },
  // B589 фаза 1: пополнение очереди черновиков постов. Не «financial» и
  // безопасен к позднему первому запуску — джоб только доводит число
  // неопубликованных черновиков до целевого и наружу ничего не отправляет.
  { type: "cron.marketing-generate", cadence: "daily", keyPrefix: "marketing-generate" },
  {
    type: "cron.session-escrow-capture",
    cadence: "hourly",
    keyPrefix: "session-escrow-capture",
    financial: true,
    payload: (now) => ({ requestedAt: now.toISOString() }),
  },
];

export function financialCronEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORKER_CRON_FINANCIAL === "1" || env.WORKER_CRON_FINANCIAL === "true";
}

export interface EnqueueDueCronResult {
  enqueued: string[];
  skippedFinancial: string[];
}

/**
 * Enqueue every cron job whose current time-bucket has not been enqueued yet.
 * Idempotency-key collisions (same bucket) are swallowed by enqueueJob, so this
 * is safe to call frequently and from more than one worker.
 */
export async function enqueueDueCronJobs(
  now: Date = new Date(),
  options: { financialEnabled?: boolean; requestId?: string; queue?: string } = {},
): Promise<EnqueueDueCronResult> {
  const financialEnabled = options.financialEnabled ?? financialCronEnabled();
  // Must match the queue the worker actually polls — cron jobs historically
  // went to a separate "cron" queue that the default worker never claimed.
  const queue = options.queue ?? "default";
  const enqueued: string[] = [];
  const skippedFinancial: string[] = [];

  for (const schedule of CRON_SCHEDULES) {
    if (schedule.financial && !financialEnabled) {
      skippedFinancial.push(schedule.type);
      continue;
    }
    const idempotencyKey = `${schedule.keyPrefix}:${bucketFor(schedule.cadence, now)}`;
    try {
      await enqueueJob({
        queue,
        type: schedule.type,
        payload: schedule.payload?.(now) ?? { requestedAt: now.toISOString() },
        idempotencyKey,
        requestId: options.requestId,
      });
      enqueued.push(schedule.type);
    } catch (err) {
      log.error("cron-scheduler.enqueue_failed", { type: schedule.type, idempotencyKey, err });
    }
  }

  return { enqueued, skippedFinancial };
}

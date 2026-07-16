import type { Job } from "@prisma/client";
import db from "@/lib/db";
import { claimNextJob, completeJob, failJob, releaseStaleJobs, type JobResult } from "@/lib/job-queue";
import { log } from "@/lib/logger";
import { CRON_JOB_HANDLERS } from "@/lib/cron-jobs";
import { enqueueDueCronJobs } from "@/lib/cron-scheduler";
import {
  handleNotificationDeliveryJob,
  NOTIFICATION_DELIVERY_JOB_TYPE,
} from "@/lib/notification-delivery";
import { handleServerSttJob, SERVER_STT_JOB_TYPE } from "@/lib/server-stt";

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_STALE_AFTER_MS = 10 * 60_000;
// INC-063: how often the worker checks whether a cron bucket is due. Cheap —
// idempotency keys make each check a no-op until a new bucket opens.
const CRON_SCHEDULE_TICK_MS = 60_000;

export type JobHandler = (job: Job) => Promise<JobResult | void>;
export type JobHandlers = Record<string, JobHandler>;

export interface ProcessNextJobInput {
  workerId: string;
  queue?: string;
  requestId?: string;
  handlers?: JobHandlers;
}

export interface RunWorkerInput extends ProcessNextJobInput {
  pollMs?: number;
  staleAfterMs?: number;
  shouldStop?: () => boolean;
}

export type ProcessNextJobResult =
  | { status: "idle" }
  | { status: "completed"; jobId: string; type: string }
  | { status: "failed"; jobId: string; type: string; retryable: boolean };

export const JOB_HANDLERS: JobHandlers = {
  "system.noop": async (job) => ({
    ok: true,
    jobId: job.id,
  }),
  [NOTIFICATION_DELIVERY_JOB_TYPE]: handleNotificationDeliveryJob,
  [SERVER_STT_JOB_TYPE]: handleServerSttJob,
  ...CRON_JOB_HANDLERS,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processNextJob(input: ProcessNextJobInput): Promise<ProcessNextJobResult> {
  const handlers = input.handlers ?? JOB_HANDLERS;
  const job = await claimNextJob({
    workerId: input.workerId,
    queue: input.queue,
    requestId: input.requestId,
  });

  if (!job) return { status: "idle" };

  const handler = handlers[job.type];
  try {
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }
    const result = await handler(job);
    await completeJob(job.id, result ?? {}, input.requestId);
    return { status: "completed", jobId: job.id, type: job.type };
  } catch (err) {
    await failJob(job, err, input.requestId);
    return {
      status: "failed",
      jobId: job.id,
      type: job.type,
      retryable: job.attempts < job.maxAttempts,
    };
  }
}

export async function runWorker(input: RunWorkerInput) {
  const pollMs = input.pollMs ?? DEFAULT_POLL_MS;
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const queue = input.queue ?? "default";

  log.info("worker-started", {
    requestId: input.requestId,
    workerId: input.workerId,
    queue,
    pollMs,
    staleAfterMs,
  });

  // INC-063: self-schedule cron jobs from inside the long-running worker so the
  // platform no longer depends on an external crontab/GH-Actions trigger that
  // was never configured on production. Throttled and best-effort.
  let lastCronTickAt = 0;
  async function maybeScheduleCronJobs() {
    const now = Date.now();
    if (now - lastCronTickAt < CRON_SCHEDULE_TICK_MS) return;
    lastCronTickAt = now;
    try {
      const result = await enqueueDueCronJobs(new Date(now), { queue, requestId: input.requestId });
      if (result.enqueued.length > 0) {
        log.info("cron-scheduler-tick", { workerId: input.workerId, enqueued: result.enqueued });
      }
    } catch (err) {
      log.error("cron-scheduler-tick-failed", { workerId: input.workerId, err });
    }
  }

  while (!input.shouldStop?.()) {
    await maybeScheduleCronJobs();
    await releaseStaleJobs(staleAfterMs, input.requestId);
    const result = await processNextJob(input);
    if (result.status === "idle") {
      await sleep(pollMs);
    }
  }

  log.info("worker-stopped", {
    requestId: input.requestId,
    workerId: input.workerId,
    queue,
  });
}

export async function shutdownWorker() {
  await db.$disconnect();
}

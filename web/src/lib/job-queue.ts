import { JobStatus, Prisma, type Job } from "@prisma/client";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

const DEFAULT_QUEUE = "default";
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export type JobPayload = Prisma.InputJsonObject;
export type JobResult = Prisma.InputJsonObject;

export interface EnqueueJobInput {
  type: string;
  payload: JobPayload;
  queue?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
  requestId?: string;
}

export interface ClaimJobInput {
  workerId: string;
  queue?: string;
  now?: Date;
  requestId?: string;
}

export interface QueueStats {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
}

export function retryDelayMs(attempts: number) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** exponent));
}

function asErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function isUniqueConstraintError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function enqueueJob(input: EnqueueJobInput): Promise<Job> {
  const queue = input.queue ?? DEFAULT_QUEUE;
  const data = {
    queue,
    type: input.type,
    payload: input.payload,
    priority: input.priority ?? 0,
    runAfter: input.runAfter ?? new Date(),
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    idempotencyKey: input.idempotencyKey,
  };

  try {
    const job = await db.job.create({ data });
    log.info("job-enqueued", {
      requestId: input.requestId,
      jobId: job.id,
      queue,
      type: input.type,
      priority: data.priority,
      runAfter: data.runAfter.toISOString(),
      idempotent: Boolean(input.idempotencyKey),
    });
    return job;
  } catch (err) {
    if (input.idempotencyKey && isUniqueConstraintError(err)) {
      const existing = await db.job.findFirstOrThrow({
        where: {
          queue,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        },
      });
      log.info("job-enqueue-deduplicated", {
        requestId: input.requestId,
        jobId: existing.id,
        queue,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
      });
      return existing;
    }

    log.error("job-enqueue-failed", {
      requestId: input.requestId,
      queue,
      type: input.type,
      error: serializeError(err),
    });
    throw err;
  }
}

export async function claimNextJob(input: ClaimJobInput): Promise<Job | null> {
  const queue = input.queue ?? DEFAULT_QUEUE;
  const now = input.now ?? new Date();

  const claimed = await db.$queryRaw<{ id: string }[]>`
    WITH next_job AS (
      SELECT id
      FROM jobs
      WHERE queue = ${queue}
        AND status = 'PENDING'::"JobStatus"
        AND run_after <= ${now}
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs
    SET status = 'RUNNING'::"JobStatus",
        locked_at = ${now},
        locked_by = ${input.workerId},
        attempts = attempts + 1,
        started_at = COALESCE(started_at, ${now}),
        updated_at = ${now}
    WHERE id = (SELECT id FROM next_job)
    RETURNING id
  `;

  const jobId = claimed[0]?.id;
  if (!jobId) return null;

  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  log.info("job-claimed", {
    requestId: input.requestId,
    jobId,
    queue,
    type: job.type,
    workerId: input.workerId,
    attempts: job.attempts,
  });
  return job;
}

export async function completeJob(jobId: string, result: JobResult = {}, requestId?: string): Promise<Job> {
  const job = await db.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.SUCCEEDED,
      result,
      error: null,
      lockedAt: null,
      lockedBy: null,
      finishedAt: new Date(),
    },
  });
  log.info("job-completed", { requestId, jobId, queue: job.queue, type: job.type });
  return job;
}

export async function failJob(job: Pick<Job, "id" | "queue" | "type" | "attempts" | "maxAttempts">, err: unknown, requestId?: string): Promise<Job> {
  const now = new Date();
  const willRetry = job.attempts < job.maxAttempts;
  const runAfter = willRetry ? new Date(now.getTime() + retryDelayMs(job.attempts)) : undefined;
  const message = asErrorMessage(err);

  const updated = await db.job.update({
    where: { id: job.id },
    data: {
      status: willRetry ? JobStatus.PENDING : JobStatus.DEAD,
      error: message,
      lockedAt: null,
      lockedBy: null,
      finishedAt: willRetry ? null : now,
      ...(runAfter ? { runAfter } : {}),
    },
  });

  log[willRetry ? "warn" : "error"]("job-failed", {
    requestId,
    jobId: job.id,
    queue: job.queue,
    type: job.type,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    retryAt: runAfter?.toISOString(),
    final: !willRetry,
    error: serializeError(err),
  });
  return updated;
}

export async function releaseStaleJobs(olderThanMs: number, requestId?: string) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await db.job.updateMany({
    where: {
      status: JobStatus.RUNNING,
      lockedAt: { lt: cutoff },
    },
    data: {
      status: JobStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      runAfter: new Date(),
    },
  });
  log.warn("jobs-stale-released", { requestId, count: result.count, olderThanMs });
  return result.count;
}

export async function getQueueStats(queue = DEFAULT_QUEUE): Promise<QueueStats> {
  const grouped = await db.job.groupBy({
    by: ["status"],
    where: { queue },
    _count: { _all: true },
  });

  const stats: QueueStats = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
  };

  for (const row of grouped) {
    if (row.status === JobStatus.PENDING) stats.pending = row._count._all;
    if (row.status === JobStatus.RUNNING) stats.running = row._count._all;
    if (row.status === JobStatus.SUCCEEDED) stats.succeeded = row._count._all;
    if (row.status === JobStatus.FAILED) stats.failed = row._count._all;
    if (row.status === JobStatus.DEAD) stats.dead = row._count._all;
  }

  return stats;
}

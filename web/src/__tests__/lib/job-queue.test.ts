import { JobStatus } from "@prisma/client";
import db from "@/lib/db";
import { completeJob, enqueueJob, failJob, getQueueStats, releaseStaleJobs, retryDelayMs } from "@/lib/job-queue";
import { log } from "@/lib/logger";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      create: jest.fn(),
      findFirstOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("job queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enqueues pending jobs with defaults", async () => {
    (mockDb.job.create as jest.Mock).mockResolvedValue({
      id: "job-1",
      queue: "default",
      type: "email.send",
      status: JobStatus.PENDING,
      priority: 0,
      payload: { userId: "u1" },
      result: null,
      error: null,
      attempts: 0,
      maxAttempts: 3,
      runAfter: new Date("2026-04-28T00:00:00.000Z"),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      finishedAt: null,
      idempotencyKey: null,
      createdAt: new Date("2026-04-28T00:00:00.000Z"),
      updatedAt: new Date("2026-04-28T00:00:00.000Z"),
    });

    const job = await enqueueJob({ type: "email.send", payload: { userId: "u1" } });

    expect(job.id).toBe("job-1");
    expect(mockDb.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        queue: "default",
        type: "email.send",
        payload: { userId: "u1" },
        priority: 0,
        maxAttempts: 3,
      }),
    });
  });

  it("uses exponential retry backoff capped at 15 minutes", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(10)).toBe(15 * 60_000);
  });

  it("returns retryable jobs to pending until max attempts", async () => {
    (mockDb.job.update as jest.Mock).mockResolvedValue({ id: "job-1", status: JobStatus.PENDING });

    await failJob({
      id: "job-1",
      queue: "default",
      type: "email.send",
      attempts: 1,
      maxAttempts: 3,
    }, new Error("provider down"));

    expect(mockDb.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: JobStatus.PENDING,
        error: "provider down",
        lockedAt: null,
        lockedBy: null,
        runAfter: expect.any(Date),
      }),
    });
  });

  it("dead-letters jobs when attempts are exhausted", async () => {
    (mockDb.job.update as jest.Mock).mockResolvedValue({ id: "job-1", status: JobStatus.DEAD });

    await failJob({
      id: "job-1",
      queue: "default",
      type: "email.send",
      attempts: 3,
      maxAttempts: 3,
    }, new Error("still down"));

    expect(mockDb.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: JobStatus.DEAD,
        error: "still down",
        finishedAt: expect.any(Date),
      }),
    });
  });

  it("marks jobs complete with result and clears lock", async () => {
    (mockDb.job.update as jest.Mock).mockResolvedValue({ id: "job-1", status: JobStatus.SUCCEEDED });

    await completeJob("job-1", { sent: true });

    expect(mockDb.job.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: JobStatus.SUCCEEDED,
        result: { sent: true },
        error: null,
        lockedAt: null,
        lockedBy: null,
        finishedAt: expect.any(Date),
      }),
    });
  });

  it("releases stale running jobs", async () => {
    (mockDb.job.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    await expect(releaseStaleJobs(60_000)).resolves.toBe(2);
    expect(mockDb.job.updateMany).toHaveBeenCalledWith({
      where: {
        status: JobStatus.RUNNING,
        lockedAt: { lt: expect.any(Date) },
      },
      data: expect.objectContaining({
        status: JobStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
        runAfter: expect.any(Date),
      }),
    });
  });

  it("stays silent when there was nothing stale to release", async () => {
    // Воркер зовёт это каждые 2 секунды. Безусловный warn давал запись раз в
    // 2 секунды с `count: 0` — предупреждение о том, что ничего не произошло;
    // настоящие warn'ы в таком потоке не видны.
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    (mockDb.job.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(releaseStaleJobs(60_000)).resolves.toBe(0);
    expect(warn).not.toHaveBeenCalledWith("jobs-stale-released", expect.anything());

    (mockDb.job.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    await expect(releaseStaleJobs(60_000)).resolves.toBe(3);
    expect(warn).toHaveBeenCalledWith("jobs-stale-released", expect.objectContaining({ count: 3 }));

    warn.mockRestore();
  });

  it("summarizes queue stats", async () => {
    (mockDb.job.groupBy as jest.Mock).mockResolvedValue([
      { status: JobStatus.PENDING, _count: { _all: 3 } },
      { status: JobStatus.RUNNING, _count: { _all: 1 } },
      { status: JobStatus.DEAD, _count: { _all: 2 } },
    ]);

    await expect(getQueueStats()).resolves.toEqual({
      pending: 3,
      running: 1,
      succeeded: 0,
      failed: 0,
      dead: 2,
    });
  });
});

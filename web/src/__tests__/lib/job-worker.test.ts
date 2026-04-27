import { JobStatus, type Job } from "@prisma/client";
import { claimNextJob, completeJob, failJob } from "@/lib/job-queue";
import { processNextJob } from "@/lib/job-worker";

jest.mock("@/lib/job-queue", () => ({
  __esModule: true,
  claimNextJob: jest.fn(),
  completeJob: jest.fn(),
  failJob: jest.fn(),
  releaseStaleJobs: jest.fn(),
}));

const mockClaimNextJob = claimNextJob as jest.MockedFunction<typeof claimNextJob>;
const mockCompleteJob = completeJob as jest.MockedFunction<typeof completeJob>;
const mockFailJob = failJob as jest.MockedFunction<typeof failJob>;

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    queue: "default",
    type: "system.noop",
    status: JobStatus.RUNNING,
    priority: 0,
    payload: {},
    result: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date("2026-04-28T00:00:00.000Z"),
    lockedAt: new Date("2026-04-28T00:00:00.000Z"),
    lockedBy: "worker-1",
    startedAt: new Date("2026-04-28T00:00:00.000Z"),
    finishedAt: null,
    idempotencyKey: null,
    createdAt: new Date("2026-04-28T00:00:00.000Z"),
    updatedAt: new Date("2026-04-28T00:00:00.000Z"),
    ...overrides,
  };
}

describe("job worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns idle when no job is claimable", async () => {
    mockClaimNextJob.mockResolvedValueOnce(null);

    await expect(processNextJob({ workerId: "worker-1" })).resolves.toEqual({ status: "idle" });
    expect(mockCompleteJob).not.toHaveBeenCalled();
    expect(mockFailJob).not.toHaveBeenCalled();
  });

  it("completes a handled job", async () => {
    mockClaimNextJob.mockResolvedValueOnce(job());
    mockCompleteJob.mockResolvedValueOnce(job({ status: JobStatus.SUCCEEDED }));

    await expect(processNextJob({ workerId: "worker-1" })).resolves.toEqual({
      status: "completed",
      jobId: "job-1",
      type: "system.noop",
    });
    expect(mockCompleteJob).toHaveBeenCalledWith("job-1", { ok: true, jobId: "job-1" }, undefined);
  });

  it("fails unsupported job types through queue retry policy", async () => {
    const unsupported = job({ type: "missing.handler" });
    mockClaimNextJob.mockResolvedValueOnce(unsupported);
    mockFailJob.mockResolvedValueOnce(job({ status: JobStatus.PENDING }));

    await expect(processNextJob({ workerId: "worker-1" })).resolves.toEqual({
      status: "failed",
      jobId: "job-1",
      type: "missing.handler",
      retryable: true,
    });
    expect(mockFailJob).toHaveBeenCalledWith(unsupported, expect.any(Error), undefined);
  });

  it("fails handler errors through queue retry policy", async () => {
    const claimed = job({ type: "custom.fail", attempts: 3, maxAttempts: 3 });
    mockClaimNextJob.mockResolvedValueOnce(claimed);
    mockFailJob.mockResolvedValueOnce(job({ status: JobStatus.DEAD }));

    await expect(processNextJob({
      workerId: "worker-1",
      handlers: {
        "custom.fail": async () => {
          throw new Error("boom");
        },
      },
    })).resolves.toEqual({
      status: "failed",
      jobId: "job-1",
      type: "custom.fail",
      retryable: false,
    });
    expect(mockFailJob).toHaveBeenCalledWith(claimed, expect.any(Error), undefined);
  });
});

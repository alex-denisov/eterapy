/**
 * INC-063 — worker self-scheduler: enqueues due cron jobs to the worker's own
 * queue with time-bucketed idempotency keys, gates financial jobs.
 */
import { enqueueDueCronJobs, CRON_SCHEDULES, financialCronEnabled } from "@/lib/cron-scheduler";
import { enqueueJob } from "@/lib/job-queue";

jest.mock("@/lib/job-queue", () => ({
  __esModule: true,
  enqueueJob: jest.fn(async (input: unknown) => ({ id: "job", status: "PENDING", attempts: 0, ...(input as object) })),
}));

const mockEnqueue = enqueueJob as jest.Mock;

describe("cron scheduler", () => {
  beforeEach(() => mockEnqueue.mockClear());

  it("enqueues all non-financial jobs to the worker queue by default", async () => {
    const result = await enqueueDueCronJobs(new Date("2026-07-16T10:00:00Z"), { queue: "default", financialEnabled: false });
    const nonFinancial = CRON_SCHEDULES.filter((s) => !s.financial);
    expect(result.enqueued).toHaveLength(nonFinancial.length);
    expect(result.skippedFinancial).toContain("cron.session-escrow-capture");
    for (const call of mockEnqueue.mock.calls) {
      expect(call[0].queue).toBe("default");
    }
  });

  it("uses daily and hourly idempotency buckets matching the /api/cron routes", async () => {
    await enqueueDueCronJobs(new Date("2026-07-16T10:30:00Z"), { queue: "default", financialEnabled: true });
    const keys = mockEnqueue.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toContain("cleanup-users:2026-07-16");
    expect(keys).toContain("booking-reminders:2026-07-16T10");
    expect(keys).toContain("session-escrow-capture:2026-07-16T10");
  });

  it("includes financial jobs only when enabled", async () => {
    const off = await enqueueDueCronJobs(new Date(), { queue: "default", financialEnabled: false });
    expect(off.enqueued).not.toContain("cron.session-escrow-capture");
    mockEnqueue.mockClear();
    const on = await enqueueDueCronJobs(new Date(), { queue: "default", financialEnabled: true });
    expect(on.enqueued).toContain("cron.session-escrow-capture");
  });

  it("reads the financial flag from env", () => {
    expect(financialCronEnabled({ WORKER_CRON_FINANCIAL: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(financialCronEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("swallows enqueue errors so one bad job never stops the tick", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("db down"));
    const result = await enqueueDueCronJobs(new Date(), { queue: "default", financialEnabled: false });
    // First schedule failed but the rest still enqueued.
    expect(result.enqueued.length).toBe(CRON_SCHEDULES.filter((s) => !s.financial).length - 1);
  });
});

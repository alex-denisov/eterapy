import type { NextRequest } from "next/server";
import { JobStatus } from "@prisma/client";
import { enqueueJob } from "@/lib/job-queue";
import { GET as dispatchCleanup } from "@/app/api/cron/cleanup/route";
import { GET as dispatchReminders } from "@/app/api/cron/reminders/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

jest.mock("@/lib/job-queue", () => ({
  __esModule: true,
  enqueueJob: jest.fn(),
}));

const mockEnqueueJob = enqueueJob as jest.MockedFunction<typeof enqueueJob>;

function request(path: string, token = "cron-secret") {
  return new Request(`https://eterapy.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      [REQUEST_ID_HEADER]: "cron-request-123",
    },
  }) as NextRequest;
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    queue: "cron",
    type: "cron.booking-reminders",
    status: JobStatus.PENDING,
    priority: 0,
    payload: {},
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date("2026-04-28T01:00:00.000Z"),
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    idempotencyKey: null,
    createdAt: new Date("2026-04-28T01:00:00.000Z"),
    updatedAt: new Date("2026-04-28T01:00:00.000Z"),
    ...overrides,
  };
}

describe("cron dispatchers", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-04-28T01:07:30.000Z").getTime());
    process.env.CRON_SECRET = "cron-secret";
    mockEnqueueJob.mockResolvedValue(job());
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    jest.useRealTimers();
  });

  it("enqueues reminder jobs with a stable 15-minute idempotency key", async () => {
    const first = await dispatchReminders(request("/api/cron/reminders"));
    const second = await dispatchReminders(request("/api/cron/reminders"));

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(2);
    expect(mockEnqueueJob).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queue: "cron",
      type: "cron.booking-reminders",
      idempotencyKey: "booking-reminders:2026-04-28T01:00:00.000Z",
      requestId: "cron-request-123",
    }));
    expect(mockEnqueueJob).toHaveBeenNthCalledWith(2, expect.objectContaining({
      idempotencyKey: "booking-reminders:2026-04-28T01:00:00.000Z",
    }));
  });

  it("enqueues cleanup jobs with a daily idempotency key", async () => {
    mockEnqueueJob.mockResolvedValueOnce(job({ type: "cron.cleanup-users" }));

    const response = await dispatchCleanup(request("/api/cron/cleanup"));
    jest.useRealTimers();
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.enqueued).toBe(true);
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      queue: "cron",
      type: "cron.cleanup-users",
      idempotencyKey: "cleanup-users:2026-04-28",
    }));
  });

  it("rejects cron calls with an invalid secret", async () => {
    const response = await dispatchReminders(request("/api/cron/reminders", "wrong"));
    jest.useRealTimers();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("fails closed in production when CRON_SECRET is missing", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.CRON_SECRET = "";

    const response = await dispatchCleanup(new Request("https://eterapy.com/api/cron/cleanup", {
      headers: { [REQUEST_ID_HEADER]: "cron-request-123" },
    }) as NextRequest);
    jest.useRealTimers();
    const body = await response.json();

    process.env.NODE_ENV = originalNodeEnv;

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});

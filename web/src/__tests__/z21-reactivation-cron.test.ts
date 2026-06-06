import fs from "node:fs";
import path from "node:path";
import { JobStatus } from "@prisma/client";
import {
  reactivationDailyDedupeKey,
  runCreditsExpiringJob,
  runMomentOfNeedJob,
  runStreakAtRiskJob,
} from "@/lib/reactivation-cron";
import { notify } from "@/lib/notifications";
import db from "@/lib/db";

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    clarityCreditLedgerEntry: { findMany: jest.fn() },
    job: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const mockNotify = notify as jest.MockedFunction<typeof notify>;
const mockDb = db as unknown as {
  clarityCreditLedgerEntry: { findMany: jest.Mock };
  job: { findFirst: jest.Mock };
  user: { findMany: jest.Mock };
};

function job(payload: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    queue: "cron",
    type: "cron.credits-expiring",
    status: JobStatus.PENDING,
    priority: 0,
    payload,
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date("2026-06-06T17:00:00.000Z"),
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    idempotencyKey: null,
    createdAt: new Date("2026-06-06T17:00:00.000Z"),
    updatedAt: new Date("2026-06-06T17:00:00.000Z"),
  };
}

describe("Y10 Z21 reactivation cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify.mockResolvedValue(undefined);
    mockDb.job.findFirst.mockResolvedValue(null);
  });

  it("adds five reactivation notification events across schema, migration, delivery, email, and bell", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260606180000_add_reactivation_notification_events/migration.sql");
    const events = source("src/lib/notification-events.ts");
    const delivery = source("src/lib/notification-delivery.ts");
    const email = source("src/lib/email-send.ts");
    const bell = source("src/components/notification-bell.tsx");

    for (const event of [
      "CREDITS_EXPIRING",
      "STREAK_AT_RISK",
      "MOMENT_OF_NEED",
      "WELCOME_CREDITS",
      "WELCOME_CREDITS_REMINDER",
    ]) {
      expect(schema).toContain(event);
      expect(migration).toContain(event);
      expect(events).toContain(event);
      expect(delivery).toContain(event);
      expect(email).toContain(event);
      expect(bell).toContain(event);
    }
  });

  it("keeps reactivation delivery idempotent by day and capped by recent delivery jobs", async () => {
    const now = new Date("2026-06-06T17:00:00.000Z");
    expect(reactivationDailyDedupeKey("CREDITS_EXPIRING", "user-1", now))
      .toBe("reactivation:CREDITS_EXPIRING:user-1:2026-06-06");

    mockDb.clarityCreditLedgerEntry.findMany.mockResolvedValue([
      { userId: "user-1", amount: 2, expiresAt: new Date("2026-06-08T12:00:00.000Z") },
      { userId: "user-1", amount: 1, expiresAt: new Date("2026-06-09T12:00:00.000Z") },
      { userId: "user-2", amount: 5, expiresAt: new Date("2026-06-08T12:00:00.000Z") },
    ]);
    mockDb.job.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-delivery" });

    await expect(runCreditsExpiringJob(job({ requestedAt: now.toISOString() }) as never))
      .resolves.toEqual(expect.objectContaining({ notified: 1, skippedByCap: 1, candidateUsers: 2 }));

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      event: "CREDITS_EXPIRING",
      dedupeKey: "reactivation:CREDITS_EXPIRING:user-1:2026-06-06",
      data: expect.objectContaining({
        credits: "3",
        days: "2",
      }),
    }));
  });

  it("notifies users whose practice streak is at risk after yesterday", async () => {
    const now = new Date("2026-06-06T17:00:00.000Z");
    mockDb.user.findMany.mockResolvedValue([
      { id: "user-1", practiceStreakCount: 4, practiceStreakLongest: 8, practiceLastDoneDate: new Date("2026-06-05T10:00:00.000Z") },
    ]);

    await expect(runStreakAtRiskJob(job({ requestedAt: now.toISOString() }) as never))
      .resolves.toEqual(expect.objectContaining({ notified: 1, candidateUsers: 1 }));

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      event: "STREAK_AT_RISK",
      dedupeKey: "reactivation:STREAK_AT_RISK:user-1:2026-06-06",
      data: expect.objectContaining({ streak: "4" }),
    }));
  });

  it("sends moment-of-need nudges to inactive clients using their saved dialogue topic", async () => {
    const now = new Date("2026-06-06T17:00:00.000Z");
    mockDb.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Анна",
        dialogues: [{ topic: "отношения", title: "Что делать дальше?" }],
      },
    ]);

    await expect(runMomentOfNeedJob(job({ requestedAt: now.toISOString() }) as never))
      .resolves.toEqual(expect.objectContaining({ notified: 1, candidateUsers: 1 }));

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      event: "MOMENT_OF_NEED",
      dedupeKey: "reactivation:MOMENT_OF_NEED:user-1:2026-06-06",
      data: expect.objectContaining({
        topic: "отношения",
      }),
    }));
  });

  it("registers three reactivation cron routes and worker handlers", () => {
    const cronJobs = source("src/lib/cron-jobs.ts");
    const status = source("src/lib/admin-system-status.ts");

    for (const type of ["cron.credits-expiring", "cron.streak-at-risk", "cron.moment-of-need"]) {
      expect(cronJobs).toContain(type);
    }
    for (const route of ["/api/cron/credits-expiring", "/api/cron/streak-at-risk", "/api/cron/moment-of-need"]) {
      expect(status).toContain(route);
    }
  });
});

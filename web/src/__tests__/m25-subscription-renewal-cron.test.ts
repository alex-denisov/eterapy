import fs from "node:fs";
import path from "node:path";
import { JobStatus } from "@prisma/client";
import { runSubscriptionRenewalRemindersJob, CRON_JOB_HANDLERS } from "@/lib/cron-jobs";
import { notify } from "@/lib/notifications";
import db from "@/lib/db";

// B348 / Механика 1 — 3-day subscription auto-renewal reminder.

jest.mock("@/lib/notifications", () => ({ __esModule: true, notify: jest.fn() }));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSubscription: { findMany: jest.fn(), update: jest.fn() },
  },
}));

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const mockNotify = notify as jest.MockedFunction<typeof notify>;
const mockDb = db as unknown as {
  userSubscription: { findMany: jest.Mock; update: jest.Mock };
};

const NOW = "2026-06-09T12:00:00.000Z";

function job(payload: Record<string, unknown> = { requestedAt: NOW }) {
  return {
    id: "job-1",
    queue: "cron",
    type: "cron.subscription-renewal",
    status: JobStatus.PENDING,
    priority: 0,
    payload,
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date(NOW),
    lockedAt: null,
    lockedBy: null,
    startedAt: null,
    finishedAt: null,
    idempotencyKey: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify.mockResolvedValue(undefined);
  mockDb.userSubscription.update.mockResolvedValue({});
});

describe("runSubscriptionRenewalRemindersJob", () => {
  it("reminds an active subscription renewing in ~3 days and stamps renewalReminderAt", async () => {
    mockDb.userSubscription.findMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        planKey: "plus",
        currentPeriodStart: new Date("2026-05-12T12:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-12T12:00:00.000Z"),
        renewalReminderAt: null,
      },
    ]);

    const result = await runSubscriptionRenewalRemindersJob(job() as never);

    expect(result.remindersSent).toBe(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const call = mockNotify.mock.calls[0][0];
    expect(call.event).toBe("SUBSCRIPTION_RENEWAL");
    expect(call.userId).toBe("user-1");
    expect(call.data).toMatchObject({ planKey: "plus", planLabel: "Plus", amountRub: "490" });
    expect(mockDb.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { renewalReminderAt: new Date(NOW) },
    });
  });

  it("does NOT remind twice in the same period (already reminded after period start)", async () => {
    mockDb.userSubscription.findMany.mockResolvedValue([
      {
        id: "sub-2",
        userId: "user-2",
        planKey: "premium",
        currentPeriodStart: new Date("2026-05-12T12:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-12T12:00:00.000Z"),
        renewalReminderAt: new Date("2026-06-09T06:00:00.000Z"), // already reminded this period
      },
    ]);

    const result = await runSubscriptionRenewalRemindersJob(job() as never);

    expect(result.remindersSent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockDb.userSubscription.update).not.toHaveBeenCalled();
  });

  it("re-reminds when the stale renewalReminderAt is from a PREVIOUS period", async () => {
    mockDb.userSubscription.findMany.mockResolvedValue([
      {
        id: "sub-3",
        userId: "user-3",
        planKey: "premium",
        currentPeriodStart: new Date("2026-05-12T12:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-12T12:00:00.000Z"),
        renewalReminderAt: new Date("2026-05-09T12:00:00.000Z"), // last month's reminder
      },
    ]);

    const result = await runSubscriptionRenewalRemindersJob(job() as never);

    expect(result.remindersSent).toBe(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("queries only active, non-cancelling subscriptions in the 3-day window", async () => {
    mockDb.userSubscription.findMany.mockResolvedValue([]);
    await runSubscriptionRenewalRemindersJob(job() as never);

    const where = mockDb.userSubscription.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["ACTIVE", "TRIALING"] });
    expect(where.cancelAtPeriodEnd).toBe(false);
    // window centered on now + 3 days
    const gte = where.currentPeriodEnd.gte as Date;
    const lt = where.currentPeriodEnd.lt as Date;
    const now = new Date(NOW).getTime();
    expect(gte.getTime()).toBe(now + 2.5 * 24 * 3600 * 1000);
    expect(lt.getTime()).toBe(now + 3.5 * 24 * 3600 * 1000);
  });

  it("is registered in CRON_JOB_HANDLERS", () => {
    expect(CRON_JOB_HANDLERS["cron.subscription-renewal"]).toBeDefined();
  });
});

describe("B348 wiring across files", () => {
  it("SUBSCRIPTION_RENEWAL exists in events, delivery, email defaults, and a cron route + migration", () => {
    const events = source("src/lib/notification-events.ts");
    const delivery = source("src/lib/notification-delivery.ts");
    const route = source("src/app/api/cron/subscription-renewal/route.ts");
    const migration = source("prisma/migrations/20260609130000_add_subscription_renewal_reminder/migration.sql");
    const schema = source("prisma/schema.prisma");
    const status = source("src/lib/admin-system-status.ts");

    expect(events).toContain("SUBSCRIPTION_RENEWAL");
    // email-forced: present in the default-email list
    expect(events).toMatch(/DEFAULT_EMAIL_EVENTS[\s\S]*SUBSCRIPTION_RENEWAL/);
    expect(delivery).toContain("SUBSCRIPTION_RENEWAL");
    expect(route).toContain("cron.subscription-renewal");
    expect(migration).toContain("renewalReminderAt");
    expect(schema).toContain("renewalReminderAt");
    expect(status).toContain("/api/cron/subscription-renewal");
  });
});

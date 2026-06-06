import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  COMMISSION_BY_PLAN,
  resolveEffectiveCommission,
  syncPractitionerCommission,
  syncPractitionerCommissions,
} from "@/lib/practitioner-commission";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    practitioner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSubscription: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const mockDb = db as unknown as {
  practitioner: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  userSubscription: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("Z12 practitioner commission ladder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
  });

  it("defines the founder-approved 35/30/25 ladder", () => {
    expect(COMMISSION_BY_PLAN).toEqual({
      practitioner_pro: 30,
      practitioner_pro_plus: 25,
    });
    expect(resolveEffectiveCommission({ baseCommissionPercent: 35 })).toEqual({
      percent: 35,
      source: "base",
      activePlanKey: null,
    });
    expect(resolveEffectiveCommission({
      baseCommissionPercent: 35,
      activePlanKey: "practitioner_pro",
    })).toEqual({
      percent: 30,
      source: "subscription_pro",
      activePlanKey: "practitioner_pro",
    });
    expect(resolveEffectiveCommission({
      baseCommissionPercent: 35,
      activePlanKey: "practitioner_pro_plus",
    })).toEqual({
      percent: 25,
      source: "subscription_pro_plus",
      activePlanKey: "practitioner_pro_plus",
    });
  });

  it("does not worsen individual low base rates and lets override win", () => {
    expect(resolveEffectiveCommission({
      baseCommissionPercent: 15,
      activePlanKey: "practitioner_pro",
    })).toEqual({
      percent: 15,
      source: "base",
      activePlanKey: "practitioner_pro",
    });
    expect(resolveEffectiveCommission({
      baseCommissionPercent: 35,
      commissionOverride: 12,
      activePlanKey: "practitioner_pro_plus",
    })).toEqual({
      percent: 12,
      source: "override",
      activePlanKey: "practitioner_pro_plus",
    });
  });

  it("syncs one practitioner from active subscription state", async () => {
    mockDb.practitioner.findUnique.mockResolvedValueOnce({
      id: "pr-1",
      userId: "user-1",
      baseCommissionPercent: 35,
      commissionOverride: null,
    });
    mockDb.userSubscription.findMany.mockResolvedValueOnce([
      { planKey: "practitioner_pro", currentPeriodEnd: new Date("2026-07-01T00:00:00.000Z") },
    ]);
    mockDb.practitioner.update.mockResolvedValueOnce({
      id: "pr-1",
      commissionPercent: 30,
      commissionSource: "subscription_pro",
    });

    await syncPractitionerCommission("pr-1", mockDb as never, new Date("2026-06-06T00:00:00.000Z"));

    expect(mockDb.practitioner.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pr-1" },
      data: expect.objectContaining({
        commissionPercent: 30,
        commissionSource: "subscription_pro",
        commissionSyncedAt: expect.any(Date),
      }),
    }));
  });

  it("batch syncs all practitioners for the nightly cron", async () => {
    mockDb.practitioner.findMany.mockResolvedValueOnce([
      { id: "pr-1", userId: "u1", baseCommissionPercent: 35, commissionOverride: null },
      { id: "pr-2", userId: "u2", baseCommissionPercent: 35, commissionOverride: 20 },
    ]);
    mockDb.userSubscription.findMany.mockResolvedValueOnce([
      { userId: "u1", planKey: "practitioner_pro_plus", currentPeriodEnd: null },
    ]);
    mockDb.practitioner.update.mockResolvedValue({});

    await expect(syncPractitionerCommissions(mockDb as never)).resolves.toEqual({ synced: 2 });
    expect(mockDb.practitioner.findUnique).not.toHaveBeenCalled();
    expect(mockDb.userSubscription.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.userSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: ["u1", "u2"] } }),
    }));
    expect(mockDb.practitioner.update).toHaveBeenCalledTimes(2);
  });

  it("persists schema, backfill, hooks, and snapshot contracts", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260606114500_add_practitioner_commission_ladder/migration.sql");
    const entitlements = source("src/lib/entitlements.ts");
    const startFromEarnings = source("src/app/api/practitioner/subscriptions/start-from-earnings/route.ts");
    const subscriptionsRoute = source("src/app/api/billing/subscriptions/route.ts");
    const cronRoute = source("src/app/api/cron/practitioner-sync/route.ts");
    const cronJobs = source("src/lib/cron-jobs.ts");
    const sessionComplete = source("src/lib/session-complete.ts");

    expect(schema).toContain("baseCommissionPercent");
    expect(schema).toContain("commissionOverride");
    expect(schema).toContain("commissionSource");
    expect(schema).toContain("commissionSyncedAt");
    expect(schema).toContain("commissionPercentApplied");
    expect(migration).toContain("baseCommissionPercent");
    expect(migration).toContain("commissionPercentApplied");
    expect(migration).toContain("\"commissionPercent\" = 35");
    expect(entitlements).toContain("syncPractitionerCommissionForUser");
    expect(startFromEarnings).toContain("syncPractitionerCommission");
    expect(subscriptionsRoute).toContain("syncPractitionerCommissionForUser");
    expect(cronRoute).toContain("cron.practitioner-sync");
    expect(cronJobs).toContain("runPractitionerCommissionSyncJob");
    expect(sessionComplete).toContain("commissionPercentApplied");
    expect(sessionComplete).toContain("commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35");
  });
});

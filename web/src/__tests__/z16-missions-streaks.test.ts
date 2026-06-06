import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  ONBOARDING_MISSIONS,
  completeMission,
  listMissionChecklist,
} from "@/lib/missions";
import {
  STREAK_REWARDS,
  bumpPracticeStreak,
} from "@/lib/streaks";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    missionProgress: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    clarityCreditLedgerEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    productEntitlement: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const mockDb = db as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  missionProgress: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  clarityCreditLedgerEntry: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  productEntitlement: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("Y10 Z16 missions and streaks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
    mockDb.clarityCreditLedgerEntry.findMany.mockResolvedValue([]);
  });

  it("defines five onboarding missions worth 10 credits total", () => {
    expect(ONBOARDING_MISSIONS.map((mission) => mission.key)).toEqual([
      "complete_profile",
      "first_practice",
      "first_dialogue",
      "first_product",
      "enable_notifications",
    ]);
    expect(ONBOARDING_MISSIONS.every((mission) => mission.rewardCredits === 2)).toBe(true);
    expect(ONBOARDING_MISSIONS.reduce((sum, mission) => sum + mission.rewardCredits, 0)).toBe(10);
  });

  it("lists a cabinet checklist by merging static mission definitions with persisted progress", async () => {
    mockDb.missionProgress.findMany.mockResolvedValueOnce([
      {
        missionKey: "first_practice",
        status: "COMPLETED",
        progress: 1,
        target: 1,
        completedAt: new Date("2026-06-06T09:00:00.000Z"),
        rewardGrantedAt: new Date("2026-06-06T09:00:00.000Z"),
      },
    ]);

    await expect(listMissionChecklist("user-1", mockDb as never)).resolves.toMatchObject({
      completedCount: 1,
      totalCount: 5,
      earnedCredits: 2,
      totalRewardCredits: 10,
      items: expect.arrayContaining([
        expect.objectContaining({
          key: "first_practice",
          completed: true,
          rewardCredits: 2,
        }),
        expect.objectContaining({
          key: "first_dialogue",
          completed: false,
          rewardCredits: 2,
        }),
      ]),
    });
  });

  it("completes a mission once and grants expiring mission credits idempotently", async () => {
    const now = new Date("2026-06-06T09:00:00.000Z");
    mockDb.missionProgress.findUnique.mockResolvedValueOnce(null);
    mockDb.missionProgress.create.mockResolvedValueOnce({
      id: "mp-1",
      missionKey: "first_practice",
      status: "COMPLETED",
      progress: 1,
      target: 1,
      completedAt: now,
      rewardGrantedAt: now,
    });
    mockDb.clarityCreditLedgerEntry.findFirst.mockResolvedValueOnce(null);
    mockDb.clarityCreditLedgerEntry.create.mockResolvedValueOnce({ id: "credit-1" });

    await expect(completeMission({
      userId: "user-1",
      missionKey: "first_practice",
      now,
      tx: mockDb as never,
    })).resolves.toMatchObject({ completed: true, rewardGranted: true });

    expect(mockDb.missionProgress.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        missionKey: "first_practice",
        status: "COMPLETED",
        progress: 1,
        target: 1,
        completedAt: now,
        rewardGrantedAt: now,
      }),
    }));
    expect(mockDb.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: 2,
        source: "mission",
        sourceEventId: "mission:first_practice:user-1",
        status: "confirmed",
        expiresAt: new Date("2026-07-06T09:00:00.000Z"),
      }),
    }));

    jest.clearAllMocks();
    mockDb.missionProgress.findUnique.mockResolvedValueOnce({
      id: "mp-1",
      missionKey: "first_practice",
      status: "COMPLETED",
      progress: 1,
      target: 1,
      completedAt: now,
      rewardGrantedAt: now,
    });

    await expect(completeMission({
      userId: "user-1",
      missionKey: "first_practice",
      now,
      tx: mockDb as never,
    })).resolves.toMatchObject({ completed: true, rewardGranted: false });
    expect(mockDb.clarityCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("bumps practice streaks once per day and rewards 3-day milestones", async () => {
    const now = new Date("2026-06-06T10:00:00.000Z");
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      practiceStreakCount: 2,
      practiceStreakLongest: 2,
      practiceLastDoneDate: new Date("2026-06-05T00:00:00.000Z"),
    });
    mockDb.user.update.mockResolvedValueOnce({
      id: "user-1",
      practiceStreakCount: 3,
      practiceStreakLongest: 3,
      practiceLastDoneDate: new Date("2026-06-06T00:00:00.000Z"),
    });
    mockDb.clarityCreditLedgerEntry.findFirst.mockResolvedValueOnce(null);
    mockDb.clarityCreditLedgerEntry.create.mockResolvedValueOnce({ id: "streak-credit-1" });

    await expect(bumpPracticeStreak({
      userId: "user-1",
      completedAt: now,
      tx: mockDb as never,
    })).resolves.toMatchObject({
      count: 3,
      longest: 3,
      alreadyCounted: false,
      rewardsGranted: [3],
    });

    expect(STREAK_REWARDS[3]).toMatchObject({ creditAmount: 2 });
    expect(mockDb.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({
        practiceStreakCount: 3,
        practiceStreakLongest: 3,
        practiceLastDoneDate: new Date("2026-06-06T00:00:00.000Z"),
      }),
    }));
    expect(mockDb.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: 2,
        source: "streak",
        sourceEventId: "streak:3:user-1",
        expiresAt: new Date("2026-07-06T10:00:00.000Z"),
      }),
    }));
  });

  it("does not move the streak twice on the same day", async () => {
    const now = new Date("2026-06-06T18:00:00.000Z");
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      practiceStreakCount: 3,
      practiceStreakLongest: 3,
      practiceLastDoneDate: new Date("2026-06-06T00:00:00.000Z"),
    });

    await expect(bumpPracticeStreak({
      userId: "user-1",
      completedAt: now,
      tx: mockDb as never,
    })).resolves.toMatchObject({
      count: 3,
      longest: 3,
      alreadyCounted: true,
      rewardsGranted: [],
    });

    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.clarityCreditLedgerEntry.create).not.toHaveBeenCalled();
  });

  it("does not report an already-granted 7-day streak reward as new", async () => {
    const now = new Date("2026-06-06T10:00:00.000Z");
    mockDb.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      practiceStreakCount: 6,
      practiceStreakLongest: 6,
      practiceLastDoneDate: new Date("2026-06-05T00:00:00.000Z"),
    });
    mockDb.user.update.mockResolvedValueOnce({
      id: "user-1",
      practiceStreakCount: 7,
      practiceStreakLongest: 7,
      practiceLastDoneDate: new Date("2026-06-06T00:00:00.000Z"),
    });
    mockDb.clarityCreditLedgerEntry.findFirst.mockResolvedValueOnce({ id: "streak-credit-7" });
    mockDb.productEntitlement.findFirst.mockResolvedValueOnce({ id: "weekly-report-entitlement" });

    await expect(bumpPracticeStreak({
      userId: "user-1",
      completedAt: now,
      tx: mockDb as never,
    })).resolves.toMatchObject({
      count: 7,
      longest: 7,
      alreadyCounted: false,
      rewardsGranted: [],
    });

    expect(mockDb.clarityCreditLedgerEntry.create).not.toHaveBeenCalled();
    expect(mockDb.productEntitlement.create).not.toHaveBeenCalled();
  });

  it("persists schema, migration, route hooks, API, and cabinet badges", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260606143000_add_missions_and_streaks/migration.sql");
    const dailyCardRoute = source("src/app/api/cabinet/daily-card/route.ts");
    const dialoguesRoute = source("src/app/api/dialogues/route.ts");
    const entitlements = source("src/lib/entitlements.ts");
    const notificationPrefsRoute = source("src/app/api/notifications/preferences/route.ts");
    const cabinet = source("src/app/cabinet/page.tsx");
    const practice = source("src/app/cabinet/practice/page.tsx");
    const missionsApi = source("src/app/api/cabinet/missions/route.ts");

    expect(schema).toContain("practiceStreakCount");
    expect(schema).toContain("practiceStreakLongest");
    expect(schema).toContain("practiceLastDoneDate");
    expect(schema).toContain("model MissionProgress");
    expect(schema).toContain("@@unique([userId, missionKey])");
    expect(migration).toContain("mission_progress");
    expect(migration).toContain("practice_streak_count");

    expect(dailyCardRoute).toContain("bumpPracticeStreak");
    expect(dailyCardRoute).toContain('missionKey: "first_practice"');
    expect(dialoguesRoute).toContain('missionKey: "first_dialogue"');
    expect(entitlements).toContain('missionKey: "first_product"');
    expect(notificationPrefsRoute).toContain('missionKey: "enable_notifications"');

    expect(cabinet).toContain("listMissionChecklist");
    expect(cabinet).toContain('data-testid="client-first-steps"');
    expect(cabinet).toContain('data-testid="client-streak-badge"');
    expect(practice).toContain("getPracticeStreakSnapshot");
    expect(practice).toContain('data-testid="practice-streak-badge"');
    expect(missionsApi).toContain("listMissionChecklist");
    expect(missionsApi).toContain("await auth()");
  });
});

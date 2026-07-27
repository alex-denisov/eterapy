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

  it("defines five onboarding missions worth 11 credits total (B464 round-4 #7)", () => {
    expect(ONBOARDING_MISSIONS.map((mission) => mission.key)).toEqual([
      "first_dialogue",
      "first_practice",
      "complete_profile",
      "first_product",
      "invite_shared",
    ]);
    // The referral goal (the K-factor lever) carries the biggest reward.
    expect(ONBOARDING_MISSIONS.find((m) => m.key === "invite_shared")?.rewardCredits).toBe(3);
    expect(ONBOARDING_MISSIONS.reduce((sum, mission) => sum + mission.rewardCredits, 0)).toBe(11);
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
      totalRewardCredits: 11,
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

    expect(STREAK_REWARDS[3]).toMatchObject({ creditAmount: 1 });
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
        // B375: вехи 3/7/14/30; источник остаётся daily_practice, eventId
        // включает день достижения (повторная веха после разрыва — новая награда).
        amount: 1,
        source: "daily_practice",
        sourceEventId: "daily_practice:m3:user-1:2026-06-06",
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
    const practice = source("src/app/cabinet/diary/page.tsx");
    const missionsApi = source("src/app/api/cabinet/missions/route.ts");

    expect(schema).toContain("practiceStreakCount");
    expect(schema).toContain("practiceStreakLongest");
    expect(schema).toContain("practiceLastDoneDate");
    expect(schema).toContain("model MissionProgress");
    expect(schema).toContain("@@unique([userId, missionKey])");
    expect(migration).toContain("mission_progress");
    expect(migration).toContain("practice_streak_count");

    expect(dailyCardRoute).toContain("bumpPracticeStreak");
    // B464 round-4 #7: «Ответить на вопрос дня» completes ONLY in the reflect
    // branch (the user wrote their own question) — exactly one call site.
    expect(dailyCardRoute).toContain('missionKey: "first_practice"');
    expect(dailyCardRoute.split('missionKey: "first_practice"').length - 1).toBe(1);
    expect(dialoguesRoute).toContain('missionKey: "first_dialogue"');
    expect(entitlements).toContain('missionKey: "first_product"');
    // «Настроить уведомления» retired from the goal set.
    expect(notificationPrefsRoute).not.toContain("completeMission");

    expect(cabinet).toContain("listMissionChecklist");
    expect(cabinet).toContain('data-testid="client-first-steps"');
    // B602: «вопрос дня» и бейдж серии целиком переехали на «Дневник» — на
    // Главной они были второй копией того же ритуала.
    expect(cabinet).not.toContain('data-testid="client-streak-badge"');
    expect(practice).toContain("getPracticeStreakSnapshot");
    expect(practice).toContain('data-testid="diary-streak-ring"');
    expect(missionsApi).toContain("listMissionChecklist");
    expect(missionsApi).toContain("await auth()");
  });
});

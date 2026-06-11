import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";

export const STREAK_REWARDS: Record<number, { creditAmount?: number; productKey?: string; validDays?: number; label: string }> = {
  3: { creditAmount: 2, label: "+2 балла за 3 дня" },
  7: { creditAmount: 3, productKey: "weekly-report", validDays: 7, label: "+3 балла и недельный отчёт" },
  30: { productKey: "my-map", validDays: 14, label: "Расширенная карта на 14 дней" },
};

type StreakTx = Pick<Prisma.TransactionClient, "user" | "clarityCreditLedgerEntry" | "productEntitlement">;

function dayStartUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function previousDayUTC(date: Date) {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function grantStreakReward(
  tx: StreakTx,
  input: {
    userId: string;
    milestone: number;
    completedAt: Date;
  },
) {
  const reward = STREAK_REWARDS[input.milestone];
  if (!reward) return false;

  const sourceEventId = `streak:${input.milestone}:${input.userId}`;
  const existingCreditReward = reward.creditAmount
    ? await tx.clarityCreditLedgerEntry.findFirst({
      where: {
        userId: input.userId,
        source: "streak",
        sourceEventId,
        status: { not: "revoked" },
      },
      select: { id: true },
    })
    : null;

  if (reward.creditAmount && !existingCreditReward) {
    await recordClarityCreditEntry(tx as Prisma.TransactionClient, {
      userId: input.userId,
      amount: reward.creditAmount,
      type: "grant",
      source: "streak",
      sourceEventId,
      status: "confirmed",
      expiresAt: creditExpiryFor("streak", input.completedAt),
      metadata: {
        milestone: input.milestone,
        reward: "practice_streak",
      },
    });
  }

  let entitlementGranted = false;
  if (reward.productKey && reward.validDays && "productEntitlement" in tx) {
    const existingEntitlement = await tx.productEntitlement.findFirst({
      where: {
        userId: input.userId,
        productKey: reward.productKey,
        source: "streak",
        transactionId: sourceEventId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!existingEntitlement) {
      await tx.productEntitlement.create({
        data: {
          userId: input.userId,
          productKey: reward.productKey,
          source: "streak",
          status: "ACTIVE",
          transactionId: sourceEventId,
          validFrom: input.completedAt,
          validUntil: addDays(input.completedAt, reward.validDays),
          metadata: {
            milestone: input.milestone,
            reward: "practice_streak",
          } as Prisma.InputJsonObject,
        },
      });
      entitlementGranted = true;
    }
  }

  return Boolean((reward.creditAmount && !existingCreditReward) || entitlementGranted);
}

async function bumpPracticeStreakInTx(
  tx: StreakTx,
  input: {
    userId: string;
    completedAt: Date;
  },
) {
  const completedDay = dayStartUTC(input.completedAt);
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      practiceStreakCount: true,
      practiceStreakLongest: true,
      practiceLastDoneDate: true,
    },
  });
  if (!user) {
    throw new Error("User not found");
  }

  const lastDoneDay = user.practiceLastDoneDate ? dayStartUTC(user.practiceLastDoneDate) : null;
  if (lastDoneDay && lastDoneDay.getTime() === completedDay.getTime()) {
    return {
      count: user.practiceStreakCount,
      longest: user.practiceStreakLongest,
      alreadyCounted: true,
      rewardsGranted: [] as number[],
    };
  }

  const wasYesterday = lastDoneDay
    ? lastDoneDay.getTime() === previousDayUTC(completedDay).getTime()
    : false;
  const nextCount = wasYesterday ? user.practiceStreakCount + 1 : 1;
  const nextLongest = Math.max(user.practiceStreakLongest, nextCount);

  await tx.user.update({
    where: { id: input.userId },
    data: {
      practiceStreakCount: nextCount,
      practiceStreakLongest: nextLongest,
      practiceLastDoneDate: completedDay,
    },
  });

  const rewardsGranted: number[] = [];
  if (STREAK_REWARDS[nextCount]) {
    const granted = await grantStreakReward(tx, {
      userId: input.userId,
      milestone: nextCount,
      completedAt: input.completedAt,
    });
    if (granted) rewardsGranted.push(nextCount);
  }

  return {
    count: nextCount,
    longest: nextLongest,
    alreadyCounted: false,
    rewardsGranted,
  };
}

export async function bumpPracticeStreak(input: {
  userId: string;
  completedAt?: Date;
  tx?: StreakTx;
}) {
  const completedAt = input.completedAt ?? new Date();
  if (input.tx) {
    return bumpPracticeStreakInTx(input.tx, { userId: input.userId, completedAt });
  }

  return db.$transaction((tx) => bumpPracticeStreakInTx(tx, {
    userId: input.userId,
    completedAt,
  }));
}

export async function getPracticeStreakSnapshot(
  userId: string,
  tx: Pick<Prisma.TransactionClient, "user"> = db,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      practiceStreakCount: true,
      practiceStreakLongest: true,
      practiceLastDoneDate: true,
    },
  });

  return {
    count: user?.practiceStreakCount ?? 0,
    longest: user?.practiceStreakLongest ?? 0,
    lastDoneDate: user?.practiceLastDoneDate ?? null,
    nextRewards: Object.entries(STREAK_REWARDS)
      .map(([milestone, reward]) => ({ milestone: Number(milestone), ...reward }))
      .filter((reward) => reward.milestone > (user?.practiceStreakCount ?? 0)),
  };
}

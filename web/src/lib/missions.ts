import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";

export const ONBOARDING_MISSIONS = [
  {
    key: "complete_profile",
    title: "Заполнить профиль",
    description: "Добавьте пару деталей о себе, чтобы разборы и карта были точнее.",
    actionHref: "/cabinet/settings",
    rewardCredits: 2,
  },
  {
    key: "first_practice",
    title: "Завершить первую практику",
    description: "Один вопрос дня, один взгляд со стороны и один маленький шаг.",
    actionHref: "/cabinet/practice",
    rewardCredits: 2,
  },
  {
    key: "first_dialogue",
    title: "Задать первый вопрос",
    description: "Начните с бесплатного разбора, без обязательной покупки.",
    actionHref: "/checkin",
    rewardCredits: 2,
  },
  {
    key: "first_product",
    title: "Открыть первый цифровой формат",
    description: "Попробуйте полную картину, разбор, карту или другой формат из каталога.",
    actionHref: "/products",
    rewardCredits: 2,
  },
  {
    key: "enable_notifications",
    title: "Настроить уведомления",
    description: "Выберите, где получать мягкие напоминания и новости по своим действиям.",
    actionHref: "/cabinet/settings",
    rewardCredits: 2,
  },
] as const;

export type OnboardingMissionKey = typeof ONBOARDING_MISSIONS[number]["key"];

type MissionTx = Pick<Prisma.TransactionClient, "missionProgress" | "clarityCreditLedgerEntry">;

export type MissionChecklistItem = {
  key: OnboardingMissionKey;
  title: string;
  description: string;
  actionHref: string;
  rewardCredits: number;
  progress: number;
  target: number;
  completed: boolean;
  completedAt: Date | null;
  rewardGrantedAt: Date | null;
};

export function getMissionDefinition(missionKey: string) {
  return ONBOARDING_MISSIONS.find((mission) => mission.key === missionKey) ?? null;
}

export async function listMissionChecklist(
  userId: string,
  tx: Pick<Prisma.TransactionClient, "missionProgress"> = db,
) {
  const rows = await tx.missionProgress.findMany({
    where: { userId },
    select: {
      missionKey: true,
      status: true,
      progress: true,
      target: true,
      completedAt: true,
      rewardGrantedAt: true,
    },
  });
  const byKey = new Map(rows.map((row) => [row.missionKey, row]));

  const items: MissionChecklistItem[] = ONBOARDING_MISSIONS.map((mission) => {
    const row = byKey.get(mission.key);
    const completed = row?.status === "COMPLETED" || Boolean(row?.completedAt);
    return {
      key: mission.key,
      title: mission.title,
      description: mission.description,
      actionHref: mission.actionHref,
      rewardCredits: mission.rewardCredits,
      progress: row?.progress ?? 0,
      target: row?.target ?? 1,
      completed,
      completedAt: row?.completedAt ?? null,
      rewardGrantedAt: row?.rewardGrantedAt ?? null,
    };
  });

  return {
    items,
    completedCount: items.filter((item) => item.completed).length,
    totalCount: items.length,
    earnedCredits: items
      .filter((item) => item.rewardGrantedAt)
      .reduce((sum, item) => sum + item.rewardCredits, 0),
    totalRewardCredits: items.reduce((sum, item) => sum + item.rewardCredits, 0),
  };
}

async function completeMissionInTx(
  tx: MissionTx,
  input: {
    userId: string;
    missionKey: OnboardingMissionKey;
    now: Date;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const definition = getMissionDefinition(input.missionKey);
  if (!definition) {
    throw new Error(`Unknown mission: ${input.missionKey}`);
  }

  const existing = await tx.missionProgress.findUnique({
    where: {
      userId_missionKey: {
        userId: input.userId,
        missionKey: input.missionKey,
      },
    },
  });

  if (existing?.completedAt) {
    return { progress: existing, completed: true, rewardGranted: false };
  }

  const existingReward = await tx.clarityCreditLedgerEntry.findFirst({
    where: {
      userId: input.userId,
      source: "mission",
      sourceEventId: `mission:${input.missionKey}:${input.userId}`,
      status: { not: "revoked" },
    },
    select: { id: true },
  });

  const rewardGrantedAt = existingReward ? existing?.rewardGrantedAt ?? null : input.now;
  const data = {
    status: "COMPLETED",
    progress: 1,
    target: 1,
    completedAt: input.now,
    rewardGrantedAt,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  const progress = existing
    ? await tx.missionProgress.update({
      where: { id: existing.id },
      data,
    })
    : await tx.missionProgress.create({
      data: {
        userId: input.userId,
        missionKey: input.missionKey,
        ...data,
      },
    });

  if (!existingReward) {
    await recordClarityCreditEntry(tx as Prisma.TransactionClient, {
      userId: input.userId,
      amount: definition.rewardCredits,
      type: "grant",
      source: "mission",
      sourceEventId: `mission:${input.missionKey}:${input.userId}`,
      status: "confirmed",
      expiresAt: creditExpiryFor("mission", input.now),
      metadata: {
        missionKey: input.missionKey,
        reward: "onboarding_mission_completion",
      },
    });
  }

  return { progress, completed: true, rewardGranted: !existingReward };
}

export async function completeMission(input: {
  userId: string;
  missionKey: OnboardingMissionKey;
  now?: Date;
  metadata?: Prisma.InputJsonValue;
  tx?: MissionTx;
}) {
  const now = input.now ?? new Date();
  if (input.tx) {
    return completeMissionInTx(input.tx, {
      userId: input.userId,
      missionKey: input.missionKey,
      now,
      metadata: input.metadata,
    });
  }

  return db.$transaction((tx) => completeMissionInTx(tx, {
    userId: input.userId,
    missionKey: input.missionKey,
    now,
    metadata: input.metadata,
  }));
}

import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { creditExpiryFor } from "@/lib/credit-expiry";

// B464 round-4 #7 — the onboarding goal set, redesigned around what actually
// grew the fastest engagement/K-factor products (Hamster Kombat: staged
// referral rewards; Duolingo: reward the CORE value action + come-back-tomorrow;
// Revolut: verify the real action, never the page visit):
//   1. every goal completes on a VERIFIED action (API hook), never a page open;
//   2. the title names the exact action, the description names the exact
//      completing condition — no jargon («формат», «практика») without context;
//   3. the referral goal carries the biggest reward — it is the K-factor lever
//      and feeds the B464 win-win economics (баллы придут обоим).
export const ONBOARDING_MISSIONS = [
  {
    key: "first_dialogue",
    title: "Задать первый вопрос",
    description: "Напишите, что вас волнует, — первый разбор бесплатный. Баллы придут, когда разбор начнётся.",
    actionHref: "/checkin",
    rewardCredits: 2,
  },
  {
    key: "first_practice",
    title: "Ответить на вопрос дня",
    description: "Запишите свой вопрос дня своими словами — в ответ придут взгляд дня и маленький шаг. Засчитывается именно запись, не открытие страницы.",
    actionHref: "/cabinet/diary",
    rewardCredits: 2,
  },
  {
    key: "complete_profile",
    title: "Рассказать о себе",
    description: "Заполните «О себе» в настройках: дата рождения и то, что вас интересует, делают разборы точнее. Засчитывается, когда заполнено минимум два поля.",
    actionHref: "/cabinet/settings",
    rewardCredits: 2,
  },
  {
    key: "first_product",
    title: "Открыть платный разбор",
    description: "Потратьте баллы на любое углубление — например, «Переосмысление». Засчитывается сама покупка.",
    actionHref: "/products",
    rewardCredits: 2,
  },
  {
    key: "invite_shared",
    title: "Позвать близкого человека",
    description: "Скопируйте личную ссылку-приглашение или отправьте её в Telegram. Когда друг попробует разбор — баллы придут вам обоим.",
    actionHref: "/cabinet/invite",
    rewardCredits: 3,
  },
] as const;

// The invite mission is completed by a client-reported share action — the API
// route only accepts keys from this whitelist so no other mission can be
// self-completed from the browser.
export const SELF_REPORTABLE_MISSIONS: readonly OnboardingMissionKey[] = ["invite_shared"];

/**
 * «Рассказать о себе» counts only when the saved profile actually carries
 * meaningful personalisation data (≥2 of: дата рождения, место, занятие,
 * интересы, семейное положение) — not on any save (B464 round-4 #7).
 */
export function extendedProfileMissionReady(profile: {
  birthDate?: Date | string | null;
  birthPlace?: string | null;
  occupation?: string | null;
  maritalStatus?: string | null;
  aiGoals?: string[] | null;
}): boolean {
  let filled = 0;
  if (profile.birthDate) filled += 1;
  if (profile.birthPlace?.trim()) filled += 1;
  if (profile.occupation?.trim()) filled += 1;
  if (profile.maritalStatus?.trim()) filled += 1;
  if ((profile.aiGoals?.length ?? 0) > 0) filled += 1;
  return filled >= 2;
}

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

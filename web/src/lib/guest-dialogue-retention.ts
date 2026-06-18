import type { Prisma } from "@prisma/client";
import db from "@/lib/db";

export const GUEST_DIALOGUE_TTL_HOURS = 72;
export const GUEST_DIALOGUE_RESIDENCY = "RU_TEMP";
export const ACCOUNT_DIALOGUE_RESIDENCY = "RU_ACCOUNT";

const HOUR_MS = 60 * 60 * 1000;

export function guestDialogueExpiresAt(now: Date = new Date()) {
  return new Date(now.getTime() + GUEST_DIALOGUE_TTL_HOURS * HOUR_MS);
}

export function buildGuestDialogueRetentionData(input: { userId?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  if (input.userId) {
    return {
      dataResidency: ACCOUNT_DIALOGUE_RESIDENCY,
      expiresAt: null,
    };
  }

  return {
    dataResidency: GUEST_DIALOGUE_RESIDENCY,
    expiresAt: guestDialogueExpiresAt(now),
  };
}

export async function cleanupExpiredGuestDialogues(input: { now?: Date; limit?: number } = {}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 500, 1000));

  const expired = await db.dialogue.findMany({
    where: {
      userId: null,
      guestSessionId: { not: null },
      dataResidency: GUEST_DIALOGUE_RESIDENCY,
      expiresAt: { lte: now },
      deletedAt: null,
    },
    orderBy: [
      { expiresAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      status: true,
      dataResidency: true,
      intakeProductKey: true,
      guestFingerprint: true,
      createdAt: true,
      expiresAt: true,
      _count: { select: { messages: true, productResults: true } },
    },
  });

  let deleted = 0;
  for (const dialogue of expired) {
    const details: Prisma.InputJsonObject = {
      dialogueId: dialogue.id,
      dataResidency: dialogue.dataResidency,
      status: dialogue.status,
      intakeProductKey: dialogue.intakeProductKey,
      createdAt: dialogue.createdAt.toISOString(),
      expiresAt: dialogue.expiresAt?.toISOString() ?? null,
      messageCount: dialogue._count.messages,
      productResultCount: dialogue._count.productResults,
      guestFingerprintPresent: Boolean(dialogue.guestFingerprint),
      deletedReason: "guest_dialogue_ttl_72h",
    };

    await db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: "system:cron.cleanup-users",
          targetId: dialogue.id,
          action: "GUEST_DIALOGUE_TTL_DELETE",
          details: JSON.stringify(details),
        },
      });
      await tx.dialogue.delete({ where: { id: dialogue.id } });
    });
    deleted++;
  }

  return {
    scanned: expired.length,
    deleted,
    timestamp: now.toISOString(),
  };
}

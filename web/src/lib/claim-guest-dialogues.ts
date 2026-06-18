import db from "@/lib/db";
import { ACCOUNT_DIALOGUE_RESIDENCY, GUEST_DIALOGUE_RESIDENCY } from "@/lib/guest-dialogue-retention";

/**
 * B316: claim guest dialogues for a freshly-authenticated user.
 *
 * Flow: an anonymous visitor starts a dialogue → it is persisted with
 * `guestSessionId = <cookie>` and `userId = null`. After they log in,
 * NextAuth issues a session token but does NOT touch the guest cookie,
 * so any dialogue created before login becomes orphaned and invisible
 * in the user's cabinet.
 *
 * This helper runs idempotently at the top of authenticated dialogue
 * endpoints: it reassigns every dialogue owned by the guest session to
 * the user's id and detaches the guest session. Once the sweep is done
 * the caller should clear the guest cookie so we don't run it again on
 * every request.
 */
export async function claimGuestDialoguesForUser(input: {
  userId: string;
  guestSessionId: string;
  now?: Date;
}): Promise<{ claimed: number; skipped: "none" | "missing_input" | "documents_not_accepted" }> {
  const { userId, guestSessionId } = input;
  const now = input.now ?? new Date();
  if (!userId || !guestSessionId) return { claimed: 0, skipped: "missing_input" };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    return { claimed: 0, skipped: "documents_not_accepted" };
  }

  const result = await db.dialogue.updateMany({
    where: {
      guestSessionId,
      userId: null,
      dataResidency: GUEST_DIALOGUE_RESIDENCY,
      expiresAt: { gt: now },
    },
    data: {
      userId,
      guestSessionId: null,
      guestFingerprint: null,
      dataResidency: ACCOUNT_DIALOGUE_RESIDENCY,
      expiresAt: null,
      claimedAt: now,
    },
  });

  return { claimed: result.count, skipped: "none" };
}

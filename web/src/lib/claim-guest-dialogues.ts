import db from "@/lib/db";

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
}): Promise<{ claimed: number }> {
  const { userId, guestSessionId } = input;
  if (!userId || !guestSessionId) return { claimed: 0 };

  const result = await db.dialogue.updateMany({
    where: {
      guestSessionId,
      userId: null,
    },
    data: {
      userId,
      guestSessionId: null,
    },
  });

  return { claimed: result.count };
}

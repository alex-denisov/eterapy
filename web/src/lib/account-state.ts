import type { Session } from "next-auth";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

export type AccountAccessState = "active" | "blocked" | "deleted" | "missing";

export async function getAccountAccessState(userId: string | null | undefined): Promise<AccountAccessState> {
  if (!userId) return "missing";
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { blockedAt: true, deletedAt: true },
    });
    if (!user) return "missing";
    if (user.blockedAt) return "blocked";
    if (user.deletedAt) return "deleted";
    return "active";
  } catch (error) {
    // A thrown DB error (connection blip, pool exhaustion) must not crash
    // the cabinet/admin layout for a user who already holds a valid JWT.
    // Fail open to "active" — the next request re-checks, and genuinely
    // blocked/deleted accounts are still caught once the DB recovers.
    log.warn("account-state.lookup_failed", { userId, error: serializeError(error) });
    return "active";
  }
}

export async function getSessionAccountAccessState(session: Session | null): Promise<AccountAccessState> {
  return getAccountAccessState(session?.user?.id);
}

export function inactiveAccountReason(state: AccountAccessState) {
  if (state === "blocked") return "blocked";
  // Only an explicit soft-delete flag (`deletedAt`) should force a logout.
  // `"missing"` means the row lookup returned null for a session that still
  // carries a valid JWT — under our soft-delete model that is almost always
  // a transient condition (read-replica lag, a momentary connection blip),
  // not a real deletion. Treating it as "deleted" was kicking signed-in
  // users to /login?account=deleted on random section switches, so we no
  // longer log them out for a missing lookup.
  if (state === "deleted") return "deleted";
  return null;
}

import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

// B464 — the staged referral counter «приглашены · попробовали · остались».
// Reads existing ReferralAttribution rows (reward economics live in the
// deferred backend blocks; this is a read-only surface).

export interface ReferralStats {
  /** Registered via the user's link (invited). */
  invited: number;
  /** …and did a meaningful action / first разбор (tried). */
  tried: number;
  /** …and reached the rewarded state (stayed). */
  stayed: number;
}

export interface ReferralStatRow {
  meaningfulActionAt: Date | null;
  rewardGrantedAt: Date | null;
  status: string;
}

// Pure counting so the staging logic is unit-testable without a DB.
export function computeReferralStats(rows: ReadonlyArray<ReferralStatRow>): ReferralStats {
  const invited = rows.length;
  const tried = rows.filter((r) => r.meaningfulActionAt != null).length;
  const stayed = rows.filter((r) => r.rewardGrantedAt != null || r.status === "REWARDED").length;
  return { invited, tried, stayed };
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  try {
    const rows = await db.referralAttribution.findMany({
      where: {
        referrerUserId: userId,
        status: { not: "BLOCKED" },
        referredUserId: { not: null },
      },
      select: { meaningfulActionAt: true, rewardGrantedAt: true, status: true },
    });
    return computeReferralStats(rows);
  } catch (error) {
    log.warn("referral.stats_fallback", { error: serializeError(error) });
    return { invited: 0, tried: 0, stayed: 0 };
  }
}

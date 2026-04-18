/**
 * PAYOUT_SCHEDULED emission (backlog item 4.5).
 *
 * Sends the superadmin payout notification via all enabled channels
 * (currently EMAIL + TELEGRAM; WEB lands with item 5.x). Should be
 * invoked from the 1st/15th payout cron (item 4.4 defined the schedule).
 *
 * Call site does not exist yet — the cron is still stubbed. This helper
 * is the single entry point so that when the cron lands it only needs to
 * invoke `emitPayoutScheduled(...)` without re-deriving preference logic.
 */
import db from "@/lib/db";

interface PayoutSummary {
  date: Date;
  totalRub: number;
  practitionerCount: number;
}

export async function emitPayoutScheduled(summary: PayoutSummary): Promise<void> {
  const superadmins = await db.user.findMany({
    where: { role: "SUPERADMIN" },
    select: { id: true, email: true },
  });

  for (const admin of superadmins) {
    const prefs = await db.notificationPreference.findMany({
      where: { userId: admin.id, event: "PAYOUT_SCHEDULED", enabled: true },
    });
    if (prefs.length === 0) continue;

    for (const p of prefs) {
      // TODO: wire EMAIL / TELEGRAM / WEB dispatchers once notification delivery
      // pipeline is available. For now, log so the cron has a visible trace.
      console.info("[PAYOUT_SCHEDULED] queue", {
        to: admin.email,
        channel: p.channel,
        date: summary.date.toISOString(),
        totalRub: summary.totalRub,
        practitionerCount: summary.practitionerCount,
      });
    }
  }
}

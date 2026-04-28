/**
 * PAYOUT_SCHEDULED emission (backlog item 4.5).
 *
 * Sends the superadmin payout notification through the durable notification
 * delivery pipeline. Should be invoked from the 1st/15th payout cron.
 *
 * Call site does not exist yet — the cron is still stubbed. This helper
 * is the single entry point so that when the cron lands it only needs to
 * invoke `emitPayoutScheduled(...)` without re-deriving preference logic.
 */
import db from "@/lib/db";
import { notify } from "@/lib/notifications";

interface PayoutSummary {
  date: Date;
  totalRub: number;
  practitionerCount: number;
}

export async function emitPayoutScheduled(summary: PayoutSummary): Promise<void> {
  const superadmins = await db.user.findMany({
    where: { role: "SUPERADMIN" },
    select: { id: true },
  });

  for (const admin of superadmins) {
    await notify({
      userId: admin.id,
      event: "PAYOUT_SCHEDULED",
      data: {
        date: summary.date.toISOString(),
        totalRub: String(summary.totalRub),
        practitionerCount: String(summary.practitionerCount),
      },
    });
  }
}

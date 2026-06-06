/**
 * PAYOUT_SCHEDULED emission (backlog item 4.5).
 *
 * Sends the superadmin payout notification through the durable notification
 * delivery pipeline. Invoked from the Z17 payout-run worker after a due run
 * classifies payouts into PROCESSING/HELD.
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

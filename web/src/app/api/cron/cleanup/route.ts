/**
 * GET /api/cron/cleanup
 *
 * Permanently deletes users who requested deletion 10+ days ago.
 * Users are soft-deleted via `deletedAt`; this cron purges them after the grace period.
 *
 * Protection: CRON_SECRET in Authorization header
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const graceDays = 10;
  const cutoffDate = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);

  // Find users where deletedAt is set and deletedAt + 10 days <= now
  const usersToDelete = await db.user.findMany({
    where: {
      deletedAt: {
        lte: cutoffDate,
      },
    },
    select: { id: true, email: true, deletedAt: true },
  });

  let deletedCount = 0;

  for (const user of usersToDelete) {
    // Prisma relations with onDelete: Cascade handle most cleanup,
    // but we explicitly delete to ensure completeness
    await db.user.delete({
      where: { id: user.id },
    });
    deletedCount++;
  }

  return NextResponse.json({
    ok: true,
    deletedCount,
    cutoffDate: cutoffDate.toISOString(),
    timestamp: now.toISOString(),
  });
}

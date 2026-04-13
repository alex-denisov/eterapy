/**
 * GET /api/cabinet/full-readings
 *
 * Returns all full-tier tool sessions for the current user,
 * joined with their corresponding AISessionLog (interpretation).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

const FULL_READING_PRICE_KOPECKS = 29900;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all full-tier tool sessions for the user
  const toolSessions = await db.toolSession.findMany({
    where: {
      userId: session.user.id,
      tier: "full",
    },
    orderBy: { createdAt: "desc" },
  });

  // Match each tool session with its corresponding AISessionLog by tool type and approximate time
  const readings = await Promise.all(
    toolSessions.map(async (ts) => {
      // Find the closest AISessionLog for the same tool, created within ±5 minutes of the tool session
      const log = await db.aISessionLog.findFirst({
        where: {
          userId: session.user.id,
          tool: ts.tool,
          createdAt: {
            gte: new Date(ts.createdAt.getTime() - 5 * 60 * 1000),
            lte: new Date(ts.createdAt.getTime() + 5 * 60 * 1000),
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        id: ts.id,
        tool: ts.tool,
        title: log?.title ?? ts.tool,
        createdAt: ts.createdAt.toISOString(),
        costKopecks: FULL_READING_PRICE_KOPECKS,
        prompt: log?.prompt ?? null,
        result: log?.result ?? "",
      };
    })
  );

  return NextResponse.json({ readings });
}

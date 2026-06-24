import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { sessionId } = await context.params;
  const videoSession = await db.videoSession.findUnique({ where: { id: sessionId }, select: { summaryText: true } });
  if (!videoSession?.summaryText) return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  return new Response(videoSession.summaryText, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

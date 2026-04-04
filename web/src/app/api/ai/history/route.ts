/**
 * GET  /api/ai/history — список сохранённых AI-сессий текущего пользователя
 * DELETE /api/ai/history/[id] — удалить запись
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const tool = req.nextUrl.searchParams.get("tool");

  const logs = await db.aISessionLog.findMany({
    where: {
      userId: session.user.id,
      ...(tool ? { tool: tool as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    select: { id: true, tool: true, title: true, createdAt: true },
  });

  return NextResponse.json({ logs });
}

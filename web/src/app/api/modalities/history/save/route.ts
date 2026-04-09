/** POST /api/modalities/history/save — сохранить результат AI-сессии */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tool, title, prompt, result } = await req.json();
  if (!tool || !result) return NextResponse.json({ error: "tool и result обязательны" }, { status: 400 });

  const log = await db.aISessionLog.create({
    data: {
      userId: session.user.id,
      tool,
      title: title || `${tool} — ${new Date().toLocaleDateString("ru-RU")}`,
      prompt: prompt || null,
      result,
    },
  });

  return NextResponse.json({ ok: true, id: log.id });
}

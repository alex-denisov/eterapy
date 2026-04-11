import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!["ADMIN", "SUPERADMIN"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const targetId = req.nextUrl.searchParams.get("targetId");
  const action = req.nextUrl.searchParams.get("action");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where: {
        ...(targetId ? { targetId } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
      skip: offset,
    }),
    db.auditLog.count({
      where: {
        ...(targetId ? { targetId } : {}),
        ...(action ? { action } : {}),
      },
    }),
  ]);

  return NextResponse.json({ logs, total });
}

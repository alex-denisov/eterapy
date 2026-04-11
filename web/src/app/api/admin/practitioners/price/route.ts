import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "SUPERADMIN"].includes(role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { practitionerId, pricePerSession, sessionDuration } = await req.json();
  if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

  const data: Record<string, number> = {};
  if (pricePerSession !== undefined) data.pricePerSession = Number(pricePerSession);
  if (sessionDuration !== undefined) data.sessionDuration = Number(sessionDuration);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  const updated = await db.practitioner.update({ where: { id: practitionerId }, data });
  return NextResponse.json({ ok: true, practitioner: updated });
}

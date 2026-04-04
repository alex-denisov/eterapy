import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";

function requireAdmin(role: string | undefined) {
  return role === "ADMIN";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") as PractitionerStatus | null;
  const practitioners = await db.practitioner.findMany({
    where: status ? { status } : {},
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ practitioners });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  if (!requireAdmin(session?.user?.role)) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { practitionerId, status } = await req.json();
  if (!practitionerId || !status) return NextResponse.json({ error: "Данные неполны" }, { status: 400 });

  const updated = await db.practitioner.update({
    where: { id: practitionerId },
    data: { status: status as PractitionerStatus },
  });
  return NextResponse.json({ ok: true, practitioner: updated });
}

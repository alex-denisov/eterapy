import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const status = body.status === "ACTIVE" ? "ACTIVE" : "REVOKED";
  const { id } = await params;
  const updated = await db.practitionerInvite.updateMany({
    where: { id, practitionerId: practitioner.id },
    data: { status },
  });
  if (updated.count === 0) return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 });

  return NextResponse.json({ ok: true, status });
}

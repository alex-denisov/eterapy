/** PATCH /api/complaints/[id] — обновить статус жалобы (admin) */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  // @ts-expect-error custom
  const role = session?.user?.role;
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status, resolution } = await req.json();
  const validStatuses = ["OPEN", "REVIEWING", "RESOLVED", "CLOSED"];
  if (!validStatuses.includes(status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });

  await db.complaint.update({
    where: { id },
    data: {
      status,
      resolution: resolution?.trim() || null,
      resolvedBy: session.user!.id,
      resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? new Date() : null,
    },
  });

  await logAudit(session.user!.id!, "COMPLAINT_UPDATED", id, `Статус: ${status}`);
  return NextResponse.json({ ok: true });
}

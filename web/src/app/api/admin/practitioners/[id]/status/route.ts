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
  const { status } = await req.json();
  const valid = ["PENDING", "ACTIVE", "SUSPENDED", "BLOCKED"];
  if (!valid.includes(status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });

  const p = await db.practitioner.update({
    where: { id },
    data: { status },
    select: { userId: true },
  });

  // @ts-expect-error custom
  await logAudit(session.user.id, "PRACTITIONER_STATUS", p.userId, `Статус изменён на ${status}`);

  return NextResponse.json({ ok: true });
}

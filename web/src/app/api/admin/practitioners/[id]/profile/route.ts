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
  const { name, title, bio, experience } = await req.json();

  await db.$transaction(async (tx) => {
    const p = await tx.practitioner.update({
      where: { id },
      data: { title, bio, experience },
      select: { userId: true },
    });
    if (name) {
      await tx.user.update({ where: { id: p.userId }, data: { name } });
    }
    return p;
  });

  const p = await db.practitioner.findUnique({ where: { id }, select: { userId: true } });
  // @ts-expect-error custom
  if (p) await logAudit(session.user.id, "PRACTITIONER_PROFILE_UPDATE", p.userId, `Профиль обновлён администратором`);

  return NextResponse.json({ ok: true });
}

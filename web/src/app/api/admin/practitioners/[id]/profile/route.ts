import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, title, bio, experience, commissionPercent } = body as {
    name?: string;
    title?: string;
    bio?: string;
    experience?: string;
    commissionPercent?: number;
  };

  // Комиссию правит только суперадмин — финансовая настройка.
  if (commissionPercent !== undefined && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Комиссию меняет только SUPERADMIN" }, { status: 403 });
  }
  if (commissionPercent !== undefined) {
    const n = Number(commissionPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "commissionPercent должен быть целым от 0 до 100" }, { status: 400 });
    }
  }

  await db.$transaction(async (tx) => {
    const updateData: {
      title?: string;
      bio?: string;
      experience?: string;
      commissionPercent?: number;
    } = {};
    if (title !== undefined) updateData.title = title;
    if (bio !== undefined) updateData.bio = bio;
    if (experience !== undefined) updateData.experience = experience;
    if (commissionPercent !== undefined) updateData.commissionPercent = commissionPercent;

    const p = await tx.practitioner.update({
      where: { id },
      data: updateData,
      select: { userId: true },
    });
    if (name) {
      await tx.user.update({ where: { id: p.userId }, data: { name } });
    }
    return p;
  });

  const p = await db.practitioner.findUnique({ where: { id }, select: { userId: true } });
  if (p) {
    const note = commissionPercent !== undefined
      ? `Профиль обновлён администратором (комиссия = ${commissionPercent}%)`
      : `Профиль обновлён администратором`;
    await logAudit(session.user.id, "PRACTITIONER_PROFILE_UPDATE", p.userId, note);
  }

  return NextResponse.json({ ok: true });
}

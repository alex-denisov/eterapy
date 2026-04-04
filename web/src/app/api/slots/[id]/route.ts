import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;

  const practitioner = await db.practitioner.findUnique({ where: { userId: session.user!.id } });
  if (!practitioner) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const slot = await db.timeSlot.findUnique({ where: { id } });
  if (!slot || slot.practitionerId !== practitioner.id) {
    return NextResponse.json({ error: "Слот не найден" }, { status: 404 });
  }
  if (!slot.available) {
    return NextResponse.json({ error: "Нельзя удалить занятый слот" }, { status: 400 });
  }

  await db.timeSlot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

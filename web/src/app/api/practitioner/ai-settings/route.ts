/**
 * B434 — настройки AI-разборов практика.
 * PATCH { aiAutoAnalyze: boolean } — глобальный тумблер «делать разбор
 *   автоматически»;
 * PATCH { bookingId, enabled: boolean | null } — per-session разбор on/off
 *   (null = вернуться к глобальному дефолту).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (typeof body?.aiAutoAnalyze === "boolean") {
    await db.practitioner.update({
      where: { id: practitioner.id },
      data: { aiAutoAnalyze: body.aiAutoAnalyze },
    });
    return NextResponse.json({ ok: true, aiAutoAnalyze: body.aiAutoAnalyze });
  }

  if (typeof body?.aiAutoTopup === "boolean") {
    await db.practitioner.update({
      where: { id: practitioner.id },
      data: { aiAutoTopup: body.aiAutoTopup },
    });
    return NextResponse.json({ ok: true, aiAutoTopup: body.aiAutoTopup });
  }

  if (typeof body?.bookingId === "string") {
    const enabled = body?.enabled === null ? null : Boolean(body?.enabled);
    const booking = await db.booking.findUnique({
      where: { id: body.bookingId },
      select: { id: true, practitionerId: true },
    });
    if (!booking || booking.practitionerId !== practitioner.id) {
      return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
    }
    await db.booking.update({
      where: { id: booking.id },
      data: { aiAnalysisEnabled: enabled },
    });
    return NextResponse.json({ ok: true, bookingId: booking.id, enabled });
  }

  return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
}

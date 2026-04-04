import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

/** GET /api/video/session?bookingId=xxx — получить сессию с историей чата */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId обязателен" }, { status: 400 });

  const videoSession = await db.videoSession.findUnique({
    where: { bookingId },
    include: {
      messages: {
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  return NextResponse.json({ session: videoSession });
}

/** PATCH /api/video/session — обновить статус или транскрипт */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { bookingId, status, transcriptText, summaryText } = await req.json();
  if (!bookingId) return NextResponse.json({ error: "bookingId обязателен" }, { status: 400 });

  const updated = await db.videoSession.update({
    where: { bookingId },
    data: {
      ...(status ? { status } : {}),
      ...(transcriptText !== undefined ? { transcriptText } : {}),
      ...(summaryText !== undefined ? { summaryText } : {}),
      ...(status === "ENDED" ? {
        endedAt: new Date(),
        recordingExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      } : {}),
      ...(status === "ACTIVE" ? { startedAt: new Date() } : {}),
    },
  });

  // Если сессия завершена — завершаем booking
  if (status === "ENDED") {
    await db.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED" },
    }).catch(() => {});
    await db.practitioner.updateMany({
      where: { bookings: { some: { id: bookingId } } },
      data: { sessionCount: { increment: 1 } },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, session: updated });
}

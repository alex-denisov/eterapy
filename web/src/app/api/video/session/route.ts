import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";

function scopedBookingWhere(bookingId: string, userId: string) {
  return {
    id: bookingId,
    OR: [
      { clientId: userId },
      { practitioner: { userId } },
    ],
  };
}

/** GET /api/video/session?bookingId=xxx — получить сессию с историей чата */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId обязателен" }, { status: 400 });

  const videoSession = await db.videoSession.findFirst({
    where: {
      bookingId,
      booking: scopedBookingWhere(bookingId, session.user.id),
    },
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

  const videoSession = await db.videoSession.findFirst({
    where: {
      bookingId,
      booking: scopedBookingWhere(bookingId, session.user.id),
    },
    include: {
      booking: { select: { practitioner: { select: { userId: true } } } },
    },
  });
  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });

  const updated = await db.videoSession.update({
    where: { id: videoSession.id },
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

  // Если сессия завершена — завершаем booking единым путём (75% гейт, holds, payout)
  if (status === "ENDED") {
    const isPractitioner = videoSession.booking.practitioner.userId === session.user.id;
    const outcome = await completeBookingAtSessionEnd(bookingId, {
      userId: session.user.id,
      isPractitioner,
    });
    if (outcome.status === "early_end_blocked") {
      const minutesLeft = Math.ceil((outcome.requiredMs - outcome.elapsedMs) / 60000);
      return NextResponse.json(
        { error: `Сессию можно завершить после 75% времени. Осталось ~${minutesLeft} мин` },
        { status: 400 },
      );
    }
    // already_completed / invalid_status / not_found are non-fatal here:
    // the video session row is already marked ENDED — payout state is what
    // it was on the prior call.
  }

  return NextResponse.json({ ok: true, session: updated });
}

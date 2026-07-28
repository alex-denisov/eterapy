import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";

const patchSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["ACTIVE", "ENDED"]),
});

function scopedBookingWhere(bookingId: string, userId: string) {
  return {
    id: bookingId,
    OR: [
      { clientId: userId },
      { practitioner: { userId } },
    ],
  };
}

/** GET /api/video/session?bookingId=xxx — получить состояние сессии. */
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
  });

  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  return NextResponse.json({ session: videoSession });
}

/** PATCH /api/video/session — activate or finish a participant-scoped session. */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректное состояние сессии" }, { status: 400 });
  const { bookingId, status } = parsed.data;

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

  if (status === "ACTIVE") {
    if (videoSession.status === "ENDED") {
      return NextResponse.json({ error: "Сессия уже завершена" }, { status: 409 });
    }
    const updated = await db.videoSession.update({
      where: { id: videoSession.id },
      data: {
        status: "ACTIVE",
        // The second participant must not restart the shared timer.
        ...(videoSession.startedAt ? {} : { startedAt: new Date() }),
      },
    });
    return NextResponse.json({ ok: true, session: updated });
  }

  if (videoSession.status !== "ENDED") {
    // Validate the 75% gate and settle booking state before closing the room.
    // Previously the row was marked ENDED before this check, so a rejected
    // early exit still destroyed the active session.
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
    const activeEgressIds = [
      videoSession.serverSttEgressId,
      videoSession.recordingEgressId,
    ].filter((id): id is string => Boolean(id));
    if (activeEgressIds.length > 0) {
      const { stopRecording } = await import("@/lib/livekit-egress");
      await Promise.allSettled([...new Set(activeEgressIds)].map((id) => stopRecording(id)));
    }
  }

  const updated = await db.videoSession.update({
    where: { id: videoSession.id },
    data: {
      status: "ENDED",
      endedAt: videoSession.endedAt ?? new Date(),
      recordingExpiry: videoSession.recordingExpiry ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      recordingEgressId: null,
      serverSttEgressId: null,
    },
  });

  return NextResponse.json({ ok: true, session: updated });
}

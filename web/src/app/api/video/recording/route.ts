/**
 * POST /api/video/recording — включить временный audio-only поток для AI-конспекта
 * DELETE /api/video/recording — остановить оставшийся legacy egress
 * GET /api/video/recording?bookingId=xxx — состояние AI-конспекта
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { stopRecording } from "@/lib/livekit-egress";
import {
  ServerSttError,
  startServerSttForBooking,
} from "@/lib/server-stt";

function errorResponse(error: unknown) {
  if (error instanceof ServerSttError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  throw error;
}

function scopedBookingWhere(bookingId: string, userId: string, role?: string) {
  if (role === "ADMIN" || role === "SUPERADMIN") return { id: bookingId };
  return {
    id: bookingId,
    OR: [
      { clientId: userId },
      { practitioner: { userId } },
    ],
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookingId, mode } = await req.json();
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  const role = session.user?.role ?? "";

  if (mode === "server_stt") {
    try {
      return NextResponse.json(await startServerSttForBooking({
        bookingId,
        actorUserId: session.user.id,
        actorRole: role,
      }));
    } catch (error) {
      return errorResponse(error);
    }
  }

  return NextResponse.json(
    { error: "Полная видеозапись недоступна. Для конспекта используется только временное аудио." },
    { status: 409 },
  );
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { egressId } = await req.json();
  if (!egressId) return NextResponse.json({ error: "egressId required" }, { status: 400 });

  const vs = await db.videoSession.findFirst({
    where: { recordingEgressId: egressId },
    include: { booking: { include: { practitioner: { select: { userId: true } } } } },
  });
  if (!vs) return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  const role = session.user?.role ?? "";
  const isPractitioner = vs.booking.practitioner.userId === session.user.id;
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(role);
  if (!isPractitioner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await stopRecording(egressId);
  await db.videoSession.update({
    where: { id: vs.id },
    data: { recordingEgressId: null },
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  const vs = await db.videoSession.findFirst({
    where: {
      bookingId,
      booking: scopedBookingWhere(bookingId, session.user.id, session.user?.role),
    },
    select: {
      recordingUrl: true,
      recordingExpiry: true,
      recordingEgressId: true,
      serverSttStatus: true,
      serverSttJobId: true,
      serverSttAudioExpiresAt: true,
      transcriptExpiresAt: true,
      summaryExpiresAt: true,
    },
  });
  if (!vs) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  return NextResponse.json({
    recording: vs?.recordingUrl ? {
      url: vs.recordingUrl,
      egressId: vs.recordingEgressId,
      expiresAt: vs.recordingExpiry,
      expired: vs.recordingExpiry ? vs.recordingExpiry < new Date() : false,
    } : null,
    serverStt: {
      status: vs.serverSttStatus,
      jobId: vs.serverSttJobId,
      audioExpiresAt: vs.serverSttAudioExpiresAt,
      transcriptExpiresAt: vs.transcriptExpiresAt,
      summaryExpiresAt: vs.summaryExpiresAt,
    },
  });
}

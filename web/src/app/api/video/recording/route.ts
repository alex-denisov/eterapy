/**
 * POST /api/video/recording  — начать запись сессии
 * DELETE /api/video/recording — остановить запись
 * GET /api/video/recording?bookingId=xxx — статус и URL записи
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { startRoomRecording, stopRecording, getRecordingStatus } from "@/lib/livekit-egress";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookingId } = await req.json();
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  // Only practitioner of this booking or admin can start recording
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { practitioner: { select: { userId: true } }, videoSession: true },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  // @ts-expect-error custom
  const role = session.user?.role;
  const isPractitioner = booking.practitioner.userId === session.user.id;
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(role);
  if (!isPractitioner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!booking.videoSession) return NextResponse.json({ error: "No active video session" }, { status: 404 });

  const roomName = booking.videoSession.roomName;
  const recording = await startRoomRecording(roomName, bookingId);
  if (!recording) return NextResponse.json({ error: "Не удалось запустить запись. Egress сервер недоступен." }, { status: 503 });

  // Store in DB
  await db.videoSession.update({
    where: { bookingId },
    data: {
      recordingUrl: recording.url,
      recordingExpiry: recording.expiresAt,
    },
  });

  // Store egressId somewhere we can stop it — in status field or custom
  // Using recordingUrl with egressId prefix for simplicity
  return NextResponse.json({
    ok: true,
    egressId: recording.egressId,
    url: recording.url,
    expiresAt: recording.expiresAt,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { egressId } = await req.json();
  if (!egressId) return NextResponse.json({ error: "egressId required" }, { status: 400 });

  await stopRecording(egressId);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  const vs = await db.videoSession.findUnique({
    where: { bookingId },
    select: { recordingUrl: true, recordingExpiry: true },
  });

  return NextResponse.json({
    recording: vs?.recordingUrl ? {
      url: vs.recordingUrl,
      expiresAt: vs.recordingExpiry,
      expired: vs.recordingExpiry ? vs.recordingExpiry < new Date() : false,
    } : null,
  });
}

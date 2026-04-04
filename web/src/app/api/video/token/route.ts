import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { generateToken, makeRoomName } from "@/lib/livekit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId обязателен" }, { status: 400 });

  // Загружаем бронирование с практиком и клиентом
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      practitioner: { include: { user: { select: { id: true, name: true } } } },
      client: { select: { id: true, name: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });
  if (booking.status !== "CONFIRMED" && booking.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Сессия ещё не подтверждена" }, { status: 403 });
  }

  const userId = session.user.id;
  const isClient = booking.clientId === userId;
  const isPractitioner = booking.practitioner.userId === userId;
  if (!isClient && !isPractitioner) {
    return NextResponse.json({ error: "Нет доступа к этой сессии" }, { status: 403 });
  }

  const roomName = makeRoomName(bookingId);
  const participantName = isClient ? booking.client.name : booking.practitioner.user.name;
  const role = isClient ? "client" : "practitioner";

  // Создаём или обновляем VideoSession
  await db.videoSession.upsert({
    where: { bookingId },
    create: { bookingId, roomName, status: "WAITING" },
    update: {},
  });

  // Меняем статус бронирования на IN_PROGRESS при первом входе
  if (booking.status === "CONFIRMED") {
    await db.booking.update({ where: { id: bookingId }, data: { status: "IN_PROGRESS" } }).catch(() => {});
  }

  const token = await generateToken({
    roomName,
    participantName,
    participantId: userId,
    canPublish: true,
    canSubscribe: true,
    metadata: JSON.stringify({ role, bookingId }),
  });

  return NextResponse.json({ token, roomName, role, participantName });
}

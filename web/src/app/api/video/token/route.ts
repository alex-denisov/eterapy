import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { generateToken, makeRoomName } from "@/lib/livekit";
import { chargeClientForSession } from "@/lib/session-charge";

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

  // Первый вход: переводим бронирование в IN_PROGRESS и списываем баланс клиента.
  // Повторные вызовы идемпотентны (status === "already_charged").
  if (booking.status === "CONFIRMED") {
    const outcome = await chargeClientForSession(bookingId);
    if (outcome.status === "insufficient_balance") {
      const needRub = Math.ceil(outcome.priceKopecks / 100);
      const haveRub = (outcome.balanceKopecks / 100).toFixed(2);
      return NextResponse.json(
        { error: `Недостаточно средств на балансе: ${haveRub} ₽ из ${needRub} ₽` },
        { status: 402 },
      );
    }
    if (outcome.status === "invalid_status") {
      return NextResponse.json({ error: "Сессия в неподходящем статусе для запуска" }, { status: 409 });
    }
  }

  // Создаём или обновляем VideoSession
  await db.videoSession.upsert({
    where: { bookingId },
    create: { bookingId, roomName, status: "WAITING" },
    update: {},
  });

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

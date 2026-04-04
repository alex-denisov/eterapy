import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import { sendBookingConfirmation } from "@/lib/email";

// GET /api/bookings — бронирования текущего пользователя
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = req.nextUrl.searchParams.get("role") || "client";

  try {
    let bookings;

    if (role === "practitioner") {
      const practitioner = await db.practitioner.findUnique({ where: { userId: session.user.id } });
      if (!practitioner) return NextResponse.json({ bookings: [] });

      bookings = await db.booking.findMany({
        where: { practitionerId: practitioner.id },
        include: {
          client: { select: { name: true, email: true } },
          slot: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    } else {
      bookings = await db.booking.findMany({
        where: { clientId: session.user.id },
        include: {
          practitioner: { include: { user: { select: { name: true } } } },
          slot: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }

    return NextResponse.json({ bookings: bookings.map(formatBooking) });
  } catch (err) {
    console.error("[api/bookings GET]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST /api/bookings — создать бронирование
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { practitionerId, slotId } = await req.json();
    if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

    const practitioner = await db.practitioner.findUnique({
      where: { id: practitionerId },
      include: { user: { select: { name: true } } },
    });
    if (!practitioner) return NextResponse.json({ error: "Практик не найден" }, { status: 404 });

    // Проверяем слот если указан
    if (slotId) {
      const slot = await db.timeSlot.findUnique({ where: { id: slotId } });
      if (!slot || !slot.available) return NextResponse.json({ error: "Слот недоступен" }, { status: 409 });
      await db.timeSlot.update({ where: { id: slotId }, data: { available: false } });
    }

    const booking = await db.booking.create({
      data: {
        clientId: session.user.id,
        practitionerId,
        slotId: slotId || null,
        status: BookingStatus.PENDING,
        priceRub: practitioner.pricePerSession,
      },
      include: {
        client: { select: { name: true, email: true } },
        slot: true,
      },
    });

    // Email уведомление
    try {
      await sendBookingConfirmation({
        clientEmail: session.user.email!,
        clientName: session.user.name || "Клиент",
        practitionerName: practitioner.user.name,
        practitionerId,
        slot: booking.slot ? new Date(booking.slot.startAt).toLocaleString("ru-RU") : "Слот уточняется",
        price: practitioner.pricePerSession,
      });
    } catch (emailErr) {
      console.error("[booking] email failed:", emailErr);
    }

    return NextResponse.json({ booking: formatBooking(booking), ok: true });
  } catch (err) {
    console.error("[api/bookings POST]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH /api/bookings — изменить статус
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { bookingId, status } = await req.json();
    if (!bookingId || !status) return NextResponse.json({ error: "bookingId и status обязательны" }, { status: 400 });

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { practitioner: true },
    });
    if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });

    // Клиент может только отменить, практик — подтвердить/отменить
    const isPractitioner = booking.practitioner.userId === session.user.id;
    const isClient = booking.clientId === session.user.id;
    if (!isPractitioner && !isClient) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const updated = await db.booking.update({
      where: { id: bookingId },
      data: { status: status as BookingStatus },
    });

    return NextResponse.json({ booking: formatBooking(updated) });
  } catch (err) {
    console.error("[api/bookings PATCH]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBooking(b: any) {
  return {
    id: b.id,
    status: b.status,
    priceRub: b.priceRub,
    createdAt: b.createdAt,
    slot: b.slot ? {
      startAt: b.slot.startAt,
      endAt: b.slot.endAt,
    } : null,
    client: b.client ? { name: b.client.name, email: b.client.email } : undefined,
    practitioner: b.practitioner ? { name: b.practitioner.user?.name } : undefined,
  };
}

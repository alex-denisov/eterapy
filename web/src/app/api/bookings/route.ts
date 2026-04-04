import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import {
  sendBookingRequestedClient,
  sendBookingRequestedPractitioner,
  sendBookingConfirmedClient,
  sendBookingCancelledClient,
  sendBookingCancelledPractitioner,
  sendReviewRequestClient,
} from "@/lib/email";
import { getSetting } from "@/lib/platform-settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSlot(slot: { startAt: Date; endAt: Date } | null): string {
  if (!slot) return "время уточняется";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" };
  const start = new Date(slot.startAt).toLocaleString("ru-RU", opts);
  const endTime = new Date(slot.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${start} – ${endTime}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatBooking(b: any) {
  return {
    id: b.id,
    status: b.status,
    priceRub: b.priceRub,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    slot: b.slot ? { startAt: b.slot.startAt, endAt: b.slot.endAt } : null,
    client:      b.client      ? { name: b.client.name,           email: b.client.email }           : undefined,
    practitioner: b.practitioner ? { name: b.practitioner.user?.name, id: b.practitioner.id }       : undefined,
  };
}

// ─── GET /api/bookings ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = req.nextUrl.searchParams.get("role") ?? "client";

  try {
    let bookings;

    if (role === "practitioner") {
      // @ts-expect-error custom
      if (session.user?.role !== "PRACTITIONER") return NextResponse.json({ bookings: [] });
      const prac = await db.practitioner.findUnique({ where: { userId: session.user.id } });
      if (!prac) return NextResponse.json({ bookings: [] });

      bookings = await db.booking.findMany({
        where: { practitionerId: prac.id },
        include: { client: { select: { name: true, email: true } }, slot: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } else {
      bookings = await db.booking.findMany({
        where: { clientId: session.user.id },
        include: {
          practitioner: { include: { user: { select: { name: true } } } },
          slot: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }

    return NextResponse.json({ bookings: bookings.map(formatBooking) });
  } catch (err) {
    console.error("[api/bookings GET]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // @ts-expect-error custom
  const userRole = session.user?.role;
  if (userRole === "PRACTITIONER" || userRole === "ADMIN" || userRole === "SUPERADMIN") {
    return NextResponse.json({ error: "Только клиенты могут создавать бронирования" }, { status: 403 });
  }

  try {
    const { practitionerId, slotId } = await req.json();
    if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

    const practitioner = await db.practitioner.findUnique({
      where: { id: practitionerId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!practitioner) return NextResponse.json({ error: "Практик не найден" }, { status: 404 });
    if (practitioner.status !== "ACTIVE") {
      return NextResponse.json({ error: "Практик временно недоступен" }, { status: 409 });
    }

    // Валидация слота
    if (slotId) {
      const slot = await db.timeSlot.findUnique({ where: { id: slotId } });
      if (!slot || !slot.available) {
        return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
      }
      // Резервируем слот
      await db.timeSlot.update({ where: { id: slotId }, data: { available: false } });
    }

    // В тестовом режиме цена = 0
    const testMode = await getSetting("session.test_mode") === "true";
    const priceRub = testMode ? 0 : practitioner.pricePerSession;

    const booking = await db.booking.create({
      data: {
        clientId: session.user.id,
        practitionerId,
        slotId: slotId ?? null,
        status: BookingStatus.PENDING,
        priceRub,
      },
      include: {
        client: { select: { name: true, email: true } },
        slot: true,
      },
    });

    // Собираем данные для писем
    const emailData = {
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      practitionerName: practitioner.user.name,
      practitionerEmail: practitioner.user.email,
      practitionerId,
      slotStr: fmtSlot(booking.slot),
      priceRub: practitioner.pricePerSession,
      durationMin: practitioner.sessionDuration ?? 60,
    };

    // Отправляем письма параллельно — не блокируем ответ при ошибке
    Promise.allSettled([
      sendBookingRequestedClient(emailData),
      sendBookingRequestedPractitioner(emailData),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "rejected") console.error(`[booking email ${i}]`, r.reason);
      });
    });

    return NextResponse.json({ booking: formatBooking(booking), ok: true });
  } catch (err) {
    console.error("[api/bookings POST]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// ─── PATCH /api/bookings ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { bookingId, status } = await req.json() as { bookingId: string; status: BookingStatus };
    if (!bookingId || !status) return NextResponse.json({ error: "bookingId и status обязательны" }, { status: 400 });

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        practitioner: { include: { user: { select: { name: true, email: true } } } },
        client: { select: { name: true, email: true } },
        slot: true,
      },
    });
    if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });

    // @ts-expect-error custom
    const userRole = session.user?.role;
    const isPractitioner = booking.practitioner.userId === session.user.id
      || (userRole === "PRACTITIONER" && booking.practitioner.userId === session.user.id);
    const isClient = booking.clientId === session.user.id;
    const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN";

    if (!isPractitioner && !isClient && !isAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    // Клиент может только отменить
    if (isClient && !isAdmin && status !== "CANCELLED") {
      return NextResponse.json({ error: "Клиент может только отменить запись" }, { status: 403 });
    }

    const updated = await db.booking.update({
      where: { id: bookingId },
      data: { status },
      include: { slot: true },
    });

    // Освобождаем слот если бронирование отменено
    if (status === "CANCELLED" && booking.slotId) {
      await db.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch(() => {});
    }

    // Обновляем счётчик завершённых сессий практика
    if (status === "COMPLETED") {
      await db.practitioner.update({
        where: { id: booking.practitioner.id },
        data: { sessionCount: { increment: 1 } },
      }).catch(() => {});
    }

    const emailData = {
      bookingId,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      practitionerName: booking.practitioner.user.name,
      practitionerEmail: booking.practitioner.user.email,
      practitionerId: booking.practitioner.id,
      slotStr: fmtSlot(booking.slot),
      priceRub: booking.priceRub,
      durationMin: 60, // TODO: from practitioner.sessionDuration
    };

    // Email по статусу
    if (status === "CONFIRMED") {
      sendBookingConfirmedClient(emailData).catch((e) => console.error("[email confirmed]", e));
    } else if (status === "CANCELLED") {
      const cancelledBy = isClient ? "client" : "practitioner";
      Promise.allSettled([
        sendBookingCancelledClient(emailData, cancelledBy),
        isClient ? sendBookingCancelledPractitioner(emailData) : Promise.resolve(),
      ]).catch(() => {});
    } else if (status === "COMPLETED") {
      sendReviewRequestClient(emailData).catch((e) => console.error("[email review]", e));
    }

    return NextResponse.json({ booking: formatBooking({ ...updated, client: booking.client, practitioner: booking.practitioner }) });
  } catch (err) {
    console.error("[api/bookings PATCH]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import {
  sendBookingRequestedClient,
  sendBookingRequestedPractitioner,
  sendBookingConfirmedClient,
  sendBookingConfirmedPractitioner,
  sendBookingCancelledClient,
  sendBookingCancelledPractitioner,
  sendReviewRequestClient,
} from "@/lib/email";
import { getSetting } from "@/lib/platform-settings";
import { notify } from "@/lib/notifications";
import { sanitizeText } from "@/lib/validation";

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
  const showVideo = ["CONFIRMED", "IN_PROGRESS"].includes(b.status);
  return {
    id: b.id,
    status: b.status,
    priceRub: b.priceRub,
    createdAt: b.createdAt?.toISOString?.() ?? b.createdAt,
    updatedAt: b.updatedAt?.toISOString?.() ?? b.updatedAt,
    slot: b.slot ? { startAt: b.slot.startAt?.toISOString?.() ?? b.slot.startAt, endAt: b.slot.endAt?.toISOString?.() ?? b.slot.endAt } : null,
    sessionUrl: showVideo ? `${appUrl}/session/${b.id}` : null,
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
        orderBy: [
          { slot: { startAt: "asc" } },
          { createdAt: "desc" },
        ],
        take: 100,
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

  const userRole = session.user?.role;
  if (userRole === "PRACTITIONER" || userRole === "ADMIN" || userRole === "SUPERADMIN") {
    return NextResponse.json({ error: "Только клиенты могут создавать бронирования" }, { status: 403 });
  }

  try {
    const { practitionerId, slotId, slotStartAt, slotEndAt, durationMin, priceOverride } = await req.json();
    if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

    const practitioner = await db.practitioner.findUnique({
      where: { id: practitionerId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!practitioner) return NextResponse.json({ error: "Практик не найден" }, { status: 404 });
    if (practitioner.status !== "ACTIVE") {
      return NextResponse.json({ error: "Практик временно недоступен" }, { status: 409 });
    }

    let resolvedSlotId: string | null = null;

    // Вариант 1: слот уже есть в TimeSlot (создан практиком)
    if (slotId) {
      const slot = await db.timeSlot.findUnique({ where: { id: slotId } });
      if (!slot || !slot.available) {
        return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
      }
      await db.timeSlot.update({ where: { id: slotId }, data: { available: false } });
      resolvedSlotId = slotId;
    }
    // Вариант 2: клиент выбрал сгенерированный слот — создаём TimeSlot на сервере
    else if (slotStartAt && slotEndAt) {
      // Проверяем, нет ли уже активного бронирования на это время
      const existingBooking = await db.booking.findFirst({
        where: {
          practitionerId,
          status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
          slot: {
            startAt: { lte: new Date(slotEndAt) },
            endAt: { gte: new Date(slotStartAt) },
          },
        },
      });
      if (existingBooking) {
        return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
      }

      // Также проверяем, нет ли уже занятого TimeSlot на это время
      const existingSlot = await db.timeSlot.findFirst({
        where: {
          practitionerId,
          available: false,
          startAt: { lte: new Date(slotEndAt) },
          endAt: { gte: new Date(slotStartAt) },
        },
      });
      if (existingSlot) {
        return NextResponse.json({ error: "Слот уже занят — выберите другое время" }, { status: 409 });
      }

      const createdSlot = await db.timeSlot.create({
        data: {
          practitionerId,
          startAt: new Date(slotStartAt),
          endAt: new Date(slotEndAt),
          available: false, // сразу резервируем
        },
      });
      resolvedSlotId = createdSlot.id;
    }

    // Цена: priceOverride (из тарифной сетки) или базовая цена практика
    const testMode = await getSetting("session.test_mode") === "true";
    let priceRub = priceOverride ?? practitioner.pricePerSession;
    if (testMode) priceRub = 0;

    const booking = await db.booking.create({
      data: {
        clientId: session.user.id,
        practitionerId,
        slotId: resolvedSlotId,
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

    // Email + Telegram уведомления (параллельно, не блокируем ответ)
    const slotDate = booking.slot ? new Date(booking.slot.startAt).toLocaleDateString("ru-RU") : "—";
    const slotTime = booking.slot ? new Date(booking.slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
    Promise.allSettled([
      sendBookingRequestedClient(emailData),
      sendBookingRequestedPractitioner(emailData),
      // Telegram: новая запись — уведомить практика (userId, не practitionerId)
      notify({ userId: practitioner.userId, event: "BOOKING_REQUESTED", data: {
        clientName: booking.client.name, date: slotDate, time: slotTime,
      }}),
    ]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === "rejected") console.error(`[booking notify ${i}]`, r.reason);
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

    // Validate status is a valid enum value
    const validStatuses = Object.values(BookingStatus);
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Недопустимый статус бронирования" }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: {
        practitioner: { include: { user: { select: { name: true, email: true } } } },
        client: { select: { name: true, email: true } },
        slot: true,
      },
    });
    if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });

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

    // При переходе в IN_PROGRESS — списываем баланс клиента
    if (status === "IN_PROGRESS" && booking.status === "CONFIRMED") {
      const client = await db.user.findUnique({ where: { id: booking.clientId }, select: { balance: true } });
      if (!client) {
        return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
      }
      if (client.balance < booking.priceRub) {
        return NextResponse.json({ error: "Недостаточно средств на балансе" }, { status: 402 });
      }

      await db.$transaction([
        db.booking.update({ where: { id: bookingId }, data: { status: "IN_PROGRESS" } }),
        db.user.update({ where: { id: booking.clientId }, data: { balance: { decrement: booking.priceRub } } }),
        db.payment.create({
          data: {
            bookingId,
            amountKopecks: booking.priceRub,
            currency: "RUB",
            status: "PAID",
          },
        }),
      ]);

      const updatedBooking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          practitioner: { include: { user: { select: { name: true, email: true } } } },
          client: { select: { name: true, email: true } },
          slot: true,
        },
      });
      return NextResponse.json({ booking: formatBooking({ ...updatedBooking, client: booking.client, practitioner: booking.practitioner }) });
    }

    // При переходе в COMPLETED — создаём выплату практику и обновляем счётчик
    if (status === "COMPLETED") {
      const practitioner = await db.practitioner.findUnique({
        where: { id: booking.practitioner.id },
        select: { id: true, commissionPercent: true, userId: true },
      });
      if (!practitioner) {
        return NextResponse.json({ error: "Практик не найден" }, { status: 404 });
      }

      const payoutAmount = Math.round(booking.priceRub * (1 - practitioner.commissionPercent / 100));

      await db.$transaction([
        db.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } }),
        db.payout.create({
          data: {
            practitionerId: practitioner.id,
            amountKopecks: payoutAmount,
            status: "PENDING",
            initiatedBy: session.user.id,
          },
        }),
        db.practitioner.update({
          where: { id: practitioner.id },
          data: { sessionCount: { increment: 1 } },
        }),
      ]);

      // Отправляем запрос на отзыв
      sendReviewRequestClient({
        bookingId,
        clientName: booking.client.name,
        clientEmail: booking.client.email,
        practitionerName: booking.practitioner.user.name,
        practitionerEmail: booking.practitioner.user.email,
        practitionerId: booking.practitioner.id,
        slotStr: fmtSlot(booking.slot),
        priceRub: booking.priceRub,
        durationMin: 60,
      }).catch((e) => console.error("[email review]", e));

      const updatedBooking = await db.booking.findUnique({
        where: { id: bookingId },
        include: {
          practitioner: { include: { user: { select: { name: true, email: true } } } },
          client: { select: { name: true, email: true } },
          slot: true,
        },
      });
      return NextResponse.json({ booking: formatBooking({ ...updatedBooking, client: booking.client, practitioner: booking.practitioner }) });
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://eterapy.com";
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
      sessionUrl: `${appUrl}/session/${bookingId}`,
    };

    // Email + Telegram по статусу
    if (status === "CONFIRMED") {
      const slotDate = booking.slot ? new Date(booking.slot.startAt).toLocaleDateString("ru-RU") : "—";
      const slotTime = booking.slot ? new Date(booking.slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";
      Promise.allSettled([
        sendBookingConfirmedClient(emailData),
        sendBookingConfirmedPractitioner(emailData),
        // Практик: Telegram
        notify({ userId: booking.practitioner.userId, event: "BOOKING_CONFIRMED", data: {
          clientName: booking.client.name,
          practitionerName: booking.practitioner.user.name,
          date: slotDate,
          time: slotTime,
          sessionUrl: emailData.sessionUrl,
        }}),
      ]).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") console.error(`[booking notify ${i}]`, r.reason);
        });
      });
    } else if (status === "CANCELLED") {
      const cancelledBy = isClient ? "client" : "practitioner";
      Promise.allSettled([
        sendBookingCancelledClient(emailData, cancelledBy),
        isClient ? sendBookingCancelledPractitioner(emailData) : Promise.resolve(),
      ]).catch(() => {});
    }

    return NextResponse.json({ booking: formatBooking({ ...updated, client: booking.client, practitioner: booking.practitioner }) });
  } catch (err) {
    console.error("[api/bookings PATCH]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

/**
 * GET /api/cron/reminders
 *
 * Отправляет напоминания о предстоящих сессиях.
 * Вызывается внешним cron-сервисом (cron-job.org, GitHub Actions, systemd timer).
 *
 * Логика:
 * - Ищет CONFIRMED бронирования у которых startAt через 24ч ± 15мин
 * - Ищет CONFIRMED бронирования у которых startAt через 1ч ± 15мин
 * - Отправляет уведомления клиенту и практику через notify()
 * - Помечает как отправленные (reminderSent флаг)
 *
 * Защита: CRON_SECRET в заголовке Authorization
 */
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const WINDOW = 15 * 60 * 1000; // ±15 минут

  // Временные метки для окон
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
  const in1h  = new Date(now.getTime() + 1  * 3600 * 1000);

  // Бронирования которые начинаются примерно через 24 часа
  const bookings24h = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder24hSent: false,
      startedAt: {
        gte: new Date(in24h.getTime() - WINDOW),
        lte: new Date(in24h.getTime() + WINDOW),
      },
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  // Бронирования которые начинаются примерно через 1 час
  const bookings1h = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder1hSent: false,
      startedAt: {
        gte: new Date(in1h.getTime() - WINDOW),
        lte: new Date(in1h.getTime() + WINDOW),
      },
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  let remindersSent = 0;
  let autoCompleted = 0;

  // Обрабатываем 24h напоминания
  for (const b of bookings24h) {
    const startDate = b.startedAt ? new Date(b.startedAt).toLocaleDateString("ru-RU") : "—";
    const startTime = b.startedAt ? new Date(b.startedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

    // Клиенту
    await notify({
      userId: b.clientId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: b.id,
        withName: b.practitioner.user.name,
        date: startDate,
        time: startTime,
        in: "24 часа",
      },
    });

    // Практику
    await notify({
      userId: b.practitioner.userId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: b.id,
        withName: b.client.name,
        date: startDate,
        time: startTime,
        in: "24 часа",
      },
    });

    await db.booking.update({ where: { id: b.id }, data: { reminder24hSent: true } });
    remindersSent++;
  }

  // Обрабатываем 1h напоминания
  for (const b of bookings1h) {
    const startDate = b.startedAt ? new Date(b.startedAt).toLocaleDateString("ru-RU") : "—";
    const startTime = b.startedAt ? new Date(b.startedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

    await notify({
      userId: b.clientId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: b.id,
        withName: b.practitioner.user.name,
        date: startDate,
        time: startTime,
        in: "1 час",
      },
    });

    await notify({
      userId: b.practitioner.userId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: b.id,
        withName: b.client.name,
        date: startDate,
        time: startTime,
        in: "1 час",
      },
    });

    await db.booking.update({ where: { id: b.id }, data: { reminder1hSent: true } });
    remindersSent++;
  }

  // Автозавершение истёкших сессий:
  // IN_PROGRESS + endAt прошёл → COMPLETED
  const completedBookings = await db.booking.findMany({
    where: {
      status: "IN_PROGRESS",
      slot: {
        endAt: { lte: now },
      },
    },
    include: {
      slot: true,
      practitioner: { select: { id: true } },
      client: { select: { id: true, name: true, email: true } },
    },
  });

  for (const b of completedBookings) {
    await db.booking.update({ where: { id: b.id }, data: { status: "COMPLETED" } });
    await db.practitioner.update({
      where: { id: b.practitioner.id },
      data: { sessionCount: { increment: 1 } },
    }).catch(() => {});
    const { sendReviewRequestClient } = await import("@/lib/email");
    sendReviewRequestClient({
      bookingId: b.id,
      clientName: b.client.name,
      clientEmail: b.client.email,
      practitionerName: "",
      practitionerEmail: "",
      practitionerId: b.practitioner.id,
      slotStr: fmtSlotCron(b.slot),
      priceRub: 0,
      durationMin: 60,
    }).catch(() => {});
    autoCompleted++;
  }

  // Авто-истечение подтверждённых сессий:
  // CONFIRMED + endAt + 15min прошёл → EXPIRED
  const fifteenMin = 15 * 60 * 1000;
  const expiredCutoff = new Date(now.getTime() - fifteenMin);
  const expiredBookings = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      slot: {
        endAt: { lte: expiredCutoff },
      },
    },
    include: {
      slot: true,
      practitioner: { select: { id: true } },
      client: { select: { id: true, name: true } },
    },
  });

  for (const b of expiredBookings) {
    await db.booking.update({ where: { id: b.id }, data: { status: "EXPIRED" } });
    autoCompleted++;
  }

  return NextResponse.json({
    ok: true,
    remindersSent,
    autoCompleted,
    autoExpired: expiredBookings.length,
    processed: { "24h": bookings24h.length, "1h": bookings1h.length, "completed": completedBookings.length, "expired": expiredBookings.length },
    timestamp: now.toISOString(),
  });
}

function fmtSlotCron(slot: { startAt: Date; endAt: Date } | null): string {
  if (!slot) return "—";
  return new Date(slot.startAt).toLocaleString("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
}

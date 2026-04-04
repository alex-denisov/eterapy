import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";
import {
  sendBookingConfirmedClient,
  sendBookingCancelledClient,
  sendBookingCancelledPractitioner,
  sendReviewRequestClient,
} from "@/lib/email";

function fmtSlot(slot: { startAt: Date; endAt: Date } | null) {
  if (!slot) return "время уточняется";
  const start = new Date(slot.startAt).toLocaleString("ru-RU", {
    weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const endTime = new Date(slot.endAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${start} – ${endTime}`;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json() as { status: BookingStatus };

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      practitioner: { include: { user: { select: { name: true, email: true } } } },
      client: { select: { name: true, email: true } },
      slot: true,
    },
  });
  if (!booking) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  // @ts-expect-error custom
  const userRole = session.user?.role;
  const isAdmin = userRole === "ADMIN" || userRole === "SUPERADMIN";
  const isClient = booking.clientId === session.user!.id;

  if (userRole === "PRACTITIONER") {
    const prac = await db.practitioner.findUnique({ where: { userId: session.user!.id } });
    if (!prac || prac.id !== booking.practitionerId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  } else if (isClient) {
    if (status !== "CANCELLED") return NextResponse.json({ error: "Клиент может только отменить" }, { status: 403 });
  } else if (!isAdmin) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const updated = await db.booking.update({ where: { id }, data: { status } });

  // Освобождаем слот при отмене
  if (status === "CANCELLED" && booking.slotId) {
    await db.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch(() => {});
  }

  // Счётчик сессий
  if (status === "COMPLETED") {
    await db.practitioner.update({
      where: { id: booking.practitioner.id },
      data: { sessionCount: { increment: 1 } },
    }).catch(() => {});
  }

  const emailData = {
    bookingId: id,
    clientName: booking.client.name,
    clientEmail: booking.client.email,
    practitionerName: booking.practitioner.user.name,
    practitionerEmail: booking.practitioner.user.email,
    practitionerId: booking.practitioner.id,
    slotStr: fmtSlot(booking.slot),
    priceRub: booking.priceRub,
    durationMin: 60,
  };

  if (status === "CONFIRMED") {
    sendBookingConfirmedClient(emailData).catch(console.error);
  } else if (status === "CANCELLED") {
    const cancelledBy = isClient ? "client" : "practitioner";
    sendBookingCancelledClient(emailData, cancelledBy).catch(console.error);
    if (!isClient) sendBookingCancelledPractitioner(emailData).catch(console.error);
  } else if (status === "COMPLETED") {
    sendReviewRequestClient(emailData).catch(console.error);
  }

  return NextResponse.json({ booking: updated });
}

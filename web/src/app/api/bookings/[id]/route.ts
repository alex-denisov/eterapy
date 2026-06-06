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
import { notify } from "@/lib/notifications";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";
import { log } from "@/lib/logger";
import { promoteWaitlistForReleasedSlot } from "@/lib/priority-booking";

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

  // COMPLETED: единый путь через helper (75% гейт, holds при открытой жалобе, payout в правильных копейках)
  if (status === "COMPLETED") {
    const outcome = await completeBookingAtSessionEnd(id, {
      userId: session.user!.id!,
      isPractitioner: booking.practitioner.userId === session.user!.id,
    });
    if (outcome.status === "not_found") {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (outcome.status === "early_end_blocked") {
      const minutesLeft = Math.ceil((outcome.requiredMs - outcome.elapsedMs) / 60000);
      return NextResponse.json(
        { error: `Сессию можно завершить после 75% времени. Осталось ~${minutesLeft} мин` },
        { status: 400 },
      );
    }
    if (outcome.status === "invalid_status") {
      return NextResponse.json(
        { error: `Нельзя завершить сессию из статуса ${outcome.currentStatus}` },
        { status: 409 },
      );
    }
  } else {
    await db.booking.update({ where: { id }, data: { status } });
  }

  // Освобождаем слот при отмене
  if (status === "CANCELLED" && booking.slotId) {
    await db.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch(() => {});
    await promoteWaitlistForReleasedSlot({ slotId: booking.slotId, actorUserId: session.user!.id })
      .catch((e: unknown) => log.error("booking.waitlist_promotion_failed", { bookingId: id, slotId: booking.slotId, err: e }));
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

  const slotDate = booking.slot ? new Date(booking.slot.startAt).toLocaleDateString("ru-RU") : "—";
  const slotTime = booking.slot ? new Date(booking.slot.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

  if (status === "CONFIRMED") {
    sendBookingConfirmedClient(emailData).catch((e) => log.error("booking.confirmed_email_failed", { err: e }));
    notify({ userId: booking.clientId, event: "BOOKING_CONFIRMED", data: {
      practitionerName: emailData.practitionerName, date: slotDate, time: slotTime,
    }}).catch((e) => log.error("booking.confirmed_notify_failed", { err: e }));
  } else if (status === "CANCELLED") {
    const cancelledBy = isClient ? "client" : "practitioner";
    sendBookingCancelledClient(emailData, cancelledBy).catch((e) => log.error("booking.cancelled_client_email_failed", { err: e }));
    if (!isClient) sendBookingCancelledPractitioner(emailData).catch((e) => log.error("booking.cancelled_practitioner_email_failed", { err: e }));
    const otherId = isClient ? booking.practitioner?.userId : booking.clientId;
    if (otherId) notify({ userId: otherId, event: "BOOKING_CANCELLED", data: { date: slotDate, time: slotTime } }).catch((e) => log.error("booking.cancelled_notify_failed", { err: e }));
  } else if (status === "COMPLETED") {
    sendReviewRequestClient(emailData).catch((e) => log.error("booking.review_request_email_failed", { err: e }));
    const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/cabinet/bookings?review=${booking.id}`;
    notify({ userId: booking.clientId, event: "REVIEW_REQUESTED", data: {
      practitionerName: emailData.practitionerName, reviewUrl,
    }}).catch((e) => log.error("booking.review_notify_failed", { err: e }));
  }

  const refreshed = await db.booking.findUnique({ where: { id }, select: { id: true, status: true } });
  return NextResponse.json({ booking: refreshed });
}

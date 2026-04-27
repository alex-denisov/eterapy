/**
 * POST /api/admin/bookings/[id]/reschedule
 *
 * Body: { newSlotStartAt: ISO string, newSlotEndAt: ISO string }
 *
 * Atomically:
 *   1. Validates the booking is in a reschedulable status (PENDING or CONFIRMED).
 *   2. Validates the new time-window is free for the same practitioner
 *      (no overlapping booked TimeSlot or active Booking; not in the past).
 *   3. Frees the old TimeSlot (available=true) so future searches see it
 *      as a candidate. The row itself is kept so the historical link
 *      from prior callers / audit references stays intact.
 *   4. Creates a fresh TimeSlot for the new window (available=false).
 *   5. Updates `booking.slotId` and re-derives `booking.priceRub` from
 *      the practitioner's PriceRate matching the new duration; falls
 *      back to `practitioner.pricePerSession` if no rate matches.
 *   6. Writes a BOOKING_CONFIRM-class audit row.
 *
 * Backlog 11.E.2.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = session.user!.id!;

  const { id } = await params;
  const body = (await req.json()) as { newSlotStartAt?: string; newSlotEndAt?: string };
  if (!body.newSlotStartAt || !body.newSlotEndAt) {
    return NextResponse.json({ error: "newSlotStartAt и newSlotEndAt обязательны" }, { status: 400 });
  }

  const newStart = new Date(body.newSlotStartAt);
  const newEnd = new Date(body.newSlotEndAt);
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime()) || newEnd <= newStart) {
    return NextResponse.json({ error: "Некорректный временной интервал" }, { status: 400 });
  }
  if (newStart.getTime() < Date.now()) {
    return NextResponse.json({ error: "Нельзя перенести в прошлое" }, { status: 400 });
  }

  const booking = await db.booking.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      practitionerId: true,
      slotId: true,
      slot: { select: { id: true, startAt: true, endAt: true } },
      practitioner: {
        select: {
          id: true,
          pricePerSession: true,
          priceRates: { where: { enabled: true }, select: { durationMin: true, priceRub: true } },
        },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
    return NextResponse.json(
      { error: `Перенос недоступен из статуса ${booking.status}` },
      { status: 409 },
    );
  }

  const overlap = await db.timeSlot.findFirst({
    where: {
      practitionerId: booking.practitionerId,
      available: false,
      ...(booking.slotId ? { id: { not: booking.slotId } } : {}),
      startAt: { lt: newEnd },
      endAt: { gt: newStart },
    },
    select: { id: true },
  });
  if (overlap) {
    return NextResponse.json({ error: "Слот занят — выберите другое время" }, { status: 409 });
  }

  const durationMin = Math.round((newEnd.getTime() - newStart.getTime()) / 60000);
  const matchingRate = booking.practitioner.priceRates.find((r) => r.durationMin === durationMin);
  const priceRub = matchingRate?.priceRub ?? booking.practitioner.pricePerSession;

  const result = await db.$transaction(async (tx) => {
    if (booking.slotId) {
      await tx.timeSlot.update({
        where: { id: booking.slotId },
        data: { available: true },
      });
    }
    const newSlot = await tx.timeSlot.create({
      data: {
        practitionerId: booking.practitionerId,
        startAt: newStart,
        endAt: newEnd,
        available: false,
      },
      select: { id: true, startAt: true, endAt: true },
    });
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { slotId: newSlot.id, priceRub },
      select: { id: true, slotId: true, priceRub: true, status: true },
    });
    return { newSlot, updated };
  });

  await logAudit(
    adminId,
    "BOOKING_CONFIRM",
    booking.id,
    `reschedule slot=${booking.slotId ?? "none"}→${result.newSlot.id} duration=${durationMin}min price=${priceRub}₽`,
  );

  return NextResponse.json({
    ok: true,
    booking: {
      id: result.updated.id,
      status: result.updated.status,
      priceRub: result.updated.priceRub,
      slot: {
        id: result.newSlot.id,
        startAt: result.newSlot.startAt.toISOString(),
        endAt: result.newSlot.endAt.toISOString(),
      },
      durationMin,
    },
  });
}

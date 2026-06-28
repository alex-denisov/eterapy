import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { canAccessPrioritySlot, isEarlyAccessSlot } from "@/lib/priority-booking";
import { trackServerEvent } from "@/lib/analytics";
import { generatePotentialSlots, slotsOverlap } from "@/lib/slot-availability";

/**
 * GET /api/slots/available?practitionerId=xxx&date=2026-04-07&durationMin=60
 *
 * Возвращает список доступных временных слотов на указанный день.
 * Логика: рабочие часы из ScheduleRule минус BlockedSlot минус занятые Booking.
 */
export async function GET(req: NextRequest) {
  const practitionerId = req.nextUrl.searchParams.get("practitionerId");
  const dateStr = req.nextUrl.searchParams.get("date"); // "2026-04-07"
  const durationMin = Number(req.nextUrl.searchParams.get("durationMin") ?? 60);

  if (!practitionerId || !dateStr) {
    return NextResponse.json({ error: "practitionerId и date обязательны" }, { status: 400 });
  }

  const session = await auth().catch(() => null);
  const activePlan = session?.user?.id ? await getUserActivePlan(session.user.id).catch(() => null) : null;
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay(); // 0=вс, 1=пн...

  // Рабочие часы для этого дня
  const rule = await db.scheduleRule.findUnique({
    where: { practitionerId_dayOfWeek: { practitionerId, dayOfWeek } },
  });

  if (!rule || !rule.enabled) {
    return NextResponse.json({ slots: [] }); // выходной
  }

  // Все слоты рабочего дня с шагом durationMin, выровненные по интервалам
  // (15 мин → :00,:15,:30,:45 | 30 мин → :00,:30 | 60 мин → :00). B458: общая
  // чистая функция, та же логика разделяется с месячной доступностью.
  const potentialSlots = generatePotentialSlots(dateStr, rule, durationMin);

  if (potentialSlots.length === 0) return NextResponse.json({ slots: [] });

  // Заблокированные слоты в этот день
  const dayStartFull = new Date(dateStr + "T00:00:00");
  const dayEndFull   = new Date(dateStr + "T23:59:59");

  const [blocked, bookedSlots, unavailableSlots, persistedAvailableSlots] = await Promise.all([
    db.blockedSlot.findMany({
      where: { practitionerId, startAt: { lte: dayEndFull }, endAt: { gte: dayStartFull } },
    }),
    // Занятые бронирования через TimeSlot (старая система) + новые через bookings с дурацией
    db.booking.findMany({
      where: {
        practitionerId,
        status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
        slot: { startAt: { gte: dayStartFull, lte: dayEndFull } },
      },
      include: { slot: true },
    }),
    // TimeSlot которые уже помечены как unavailable (заняты, но могут не иметь активного booking)
    db.timeSlot.findMany({
      where: {
        practitionerId,
        available: false,
        startAt: { gte: dayStartFull, lte: dayEndFull },
      },
    }),
    db.timeSlot.findMany({
      where: {
        practitionerId,
        available: true,
        startAt: { gte: dayStartFull, lte: dayEndFull },
      },
    }),
  ]);

  const now = new Date();

  const available = potentialSlots.filter(slot => {
    // В прошлом
    if (slot.startAt <= now) return false;
    // Заблокирован практиком
    if (blocked.some(b => slotsOverlap(slot.startAt, slot.endAt, b.startAt, b.endAt))) return false;
    // Занят бронированием
    if (bookedSlots.some(b => b.slot && slotsOverlap(slot.startAt, slot.endAt, b.slot.startAt, b.slot.endAt))) return false;
    // Помечен как unavailable ( TimeSlot.available === false )
    if (unavailableSlots.some(u => slotsOverlap(slot.startAt, slot.endAt, u.startAt, u.endAt))) return false;
    // Persisted slots with early-access gates must not leak through generated availability.
    const persistedSlot = persistedAvailableSlots.find(u => slotsOverlap(slot.startAt, slot.endAt, u.startAt, u.endAt));
    if (persistedSlot && !canAccessPrioritySlot(persistedSlot, activePlan, now)) return false;
    return true;
  });

  const responseSlots = available.map(s => {
    const persistedSlot = persistedAvailableSlots.find(u => slotsOverlap(s.startAt, s.endAt, u.startAt, u.endAt));
    return {
      slotId: persistedSlot?.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      earlyAccess: persistedSlot ? isEarlyAccessSlot(persistedSlot, activePlan, now) : false,
    };
  });

  if (session?.user?.id && responseSlots.some((slot) => slot.earlyAccess)) {
    trackServerEvent(db, {
      event: "early_access_slot_viewed",
      userId: session.user.id,
      surface: "booking",
      properties: {
        practitioner_id: practitionerId,
        date: dateStr,
        plan: activePlan?.key ?? "free",
      },
    });
  }

  return NextResponse.json({
    slots: responseSlots,
  });
}

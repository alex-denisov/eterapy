import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

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
  // 15 мин → :00, :15, :30, :45 | 30 мин → :00, :30 | 60 мин → :00
  const ruleStartHour = rule.startHour;
  const ruleStartMin = rule.startMinute;
  const ruleEndHour = rule.endHour;
  const ruleEndMin = rule.endMinute;

  // Вычисляем выровненное время начала (округляем startMinute вверх до ближайшего интервала)
  const alignedStartMin = Math.ceil(ruleStartMin / durationMin) * durationMin;
  const alignedStartHour = alignedStartMin >= 60 ? ruleStartHour + 1 : ruleStartHour;
  const finalStartMin = alignedStartMin >= 60 ? 0 : alignedStartMin;

  const dayStart = new Date(dateStr + `T${String(alignedStartHour).padStart(2, "0")}:${String(finalStartMin).padStart(2, "0")}:00`);
  const dayEnd   = new Date(dateStr + `T${String(ruleEndHour).padStart(2, "0")}:${String(ruleEndMin).padStart(2, "0")}:00`);

  const potentialSlots: Array<{ startAt: Date; endAt: Date }> = [];
  let cur = new Date(dayStart);
  while (cur.getTime() + durationMin * 60000 <= dayEnd.getTime()) {
    const slotEnd = new Date(cur.getTime() + durationMin * 60000);
    potentialSlots.push({ startAt: new Date(cur), endAt: new Date(slotEnd) });
    cur = new Date(cur.getTime() + durationMin * 60000);
  }

  if (potentialSlots.length === 0) return NextResponse.json({ slots: [] });

  // Заблокированные слоты в этот день
  const dayStartFull = new Date(dateStr + "T00:00:00");
  const dayEndFull   = new Date(dateStr + "T23:59:59");

  const [blocked, bookedSlots, unavailableSlots] = await Promise.all([
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
  ]);

  const isOverlapping = (s: Date, e: Date, blockS: Date, blockE: Date) =>
    s < blockE && e > blockS;

  const now = new Date();

  const available = potentialSlots.filter(slot => {
    // В прошлом
    if (slot.startAt <= now) return false;
    // Заблокирован практиком
    if (blocked.some(b => isOverlapping(slot.startAt, slot.endAt, b.startAt, b.endAt))) return false;
    // Занят бронированием
    if (bookedSlots.some(b => b.slot && isOverlapping(slot.startAt, slot.endAt, b.slot.startAt, b.slot.endAt))) return false;
    // Помечен как unavailable ( TimeSlot.available === false )
    if (unavailableSlots.some(u => isOverlapping(slot.startAt, slot.endAt, u.startAt, u.endAt))) return false;
    return true;
  });

  return NextResponse.json({
    slots: available.map(s => ({
      startAt: s.startAt.toISOString(),
      endAt:   s.endAt.toISOString(),
    })),
  });
}

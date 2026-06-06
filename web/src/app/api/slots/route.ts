import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { log } from "@/lib/logger";
import { canAccessPrioritySlot, isEarlyAccessSlot } from "@/lib/priority-booking";

// GET /api/slots?practitionerId=xxx&from=2026-04-05&to=2026-04-12
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const practitionerId = searchParams.get("practitionerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!practitionerId) return NextResponse.json({ error: "practitionerId required" }, { status: 400 });

  try {
    const session = await auth().catch(() => null);
    const activePlan = session?.user?.id ? await getUserActivePlan(session.user.id).catch(() => null) : null;
    const now = new Date();
    const slots = await db.timeSlot.findMany({
      where: {
        practitionerId,
        available: true,
        startAt: {
          gte: from ? new Date(from) : new Date(),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      orderBy: { startAt: "asc" },
      take: 20,
    });

    const visibleSlots = slots.filter((slot) => canAccessPrioritySlot(slot, activePlan, now));

    return NextResponse.json({ slots: visibleSlots.map((s) => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      earlyAccess: isEarlyAccessSlot(s, activePlan, now),
    })) });
  } catch (err) {
    log.error("api.slots.get", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST /api/slots — создание слота (только для практика)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { startAt, endAt, visibleFrom, earlyAccessFrom } = await req.json();
    if (!startAt || !endAt) return NextResponse.json({ error: "startAt и endAt обязательны" }, { status: 400 });
    const parsedVisibleFrom = visibleFrom ? new Date(visibleFrom) : null;
    const parsedEarlyAccessFrom = earlyAccessFrom ? new Date(earlyAccessFrom) : null;
    if (
      (parsedVisibleFrom && Number.isNaN(parsedVisibleFrom.getTime()))
      || (parsedEarlyAccessFrom && Number.isNaN(parsedEarlyAccessFrom.getTime()))
    ) {
      return NextResponse.json({ error: "Некорректное окно видимости" }, { status: 400 });
    }
    if (parsedVisibleFrom && parsedEarlyAccessFrom && parsedEarlyAccessFrom > parsedVisibleFrom) {
      return NextResponse.json({ error: "earlyAccessFrom должен быть раньше visibleFrom" }, { status: 400 });
    }

    if (session.user?.role !== "PRACTITIONER") {
      return NextResponse.json({ error: "Доступно только для практиков" }, { status: 403 });
    }
    const practitioner = await db.practitioner.findUnique({
      where: { userId: session.user.id },
    });
    if (!practitioner) return NextResponse.json({ error: "Профиль практика не найден" }, { status: 404 });

    const slot = await db.timeSlot.create({
      data: {
        practitionerId: practitioner.id,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        available: true,
        visibleFrom: parsedVisibleFrom,
        earlyAccessFrom: parsedEarlyAccessFrom,
      },
    });

    return NextResponse.json({ slot: { id: slot.id, startAt: slot.startAt, endAt: slot.endAt, visibleFrom: slot.visibleFrom, earlyAccessFrom: slot.earlyAccessFrom } });
  } catch (err) {
    log.error("api.slots.post", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

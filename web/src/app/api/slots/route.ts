import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { log } from "@/lib/logger";

// GET /api/slots?practitionerId=xxx&from=2026-04-05&to=2026-04-12
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const practitionerId = searchParams.get("practitionerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!practitionerId) return NextResponse.json({ error: "practitionerId required" }, { status: 400 });

  try {
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

    return NextResponse.json({ slots: slots.map((s) => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
    }))});
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
    const { startAt, endAt } = await req.json();
    if (!startAt || !endAt) return NextResponse.json({ error: "startAt и endAt обязательны" }, { status: 400 });

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
      },
    });

    return NextResponse.json({ slot: { id: slot.id, startAt: slot.startAt, endAt: slot.endAt } });
  } catch (err) {
    log.error("api.slots.post", { err });
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

const VALID_DURATIONS = [15, 30, 45, 60, 90, 120];

/** GET /api/rates?practitionerId=xxx — тарифная сетка */
export async function GET(req: NextRequest) {
  const practitionerId = req.nextUrl.searchParams.get("practitionerId");
  if (!practitionerId) return NextResponse.json({ error: "practitionerId обязателен" }, { status: 400 });

  const rates = await db.priceRate.findMany({
    where: { practitionerId },
    orderBy: { durationMin: "asc" },
  });

  return NextResponse.json({ rates });
}

/** PATCH /api/rates — обновить тарифы практика (сам практик или ADMIN/SUPERADMIN) */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const role = session.user?.role;
  const { practitionerId, rates } = await req.json() as {
    practitionerId: string;
    rates: Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
  };

  if (!practitionerId || !rates) return NextResponse.json({ error: "Данные неполны" }, { status: 400 });

  // Проверка доступа
  if (role === "PRACTITIONER") {
    const prac = await db.practitioner.findUnique({ where: { userId: session.user.id } });
    if (!prac || prac.id !== practitionerId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  } else if (!["ADMIN", "SUPERADMIN"].includes(role ?? "")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // Fetch existing rates to preserve prices when practitioner toggles without price
  const existingRates = await db.priceRate.findMany({
    where: { practitionerId },
  });
  const existingMap = new Map(existingRates.map(r => [r.durationMin, r]));
  const resolvedRates = rates
    .filter(rate => VALID_DURATIONS.includes(rate.durationMin))
    .map(rate => {
      const existing = existingMap.get(rate.durationMin);
      const priceRub = rate.priceRub > 0 ? rate.priceRub : (existing?.priceRub ?? 0);
      return { durationMin: rate.durationMin, priceRub, enabled: rate.enabled };
    });

  const rateOperations = resolvedRates.map(rate => db.priceRate.upsert({
    where: { practitionerId_durationMin: { practitionerId, durationMin: rate.durationMin } },
    create: { practitionerId, durationMin: rate.durationMin, priceRub: rate.priceRub, enabled: rate.enabled },
    update: { priceRub: rate.priceRub, enabled: rate.enabled },
  }));

  const canonicalRate = resolvedRates
    .filter(rate => rate.enabled && rate.priceRub > 0)
    .sort((a, b) => a.durationMin - b.durationMin)[0];

  if (canonicalRate) {
    await db.$transaction([
      ...rateOperations,
      db.practitioner.update({
        where: { id: practitionerId },
        data: {
          pricePerSession: canonicalRate.priceRub,
          sessionDuration: canonicalRate.durationMin,
        },
      }),
    ]);
  } else {
    await db.$transaction(rateOperations);
  }

  return NextResponse.json({ ok: true });
}

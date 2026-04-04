import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  // @ts-expect-error custom
  if (session?.user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { rates } = await req.json();

  if (!Array.isArray(rates)) return NextResponse.json({ error: "rates must be array" }, { status: 400 });

  // Upsert each rate
  await db.$transaction(
    rates.map((r: { durationMin: number; priceRub: number; enabled: boolean }) =>
      db.priceRate.upsert({
        where: { practitionerId_durationMin: { practitionerId: id, durationMin: r.durationMin } },
        create: { practitionerId: id, durationMin: r.durationMin, priceRub: r.priceRub, enabled: r.enabled },
        update: { priceRub: r.priceRub, enabled: r.enabled },
      })
    )
  );

  // Update pricePerSession to min enabled rate
  const minRate = rates
    .filter((r: { enabled: boolean }) => r.enabled)
    .sort((a: { durationMin: number }, b: { durationMin: number }) => a.durationMin - b.durationMin)[0];

  if (minRate) {
    await db.practitioner.update({
      where: { id },
      data: { pricePerSession: minRate.priceRub, sessionDuration: minRate.durationMin },
    });
  }

  return NextResponse.json({ ok: true });
}

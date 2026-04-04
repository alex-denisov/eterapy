import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { BookingStatus } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json() as { status: BookingStatus };

  const booking = await db.booking.findUnique({
    where: { id },
    include: { practitioner: true },
  });
  if (!booking) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  // @ts-expect-error custom
  const role = session.user?.role;
  const userId = session.user?.id;

  // Praktik may confirm/complete/cancel own bookings
  if (role === "PRACTITIONER") {
    const practitioner = await db.practitioner.findUnique({ where: { userId: userId! } });
    if (!practitioner || practitioner.id !== booking.practitionerId) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
  }
  // Client may cancel their own booking
  else if (role === "CLIENT") {
    if (booking.clientId !== userId) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (status !== "CANCELLED") return NextResponse.json({ error: "Клиент может только отменить" }, { status: 403 });
  }
  else if (role !== "ADMIN") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const updated = await db.booking.update({ where: { id }, data: { status } });

  // If completing, free up the slot? No — keep slot marked as taken for history.
  return NextResponse.json({ booking: updated });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { bookingId, rating, text } = await req.json();

  if (!bookingId || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "bookingId и rating (1-5) обязательны" }, { status: 400 });
  }

  // Проверяем что бронирование завершено и принадлежит этому клиенту
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { review: true },
  });
  if (!booking) return NextResponse.json({ error: "Бронирование не найдено" }, { status: 404 });
  if (booking.clientId !== session.user.id) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (booking.status !== "COMPLETED") return NextResponse.json({ error: "Сессия ещё не завершена" }, { status: 400 });
  if (booking.review) return NextResponse.json({ error: "Отзыв уже оставлен" }, { status: 409 });

  const review = await db.review.create({
    data: {
      bookingId,
      authorId: session.user.id,
      practitionerId: booking.practitionerId,
      rating: Number(rating),
      text: text?.trim() ?? null,
    },
  });

  // Обновляем денормализованные счётчики рейтинга практика
  await db.practitioner.update({
    where: { id: booking.practitionerId },
    data: {
      ratingSum: { increment: Number(rating) },
      reviewCount: { increment: 1 },
    },
  });

  return NextResponse.json({ ok: true, review });
}

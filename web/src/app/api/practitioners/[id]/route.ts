import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const p = await db.practitioner.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        reviews: {
          where: { status: "PUBLISHED" },
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!p) return NextResponse.json({ error: "Не найден" }, { status: 404 });

    return NextResponse.json({
      id: p.id,
      name: p.user.name,
      title: p.title,
      bio: p.bio,
      specialties: p.specialties,
      tags: p.tags,
      experience: p.experience,
      pricePerSession: p.pricePerSession,
      languages: p.languages,
      verified: p.verified,
      founding: p.founding,
      rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0,
      reviewCount: p.reviewCount,
      sessionCount: p.sessionCount,
      online: false,
      nextSlot: null,
      reviews: p.reviews.map((r) => ({
        author: r.author.name,
        rating: r.rating,
        text: r.text,
        date: r.createdAt.toISOString().split("T")[0],
      })),
    });
  } catch (err) {
    console.error("[api/practitioners/id]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

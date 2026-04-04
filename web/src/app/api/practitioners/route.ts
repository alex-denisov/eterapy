import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { Specialty, PractitionerStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const specialty = searchParams.get("specialty") as Specialty | null;
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "rating";
  const onlineOnly = searchParams.get("online") === "true";

  try {
    const practitioners = await db.practitioner.findMany({
      where: {
        status: PractitionerStatus.ACTIVE,
        ...(specialty ? { specialties: { has: specialty } } : {}),
        ...(search ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { bio: { contains: search, mode: "insensitive" } },
            { tags: { has: search } },
          ],
        } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: sort === "rating"
        ? { reviewCount: "desc" } // прокси для рейтинга (ratingSum/reviewCount)
        : sort === "price_asc"
        ? { pricePerSession: "asc" }
        : sort === "price_desc"
        ? { pricePerSession: "desc" }
        : sort === "reviews"
        ? { reviewCount: "desc" }
        : { reviewCount: "desc" },
    });

    // Фильтр онлайн — пока всегда false (нет реального онлайн-статуса)
    // В будущем — Redis presence
    const result = practitioners.map((p) => ({
      id: p.id,
      userId: p.userId,
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
      online: false, // TODO: Redis presence
      nextSlot: null, // TODO: TimeSlot lookup
    }));

    return NextResponse.json({ practitioners: result });
  } catch (err) {
    console.error("[api/practitioners]", err);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

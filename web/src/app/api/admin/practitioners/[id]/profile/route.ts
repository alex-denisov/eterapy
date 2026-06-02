import { NextRequest, NextResponse } from "next/server";
import { Specialty } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { CATEGORY_LABELS, DIRECTIONS_BY_CATEGORY, type CategoryId } from "@/lib/practitioner-taxonomy";

const VALID_CATEGORY_IDS = new Set(Object.keys(CATEGORY_LABELS));
const VALID_DIRECTION_IDS = new Set(
  (Object.keys(DIRECTIONS_BY_CATEGORY) as CategoryId[]).flatMap((c) =>
    DIRECTIONS_BY_CATEGORY[c].map((d) => d.id),
  ),
);

// U6: session-duration options offered in the admin user modal (minutes).
const SESSION_DURATIONS = [15, 30, 45, 60, 90, 120];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, title, bio, experience, commissionPercent, categories, directions, specialties, tags, pricePerSession, sessionDuration } = body as {
    name?: string;
    title?: string;
    bio?: string;
    experience?: string;
    commissionPercent?: number;
    categories?: unknown;
    directions?: unknown;
    specialties?: unknown;
    tags?: unknown;
    pricePerSession?: unknown;
    sessionDuration?: unknown;
  };

  // Комиссию правит только суперадмин — финансовая настройка.
  if (commissionPercent !== undefined && role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Комиссию меняет только SUPERADMIN" }, { status: 403 });
  }
  if (commissionPercent !== undefined) {
    const n = Number(commissionPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: "commissionPercent должен быть целым от 0 до 100" }, { status: 400 });
    }
  }

  // U6: categories (specialties) + free-form tags + session cost/duration.
  let normalizedSpecialties: Specialty[] | undefined;
  if (specialties !== undefined) {
    if (!Array.isArray(specialties)) {
      return NextResponse.json({ error: "specialties должен быть списком" }, { status: 400 });
    }
    const allowed = new Set<string>(Object.values(Specialty));
    normalizedSpecialties = [...new Set(specialties.filter(
      (value): value is Specialty => typeof value === "string" && allowed.has(value),
    ))];
  }

  // W3: three-level taxonomy — category ids + direction ids.
  let normalizedCategories: string[] | undefined;
  if (categories !== undefined) {
    if (!Array.isArray(categories)) {
      return NextResponse.json({ error: "categories должен быть списком" }, { status: 400 });
    }
    normalizedCategories = [...new Set(
      categories.filter((v): v is string => typeof v === "string" && VALID_CATEGORY_IDS.has(v)),
    )];
  }

  let normalizedDirections: string[] | undefined;
  if (directions !== undefined) {
    if (!Array.isArray(directions)) {
      return NextResponse.json({ error: "directions должен быть списком" }, { status: 400 });
    }
    normalizedDirections = [...new Set(
      directions.filter((v): v is string => typeof v === "string" && VALID_DIRECTION_IDS.has(v)),
    )];
  }

  let normalizedTags: string[] | undefined;
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: "tags должен быть списком" }, { status: 400 });
    }
    normalizedTags = [...new Set(
      tags
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 40),
    )].slice(0, 20);
  }

  let normalizedPrice: number | undefined;
  if (pricePerSession !== undefined) {
    const n = Number(pricePerSession);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      return NextResponse.json({ error: "Стоимость сессии — целое число от 0 до 1 000 000 ₽" }, { status: 400 });
    }
    normalizedPrice = n;
  }

  let normalizedDuration: number | undefined;
  if (sessionDuration !== undefined) {
    const n = Number(sessionDuration);
    if (!SESSION_DURATIONS.includes(n)) {
      return NextResponse.json({ error: `Длительность сессии: ${SESSION_DURATIONS.join(", ")} мин` }, { status: 400 });
    }
    normalizedDuration = n;
  }

  await db.$transaction(async (tx) => {
    const updateData: {
      title?: string;
      bio?: string;
      experience?: string;
      commissionPercent?: number;
      categories?: string[];
      directions?: string[];
      specialties?: Specialty[];
      tags?: string[];
      pricePerSession?: number;
      sessionDuration?: number;
    } = {};
    if (title !== undefined) updateData.title = title;
    if (bio !== undefined) updateData.bio = bio;
    if (experience !== undefined) updateData.experience = experience;
    if (commissionPercent !== undefined) updateData.commissionPercent = commissionPercent;
    if (normalizedCategories !== undefined) updateData.categories = normalizedCategories;
    if (normalizedDirections !== undefined) updateData.directions = normalizedDirections;
    if (normalizedSpecialties !== undefined) updateData.specialties = normalizedSpecialties;
    if (normalizedTags !== undefined) updateData.tags = normalizedTags;
    if (normalizedPrice !== undefined) updateData.pricePerSession = normalizedPrice;
    if (normalizedDuration !== undefined) updateData.sessionDuration = normalizedDuration;

    const p = await tx.practitioner.update({
      where: { id },
      data: updateData,
      select: { userId: true },
    });
    if (name) {
      await tx.user.update({ where: { id: p.userId }, data: { name } });
    }
    return p;
  });

  const p = await db.practitioner.findUnique({ where: { id }, select: { userId: true } });
  if (p) {
    const changed: string[] = [];
    if (commissionPercent !== undefined) changed.push(`комиссия=${commissionPercent}%`);
    if (normalizedPrice !== undefined) changed.push(`цена=${normalizedPrice}₽`);
    if (normalizedDuration !== undefined) changed.push(`длит.=${normalizedDuration}мин`);
    if (normalizedCategories !== undefined) changed.push(`специализации=[${normalizedCategories.join(",")}]`);
    if (normalizedDirections !== undefined) changed.push(`направления=[${normalizedDirections.join(",")}]`);
    if (normalizedSpecialties !== undefined) changed.push(`эзо-категории=[${normalizedSpecialties.join(",")}]`);
    if (normalizedTags !== undefined) changed.push(`задачи=[${normalizedTags.join(",")}]`);
    const note = changed.length > 0
      ? `Профиль обновлён администратором (${changed.join(", ")})`
      : `Профиль обновлён администратором`;
    await logAudit(session.user.id, "PRACTITIONER_PROFILE_UPDATE", p.userId, note);
  }

  return NextResponse.json({ ok: true });
}

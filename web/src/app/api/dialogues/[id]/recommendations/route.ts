import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { PractitionerStatus } from "@prisma/client";

type ProductRecommendation = {
  slug: string;
  name: string;
  href: string;
  reason: string;
};

/**
 * Map a classified dialogue topic into the v4.2 deepening product that
 * best matches the user's question. The "reason" copy is shown to the
 * user on the primary-answer triage rail to explain why we picked it.
 * Topics not in the table fall back to "perspectives" (the lowest-tier
 * deepening) so we always have something to recommend.
 */
function recommendProductForTopic(topic: string | null | undefined): ProductRecommendation {
  switch (topic) {
    case "relationships":
      return {
        slug: "compatibility",
        name: "Совместимость",
        href: "/products/compatibility",
        reason: "Вы можете отдельно сравнить взгляды друг друга — общий итог откроется по согласию.",
      };
    case "family":
      return {
        slug: "circle",
        name: "Круг ясности",
        href: "/products/circle",
        reason: "Бережный групповой формат, чтобы услышать близких без давления и спора.",
      };
    case "career":
      return {
        slug: "perspectives",
        name: "4 ракурса ответа",
        href: "/products/perspectives",
        reason: "Разложим ваше решение на разум, чувства, символ и действие — где ответ уже виден.",
      };
    case "money":
      return {
        slug: "deep-report",
        name: "Глубокий отчёт",
        href: "/products/deep-report",
        reason: "Структурируем варианты, риски и безопасные шаги в подробный документ-разбор.",
      };
    case "anxiety":
      return {
        slug: "seven-days",
        name: "7 дней к ясности",
        href: "/products/seven-days",
        reason: "Короткие ежедневные шаги, чтобы тревога не управляла днём.",
      };
    case "self":
      return {
        slug: "clarity-practice",
        name: "Практика ясности",
        href: "/products/clarity-practice",
        reason: "Регулярный ритм возвращения к себе — без давления и без срочности.",
      };
    case "other":
    default:
      return {
        slug: "perspectives",
        name: "4 ракурса ответа",
        href: "/products/perspectives",
        reason: "Универсальное углубление: посмотрим на ситуацию с четырёх сторон сразу.",
      };
  }
}

function ownerWhere(userId: string | null, guestSessionId: string | null) {
  if (userId) return { userId };
  if (guestSessionId) return { guestSessionId };
  return null;
}

function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildRationale(matchedTags: string[], reviewCount: number, rating: number): string {
  if (matchedTags.length > 0) {
    const tag = matchedTags[0];
    return `Работает с темой «${tag}» · ${reviewCount} ${reviewCount === 1 ? "отзыв" : reviewCount < 5 ? "отзыва" : "отзывов"}`;
  }
  if (rating >= 4.5 && reviewCount >= 5) {
    return `Высокий рейтинг · ${reviewCount} ${reviewCount < 5 ? "отзыва" : "отзывов"}`;
  }
  return `Опытный специалист · ${reviewCount} ${reviewCount < 5 ? "отзыва" : "отзывов"}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guestSessionId = userId ? null : readGuestSessionId(request);
  const whereOwner = ownerWhere(userId, guestSessionId);

  if (!whereOwner) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const { id } = await params;
  const dialogue = await db.dialogue.findFirst({
    where: { id, ...whereOwner, deletedAt: null },
    select: { id: true, topic: true, title: true, status: true },
  });

  if (!dialogue) {
    return errorWithRequestContext("NOT_FOUND", "Dialogue not found", 404, context);
  }

  if (dialogue.status !== "ANSWERED") {
    return errorWithRequestContext("BAD_REQUEST", "Dialogue is not answered yet", 400, context);
  }

  const keywords = extractKeywords(dialogue.topic ?? dialogue.title);

  const allPractitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    select: {
      id: true,
      slug: true,
      title: true,
      bio: true,
      tags: true,
      pricePerSession: true,
      ratingSum: true,
      reviewCount: true,
      sessionCount: true,
      user: { select: { name: true, avatarUrl: true } },
    },
    take: 50,
    orderBy: { reviewCount: "desc" },
  });

  type PractitionerRow = (typeof allPractitioners)[number];

  function scoreMatch(p: PractitionerRow): { score: number; matchedTags: string[] } {
    const matchedTags: string[] = [];
    for (const tag of p.tags) {
      const tagLower = tag.toLowerCase();
      if (keywords.some((kw) => tagLower.includes(kw) || kw.includes(tagLower))) {
        matchedTags.push(tag);
      }
    }
    const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
    const score = matchedTags.length * 10 + rating + p.reviewCount * 0.1;
    return { score, matchedTags };
  }

  const scored = allPractitioners.map((p) => {
    const { score, matchedTags } = scoreMatch(p);
    const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
    return { p, score, matchedTags, rating };
  });

  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3);

  const recommendations = top3.map(({ p, matchedTags, rating }) => ({
    id: p.id,
    slug: p.slug,
    name: p.user.name,
    title: p.title,
    bio: p.bio ? p.bio.slice(0, 120) : null,
    avatar: p.user.avatarUrl ?? null,
    pricePerSession: p.pricePerSession,
    rating: Math.round(rating * 10) / 10,
    reviewCount: p.reviewCount,
    rationale: buildRationale(matchedTags, p.reviewCount, rating),
    matchedTags,
  }));

  const productRecommendation = recommendProductForTopic(dialogue.topic);

  return jsonWithRequestContext(
    { recommendations, productRecommendation, dialogueId: dialogue.id },
    undefined,
    context,
  );
}

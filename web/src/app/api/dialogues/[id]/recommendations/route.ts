import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { readGuestSessionId } from "@/lib/guest-session";
import { requestContextFromHeaders } from "@/lib/request-context";
import { PractitionerStatus } from "@prisma/client";
import { effectiveCategories } from "@/lib/practitioner-taxonomy";
import {
  normalizeTopic,
  recommendPrimaryProduct,
  recommendSecondaryProducts,
  recommendSubscription,
  TOPIC_CATEGORIES,
  hashString,
} from "@/lib/dialogue-recommendations";

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

  const topic = normalizeTopic(dialogue.topic);
  const keywords = extractKeywords(dialogue.topic ?? dialogue.title);
  const topicCategories = TOPIC_CATEGORIES[topic];

  const allPractitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    select: {
      id: true,
      slug: true,
      title: true,
      bio: true,
      categories: true,
      directions: true,
      specialties: true,
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

  // W17: relevance is driven by the W3 taxonomy (the practitioner's
  // specialization matching the dialogue topic) + task-tag keyword overlap.
  // Quality (rating/reviews) is capped so it can break ties but never
  // dominates — that is what made the same top-reviewed person win every time.
  function scoreMatch(p: PractitionerRow): { score: number; matchedTags: string[]; categoryMatch: boolean } {
    const matchedTags: string[] = [];
    for (const tag of p.tags) {
      const tagLower = tag.toLowerCase();
      if (keywords.some((kw) => tagLower.includes(kw) || kw.includes(tagLower))) {
        matchedTags.push(tag);
      }
    }
    const effCats = effectiveCategories({
      categories: p.categories,
      specialties: p.specialties as string[],
      title: p.title,
    });
    const categoryHits = effCats.filter((c) => topicCategories.includes(c)).length;
    const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
    const quality = rating * 0.8 + Math.min(p.reviewCount, 50) * 0.05;
    const score = categoryHits * 20 + matchedTags.length * 8 + quality;
    return { score, matchedTags, categoryMatch: categoryHits > 0 };
  }

  const scored = allPractitioners.map((p) => {
    const { score, matchedTags, categoryMatch } = scoreMatch(p);
    const rating = p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0;
    return { p, score, matchedTags, rating, categoryMatch };
  });

  scored.sort((a, b) => b.score - a.score);

  // Variety: rotate within the relevant top-N by a stable per-dialogue hash so
  // the same topic surfaces different specialists across dialogues (but stays
  // stable on refresh of the same dialogue). Prefer category-matched people; if
  // none match, fall back to the overall top so we always show someone.
  const relevant = scored.filter((s) => s.categoryMatch);
  const pool = (relevant.length > 0 ? relevant : scored).slice(0, 5);
  const seed = hashString(dialogue.id);
  const rotated = pool.length > 0
    ? pool.map((_, i) => pool[(i + (seed % pool.length)) % pool.length])
    : [];
  const top3 = rotated.slice(0, 3);

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

  const productRecommendation = recommendPrimaryProduct(dialogue.topic);
  const secondaryProducts = recommendSecondaryProducts(dialogue.topic, productRecommendation.slug);

  // Suppress the subscription nudge for users who already have one.
  const hasActiveSubscription = userId
    ? (await db.userSubscription.count({
        where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
      })) > 0
    : false;
  const subscription = recommendSubscription(productRecommendation.slug, hasActiveSubscription);

  return jsonWithRequestContext(
    { recommendations, productRecommendation, secondaryProducts, subscription, dialogueId: dialogue.id },
    undefined,
    context,
  );
}

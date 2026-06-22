import type { NextRequest } from "next/server";
import { PractitionerStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";
import { effectiveCategories } from "@/lib/practitioner-taxonomy";
import { getV5Product } from "@/lib/v5-products";
import { recommendSecondaryProducts } from "@/lib/dialogue-recommendations";

// #6/#4: после расклада предлагаем (1) тот же сервис с CTA под тему вопроса,
// (2) смежные услуги «другие форматы» и (3) специалиста-эзотерика. Текст основной
// кнопки подбирается под тему расклада, чтобы он не выглядел шаблонным.
const TAROT_THEME_FOLLOWUP: Record<string, { cta: string; other: string; topic: string }> = {
  "Любовь и отношения": { cta: "Узнать, что ещё карты говорят об отношениях", other: "synastry", topic: "relationships" },
  "Работа и призвание": { cta: "Спросить карты про работу и призвание", other: "reframe", topic: "career" },
  "Деньги и быт": { cta: "Спросить карты про деньги и опору", other: "reframe", topic: "money" },
  "Семья и дом": { cta: "Спросить карты про семью и дом", other: "natal-chart", topic: "family" },
  "Самопознание": { cta: "Задать картам новый вопрос о себе", other: "natal-chart", topic: "self" },
  "Перемены и выбор": { cta: "Спросить карты про выбор и перемены", other: "reframe", topic: "other" },
  "На сегодня": { cta: "Вытянуть карту на сегодня ещё раз", other: "numerology", topic: "other" },
};
const DEFAULT_FOLLOWUP = { cta: "Задать картам новый вопрос", other: "natal-chart", topic: "other" };

function readTarotTheme(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const nested = (meta.generationMetadata ?? meta.previewGenerationMetadata) as Record<string, unknown> | undefined;
  const theme = nested?.tarotTheme ?? meta.tarotTheme;
  return typeof theme === "string" ? theme : null;
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);

  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true, productKey: true, metadata: true },
  });
  if (!result) return errorWithRequestContext("NOT_FOUND", "Результат не найден", 404, context);

  const theme = readTarotTheme(result.metadata);
  const followup = (theme && TAROT_THEME_FOLLOWUP[theme]) || DEFAULT_FOLLOWUP;

  const otherDef = getV5Product(followup.other);
  const otherProduct = otherDef
    ? { slug: otherDef.slug, name: otherDef.name, href: `/products/${otherDef.slug}` }
    : null;

  // #4: «другие форматы» — смежные услуги по теме расклада (исключая само Таро).
  const secondaryProducts = recommendSecondaryProducts(followup.topic, "tarot", 3).map((item) => ({
    slug: item.slug,
    name: item.name,
    href: item.href,
    price: item.price,
    creditCost: item.creditCost,
  }));

  // Специалист-эзотерик: приоритет тарологам, затем рейтинг; вариативность по
  // id результата, чтобы при разных раскладах подсвечивались разные люди.
  const practitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    select: {
      id: true,
      slug: true,
      title: true,
      categories: true,
      specialties: true,
      pricePerSession: true,
      ratingSum: true,
      reviewCount: true,
      user: { select: { name: true } },
    },
    take: 50,
    orderBy: { reviewCount: "desc" },
  });

  const esoteric = practitioners.filter((p) => {
    const cats = effectiveCategories({
      categories: p.categories,
      specialties: p.specialties as string[],
      title: p.title,
    });
    return cats.includes("esoteric") || (p.specialties as string[]).includes("TAROT");
  });

  esoteric.sort((a, b) => {
    const aTarot = (a.specialties as string[]).includes("TAROT") ? 1 : 0;
    const bTarot = (b.specialties as string[]).includes("TAROT") ? 1 : 0;
    if (aTarot !== bTarot) return bTarot - aTarot;
    const aRating = a.reviewCount > 0 ? a.ratingSum / a.reviewCount : 0;
    const bRating = b.reviewCount > 0 ? b.ratingSum / b.reviewCount : 0;
    return bRating - aRating;
  });

  const pool = esoteric.slice(0, Math.min(3, esoteric.length));
  const chosen = pool.length > 0 ? pool[seedFromId(result.id) % pool.length] : null;
  const specialist = chosen
    ? {
        slug: chosen.slug,
        name: chosen.user.name ?? "Специалист",
        title: chosen.title,
        pricePerSession: chosen.pricePerSession,
        rationale: (chosen.specialties as string[]).includes("TAROT") ? "Работает с Таро" : "Эзотерический разбор",
      }
    : null;

  return jsonWithRequestContext(
    { repeatCta: followup.cta, otherProduct, secondaryProducts, specialist },
    undefined,
    context,
  );
}

import db from "@/lib/db";
import { approvedLibraryEntries, type AnonymousLibraryEntry } from "@/data/anonymous-library";
import { CREDIT_PACKS, V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";

export type MiniAppPractitionerCard = {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  avatar: string | null;
  verified: boolean;
  tags: string[];
  categories: string[];
  priceRub: number;
  durationMin: number;
  rating: number;
  reviewCount: number;
};

export type MiniAppOffer = {
  key: string;
  kind: "subscription" | "credits";
  title: string;
  price: string;
  note: string;
  badge?: string;
  benefits: string[];
};

function rub(kopecks: number) {
  return `${(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

export function miniAppOffers(): MiniAppOffer[] {
  const subscriptions: MiniAppOffer[] = ["plus", "premium"].map((key) => {
    const plan = V5_SUBSCRIPTION_PLANS[key];
    return {
      key: `plan:${key}`,
      kind: "subscription",
      title: plan.name,
      price: `${rub(plan.amountKopecks)} / месяц`,
      note: plan.trialDays > 0 ? `${plan.trialDays} дней пробного периода` : "Без пробного периода",
      badge: key === "premium" ? "больше возможностей" : undefined,
      benefits: [
        `${plan.creditsPerPeriod} баллов каждый месяц`,
        `${plan.includedProducts.length} ${plan.includedProducts.length === 1 ? "разбор" : "разбора"} включено`,
        "Условия видны до подтверждения",
      ],
    };
  });
  const credits: MiniAppOffer[] = Object.entries(CREDIT_PACKS).map(([key, pack]) => ({
    key: `credits:${key}`,
    kind: "credits",
    title: pack.label,
    price: rub(pack.amountKopecks),
    note: "Действуют 12 месяцев",
    badge: pack.badge,
    benefits: ["Для цифровых разборов", "Не сгорают в конце месяца", "Сначала показываем итоговую сумму"],
  }));
  return [...subscriptions, ...credits];
}

export function miniAppLibrary(): AnonymousLibraryEntry[] {
  return approvedLibraryEntries();
}

export async function loadMiniAppPractitioners(): Promise<MiniAppPractitionerCard[]> {
  const rows = await db.practitioner.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ verified: "desc" }, { founding: "desc" }, { reviewCount: "desc" }],
    take: 24,
    include: {
      user: { select: { name: true, avatarUrl: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
  }).catch(() => []);

  return rows.map((row) => {
    const rate = row.priceRates[0];
    return {
      id: row.id,
      slug: row.slug,
      name: row.user.name ?? "Специалист ETerapy",
      title: row.title,
      bio: row.bio,
      avatar: row.user.avatarUrl?.startsWith("/") ? row.user.avatarUrl : null,
      verified: row.verified,
      tags: row.tags.slice(0, 4),
      categories: row.categories.slice(0, 3),
      priceRub: rate?.priceRub ?? row.pricePerSession,
      durationMin: rate?.durationMin ?? 50,
      rating: row.reviewCount > 0 ? row.ratingSum / row.reviewCount : 0,
      reviewCount: row.reviewCount,
    };
  });
}

export async function loadMiniAppPractitioner(slug: string) {
  const practitioners = await loadMiniAppPractitioners();
  return practitioners.find((item) => item.slug === slug) ?? null;
}

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
  /** B584: профиль-витрина — записаться нельзя, сессии по нему не проводятся. */
  demoAccount: boolean;
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
  // B554 п.10: у всех трёх пакетов был ОДИН и тот же список выгод, причём
  // «Сначала показываем итоговую сумму» — это обещание корзины, а не свойство
  // пакета. Пакеты отличаются ценой балла и тем, на что их хватает: это и
  // пишем, считая от реальных цен, а не текстом вручную.
  const cheapestPerCredit = Math.min(
    ...Object.values(CREDIT_PACKS).map((pack) => pack.amountKopecks / pack.credits),
  );
  const credits: MiniAppOffer[] = Object.entries(CREDIT_PACKS).map(([key, pack]) => {
    const perCredit = pack.amountKopecks / pack.credits;
    const savingPercent = Math.round((1 - perCredit / (CREDIT_PACKS["pack-5"].amountKopecks / CREDIT_PACKS["pack-5"].credits)) * 100);
    return {
      key: `credits:${key}`,
      kind: "credits" as const,
      title: pack.label,
      price: rub(pack.amountKopecks),
      note: `${rub(Math.round(perCredit))} за балл${perCredit === cheapestPerCredit ? " — лучшая цена" : ""}`,
      badge: pack.badge,
      benefits: [
        // «до», потому что разборы стоят от 1 балла: Переосмысление — 1,
        // Таро и Разбор переписки — 2, чат — 4.
        `Открывает до ${pack.credits} ${pack.credits === 1 ? "разбора" : "разборов"}`,
        savingPercent > 0 ? `Выгоднее пакета «5 баллов» на ${savingPercent}%` : "Базовая цена балла",
        "Действуют 12 месяцев, не сгорают в конце месяца",
      ],
    };
  });
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
      demoAccount: row.demoAccount,
    };
  });
}

export async function loadMiniAppPractitioner(slug: string) {
  const practitioners = await loadMiniAppPractitioners();
  return practitioners.find((item) => item.slug === slug) ?? null;
}

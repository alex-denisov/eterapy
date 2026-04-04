import { Suspense } from "react";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PractitionersCatalog } from "./catalog-client";
import { SPECIALTY_LABELS } from "@/lib/types";

// Серверная загрузка — быстрый SSR без клиентского fetch
async function getPractitioners() {
  const practitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    include: { user: { select: { name: true } } },
    orderBy: { reviewCount: "desc" },
  });

  return practitioners.map((p) => ({
    id: p.id,
    name: p.user.name,
    title: p.title,
    bio: p.bio,
    specialties: p.specialties as string[],
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
    nextSlot: null as string | null,
  }));
}

export const metadata = {
  title: "Каталог практиков — ETerapy",
  description: "Верифицированные таролог, астролог, нумеролог. Фиксированная цена. Реальные отзывы.",
};

export default async function PractitionersPage() {
  const practitioners = await getPractitioners();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">Каталог практиков</h1>
        <p className="mt-2 text-muted-foreground">
          {practitioners.length} верифицированных специалиста · Фиксированная цена · Реальные отзывы
        </p>
      </div>

      <Suspense fallback={<div className="text-muted-foreground">Загружаем...</div>}>
        <PractitionersCatalog
          initialPractitioners={practitioners}
          specialtyLabels={SPECIALTY_LABELS}
        />
      </Suspense>
    </div>
  );
}

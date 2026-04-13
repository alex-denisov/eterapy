import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { SPECIALTY_LABELS } from "@/lib/types";
import { CabinetPractitionersCatalog } from "./cabinet-practitioners-catalog";

export const dynamic = "force-dynamic";

async function getPractitioners() {
  const practitioners = await db.practitioner.findMany({
    where: { status: PractitionerStatus.ACTIVE },
    include: {
      user: { select: { name: true } },
      priceRates: { where: { enabled: true }, orderBy: { priceRub: "asc" }, take: 1 },
    },
    orderBy: { reviewCount: "desc" },
  });

  return practitioners.map((p) => {
    const minRate = p.priceRates[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.user.name,
      title: p.title,
      bio: p.bio,
      specialties: p.specialties as string[],
      tags: p.tags,
      experience: p.experience,
      pricePerSession: minRate?.priceRub ?? p.pricePerSession,
      minDuration: minRate?.durationMin ?? 60,
      languages: p.languages,
      verified: p.verified,
      founding: p.founding,
      rating: p.reviewCount > 0 ? p.ratingSum / p.reviewCount : 0,
      reviewCount: p.reviewCount,
      sessionCount: p.sessionCount,
    };
  });
}

export default async function CabinetPractitionersPage() {
  const practitioners = await getPractitioners();
  return (
    <div className="px-6 py-8 max-w-5xl">
      <h1 className="font-heading text-2xl font-bold mb-6">Найти практика</h1>
      <CabinetPractitionersCatalog
        practitioners={practitioners}
        specialtyLabels={SPECIALTY_LABELS}
      />
    </div>
  );
}

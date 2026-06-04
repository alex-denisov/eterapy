export const dynamic = "force-dynamic";

import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PricingPlans } from "./pricing-plans";

export const metadata = createPublicPageMetadata("/pricing");

// W19/Y9: the "Встречи" price ("от …") must reflect the BASE 60-minute session
// tariff — the minimum enabled 60-min PriceRate of an active practitioner — not
// a shorter slot or a hardcoded fiction. Fall back to any enabled rate only if
// no 60-min tariff is published yet.
async function getMinSessionPriceRub(): Promise<number | null> {
  const base = { enabled: true, practitioner: { status: PractitionerStatus.ACTIVE } } as const;
  const sixty = await db.priceRate
    .findFirst({
      where: { ...base, durationMin: 60 },
      orderBy: { priceRub: "asc" },
      select: { priceRub: true },
    })
    .catch(() => null);
  if (sixty?.priceRub) return sixty.priceRub;

  const anyRate = await db.priceRate
    .findFirst({
      where: base,
      orderBy: { priceRub: "asc" },
      select: { priceRub: true },
    })
    .catch(() => null);
  return anyRate?.priceRub ?? null;
}

export default async function PricingPage() {
  const minSessionPriceRub = await getMinSessionPriceRub();

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />
      <PricingPlans minSessionPriceRub={minSessionPriceRub} />
    </main>
  );
}

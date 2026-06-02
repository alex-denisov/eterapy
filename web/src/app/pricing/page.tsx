export const dynamic = "force-dynamic";

import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import db from "@/lib/db";
import { PractitionerStatus } from "@prisma/client";
import { PricingPlans } from "./pricing-plans";

export const metadata = createPublicPageMetadata("/pricing");

// W19: the "Встречи" prices must reflect the real session cost (the minimum
// enabled 60-min PriceRate of an active practitioner), not a hardcoded fiction.
async function getMinSessionPriceRub(): Promise<number | null> {
  const rate = await db.priceRate
    .findFirst({
      where: { enabled: true, practitioner: { status: PractitionerStatus.ACTIVE } },
      orderBy: { priceRub: "asc" },
      select: { priceRub: true },
    })
    .catch(() => null);
  return rate?.priceRub ?? null;
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

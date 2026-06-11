export const dynamic = "force-dynamic";

import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getMinSessionPriceRub } from "@/lib/session-pricing-server";
import { PricingPlans } from "./pricing-plans";

export const metadata = createPublicPageMetadata("/pricing");

// B366: the "Встречи" floor comes from the single session-pricing source
// (cheapest enabled 60-min tariff of an active practitioner, falling back to the
// advertised 2 000 ₽ floor) — same number every surface shows.
export default async function PricingPage() {
  const minSessionPriceRub = await getMinSessionPriceRub();

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />
      <PricingPlans minSessionPriceRub={minSessionPriceRub} />
    </main>
  );
}

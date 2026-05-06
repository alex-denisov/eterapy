import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { PricingPlans } from "./pricing-plans";

export const metadata = createPublicPageMetadata("/pricing");

export default function PricingPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />
      <PricingPlans />
    </main>
  );
}

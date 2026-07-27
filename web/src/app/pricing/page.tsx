// INC-080: `force-dynamic` остался от версии страницы, которая ходила в базу за
// нижней границей цены живой сессии. Ходить перестала ещё в B396 (комментарий
// ниже), а флаг остался — и заставлял пересобирать статический прайс на каждый
// заход. Снят.
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { PricingPlans } from "./pricing-plans";

export const metadata = createPublicPageMetadata("/pricing");

// B396: the à-la-carte formats table (the only consumer of the live session floor)
// was removed in favour of a slim link to the /products catalog, so this page no
// longer needs a DB round-trip — it renders purely from static plan metadata.
export default function PricingPage() {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pricing-page">
      <PublicJsonLd route="/pricing" />
      <PricingPlans />
    </main>
  );
}

import { ServiceCatalog } from "@/components/products/service-catalog";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/products");

// B456: calm, above-the-fold catalog. The hero is a single compact column — a
// warm client-facing question (no internal «углубление» term) and one quiet
// sub-line. No big CTA / 3-step aside / redundant second header: the catalog's
// own sections + the slim «Первый разбор» entry row carry the page.
export default function ProductsPage() {
  return (
    <main className="soft-clarity-page soft-products-page" data-testid="products-page">
      <PublicJsonLd route="/products" />

      <section className="soft-shell soft-catalog-hero">
        <p className="soft-eyebrow">форматы поддержки</p>
        <h1 className="soft-h1">С чего бы вы хотели начать?</h1>
        <p className="soft-lede">
          Короткий разбор вашей ситуации, разборы в своём темпе или разговор с живым
          специалистом — выберите то, что подходит сейчас.
        </p>
      </section>

      <section className="soft-shell pb-20">
        <ServiceCatalog showFooterLink={false} />
      </section>
    </main>
  );
}

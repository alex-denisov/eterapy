import { jsonLdForPublicPage, type PublicSeoRoute } from "@/lib/public-page-seo";

type PublicJsonLdProps = {
  route: PublicSeoRoute;
  offerPriceRubles?: number;
};

export function PublicJsonLd({ route, offerPriceRubles }: PublicJsonLdProps) {
  const jsonLd = JSON.stringify(jsonLdForPublicPage(route, { offerPriceRubles })).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}

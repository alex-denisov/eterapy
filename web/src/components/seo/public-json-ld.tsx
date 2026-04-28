import { jsonLdForPublicPage, type PublicSeoRoute } from "@/lib/public-page-seo";

type PublicJsonLdProps = {
  route: PublicSeoRoute;
};

export function PublicJsonLd({ route }: PublicJsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdForPublicPage(route)) }}
    />
  );
}

import { jsonLdForPublicPage, type PublicSeoRoute } from "@/lib/public-page-seo";

type PublicJsonLdProps = {
  route: PublicSeoRoute;
};

export function PublicJsonLd({ route }: PublicJsonLdProps) {
  const jsonLd = JSON.stringify(jsonLdForPublicPage(route)).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}

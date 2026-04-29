import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HaloVisual, PremiumCard, PremiumHero, PremiumPage, PremiumSection } from "@/components/v5/premium";
import { Disclaimer } from "@/components/ui/disclaimer";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata, type PublicSeoRoute } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";
import { getV5Product, v5Products } from "@/lib/v5-products";

export function generateStaticParams() {
  return v5Products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getV5Product(slug);
  if (!product) return {};
  return createPublicPageMetadata(product.route as PublicSeoRoute);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getV5Product(slug);
  if (!product) notFound();

  return (
    <PremiumPage data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />

      <PremiumHero
        eyebrow={product.eyebrow}
        title={<>{product.name}</>}
        lead={product.summary}
        visual={
          <PremiumCard tone={product.tone === "private" || product.tone === "route" ? "lavender" : "gold"} className="p-6">
            <HaloVisual className="max-w-[220px]" />
            <p className="mt-4 text-sm text-muted-foreground">Цена</p>
            <p className="mt-1 font-heading text-4xl font-medium text-primary">{product.price}</p>
            <Disclaimer className="mt-5">{product.privacy}</Disclaimer>
          </PremiumCard>
        }
      >
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="product-dialogue-cta"
            >
              {product.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
              Все продукты
            </Link>
          </div>
      </PremiumHero>

      <PremiumSection>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <PremiumCard>
          <h2 className="font-heading text-3xl font-medium">Что получает пользователь</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{product.result}</p>
        </PremiumCard>

        <PremiumCard tone="lavender">
          <h2 className="font-heading text-3xl font-medium">UX и продуктовые механики</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {product.mechanics.map((item) => (
              <li key={item} className="premium-chip w-full justify-start">
                {item}
              </li>
            ))}
          </ul>
        </PremiumCard>
      </div>
      </PremiumSection>
    </PremiumPage>
  );
}

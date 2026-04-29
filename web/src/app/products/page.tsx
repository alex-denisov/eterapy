import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { HaloVisual, PremiumCard, PremiumHero, PremiumPage, PremiumSection } from "@/components/v5/premium";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";
import { v5Products } from "@/lib/v5-products";

export const metadata = createPublicPageMetadata("/products");

export default function ProductsPage() {
  return (
    <PremiumPage data-testid="products-page">
      <PublicJsonLd route="/products" />

      <PremiumHero
        eyebrow="Продукты ETerapy"
        title={<>Углубление после <span className="text-brand-soft-gold">первичного ответа</span></>}
        lead="Каждый продукт начинается от контекста вопроса: сначала первичный ответ, затем платная глубина, маршрут, совместимость, карта или специалист."
        visual={<HaloVisual />}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
            data-testid="products-dialogue-cta"
          >
            Задать вопрос
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
            Посмотреть цены
          </Link>
        </div>
      </PremiumHero>

      <PremiumSection
        eyebrow="Сценарии"
        title={<>Все способы <span className="text-brand-soft-gold">углубления</span></>}
        lead="Каждая карточка ведет в самостоятельный сценарий и сохраняет question-first структуру."
      >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {v5Products.map((product) => (
          <Link
            key={product.slug}
            href={product.route}
            className="group block"
            data-testid={`product-card-${product.slug}`}
          >
            <PremiumCard tone={product.tone === "private" || product.tone === "route" ? "lavender" : "gold"} className="h-full transition-transform group-hover:-translate-y-1">
            <div className="flex items-start justify-between gap-3">
              <p className="premium-eyebrow">{product.eyebrow}</p>
              <span className="premium-chip premium-chip-gold">
                {product.price}
              </span>
            </div>
            <h2 className="mt-5 font-heading text-2xl font-medium text-foreground">{product.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.summary}</p>
            <p className="mt-5 text-sm font-medium text-primary group-hover:text-brand-soft-gold">
              Подробнее
            </p>
            </PremiumCard>
          </Link>
        ))}
      </div>
      </PremiumSection>
    </PremiumPage>
  );
}

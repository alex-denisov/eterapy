import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";
import { v5Products } from "@/lib/v5-products";

export const metadata = createPublicPageMetadata("/products");

export default function ProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-14 md:py-20" data-testid="products-page">
      <PublicJsonLd route="/products" />

      <section className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Продукты v5</p>
        <h1 className="mt-3 font-heading text-4xl font-bold leading-tight md:text-6xl">
          Углубление после первичного ответа
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Каждый продукт начинается от контекста вопроса: сначала первичный ответ,
          затем платная глубина, маршрут, совместимость, карта или специалист.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
            data-testid="products-dialogue-cta"
          >
            Задать вопрос
          </Link>
          <Link href="/pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
            Посмотреть цены
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {v5Products.map((product) => (
          <Link
            key={product.slug}
            href={product.route}
            className="group rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-5 transition hover:border-primary/40 hover:bg-card/40"
            data-testid={`product-card-${product.slug}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-primary">{product.eyebrow}</p>
              <span className="rounded-full border border-border/40 bg-background/40 px-3 py-1 text-sm text-muted-foreground">
                {product.price}
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-foreground">{product.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.summary}</p>
            <p className="mt-5 text-sm font-medium text-primary group-hover:text-brand-soft-gold">
              Подробнее
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
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
    <main className="mx-auto max-w-6xl px-4 py-14 md:py-20" data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div>
          <p className="text-sm font-semibold text-primary">{product.eyebrow}</p>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight md:text-6xl">
            {product.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {product.summary}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/all-modalities/checkin"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/all-modalities/checkin"
              data-testid="product-dialogue-cta"
            >
              {product.cta}
            </Link>
            <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
              Все продукты
            </Link>
          </div>
        </div>

        <aside className="rounded-[var(--radius-card)] border border-border/40 bg-card/40 p-5">
          <p className="text-sm text-muted-foreground">Цена</p>
          <p className="mt-2 text-3xl font-bold text-primary">{product.price}</p>
          <Disclaimer className="mt-4">{product.privacy}</Disclaimer>
        </aside>
      </section>

      <section className="mt-14 grid gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-6">
          <h2 className="font-heading text-2xl font-semibold">Что получает пользователь</h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{product.result}</p>
        </div>

        <div className="rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 p-6">
          <h2 className="font-heading text-2xl font-semibold">UX и продуктовые механики</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {product.mechanics.map((item) => (
              <li key={item} className="rounded-full border border-border/30 bg-background/50 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

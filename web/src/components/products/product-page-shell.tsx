import Link from "next/link";
import type React from "react";
import { ArrowRight, ChevronLeft, FileText, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { ProductHeroPrice } from "@/components/products/product-hero-price";
import { buildNatalWheel } from "@/lib/esoteric-chart";
import { getProductPageSpec, PRODUCT_PAGE_FAMILY_SPECS } from "@/lib/product-page-redesign";
import type { V5Product } from "@/lib/v5-products";

const PROTOTYPE_NATAL_WHEEL = buildNatalWheel("12.04.1992, 14:35, Москва");

function PreviewGlyph({ product }: { product: V5Product }) {
  if (product.slug === "natal-chart") {
    return (
      <div className="soft-product-shell-chart" data-testid="product-natal-preview">
        <ZodiacWheel wheel={PROTOTYPE_NATAL_WHEEL} />
      </div>
    );
  }

  return (
    <div className="soft-product-shell-symbol" aria-hidden="true">
      {product.tone === "private" ? <LockKeyhole className="size-8" /> : product.creditCost && product.creditCost > 2 ? <FileText className="size-8" /> : <Sparkles className="size-8" />}
    </div>
  );
}

function ProductHeroPreview({ product }: { product: V5Product }) {
  const spec = getProductPageSpec(product.slug);

  return (
    <aside className="soft-product-shell-preview" data-testid="product-hero-preview" aria-label="Превью результата">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow" data-testid="product-family-spec">{PRODUCT_PAGE_FAMILY_SPECS[spec.family].label}</p>
          <h2 className="mt-2 font-heading text-[1.25rem] leading-tight text-[var(--soft-ink)]">{spec.previewTitle}</h2>
        </div>
        <span className="soft-badge soft-badge-warm shrink-0">превью</span>
      </div>

      <PreviewGlyph product={product} />

      <ul className="mt-4 grid gap-2 text-sm text-[var(--soft-ink-soft)]">
        {spec.previewBullets.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-[0.42rem] size-1.5 shrink-0 rounded-full bg-[var(--soft-terracotta-dark)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function ProductPageShell({
  product,
  action,
}: {
  product: V5Product;
  action: React.ReactNode;
}) {
  const spec = getProductPageSpec(product.slug);
  const family = PRODUCT_PAGE_FAMILY_SPECS[spec.family];

  return (
    <section className="soft-product-shell-layout" data-testid="product-page-shell">
      <div className="soft-product-shell-above" data-testid="product-above-fold">
        <div className="soft-product-shell-copy">
          <Link
            href="/products"
            aria-label="Назад к услугам"
            data-testid="product-hero-back"
            className="soft-product-shell-back"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>

          <p className="soft-eyebrow mt-5">{product.eyebrow}</p>
          <h1 className="mt-3 font-heading text-[clamp(2.15rem,5vw,4.35rem)] leading-[0.96] text-[var(--soft-ink)]">
            {product.name}
          </h1>
          <p className="mt-4 max-w-[35rem] text-base leading-relaxed text-[var(--soft-ink-soft)] md:text-lg">
            {spec.primaryPromise}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <ProductHeroPrice product={product} />
            <a href="#product-service-start" className="soft-button soft-button-primary" data-testid="product-primary-cta">
              {product.directCta ?? product.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-5 grid gap-2 text-sm text-[var(--soft-ink-soft)] sm:grid-cols-2">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span>{spec.trustLine}</span>
            </p>
            <p className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span>Подписки и купленные баллы показываются до списания.</span>
            </p>
          </div>

          <p className="mt-5 max-w-[35rem] text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            {family.aboveFoldRule}
          </p>
        </div>

        <ProductHeroPreview product={product} />
      </div>

      <div id="product-service-start" className="soft-product-shell-action" data-testid="product-service-start">
        {action}
      </div>

      <p className="soft-product-shell-legal">
        Результат носит информационно-рефлексивный характер и не заменяет консультацию специалиста.
      </p>
    </section>
  );
}

import type React from "react";
import { ArrowRight, FileText, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { ProductBackLink } from "@/components/products/product-back-link";
import { TarotSpreadCards, ZodiacWheel } from "@/components/products/esoteric-chart-visuals";
import { HumanDesignBodygraph } from "@/components/products/human-design-bodygraph";
import { ProductHeroPrice } from "@/components/products/product-hero-price";
import { buildNatalWheel } from "@/lib/esoteric-chart";
import { computeHumanDesign } from "@/lib/human-design";
import { getProductPageSpec, PRODUCT_PAGE_FAMILY_SPECS } from "@/lib/product-page-redesign";
import { ProductDisclaimer } from "@/components/products/product-legal";
import { drawTarotSpread } from "@/lib/symbolic-products";
import type { V5Product } from "@/lib/v5-products";

const PROTOTYPE_NATAL_WHEEL = buildNatalWheel("12.04.1992, 14:35, Москва");
const PROTOTYPE_TAROT_SPREAD = drawTarotSpread("b437:tarot-product-hero");
const PROTOTYPE_HD_CHART = computeHumanDesign(new Date(Date.UTC(1990, 4, 15, 7, 30, 0)));

function NumerologyPreview() {
  return (
    <div className="soft-product-shell-number" data-testid="product-numerology-preview" aria-label="Превью числового портрета">
      <div className="soft-product-shell-number-orbit">
        <span>7</span>
        <i style={{ "--i": 0 } as React.CSSProperties}>1</i>
        <i style={{ "--i": 1 } as React.CSSProperties}>2</i>
        <i style={{ "--i": 2 } as React.CSSProperties}>5</i>
        <i style={{ "--i": 3 } as React.CSSProperties}>9</i>
      </div>
      <p>ключевое число · цикл года · сильная сторона</p>
    </div>
  );
}

function SurnamePreview() {
  return (
    <div className="soft-product-shell-lineage" data-testid="product-surname-preview" aria-label="Превью истории фамилии">
      <svg viewBox="0 0 320 190" role="img" aria-label="Карта происхождения фамилии">
        <path d="M54 142 C98 78, 137 76, 160 42 C185 77, 224 78, 266 142" fill="none" stroke="var(--soft-terracotta-dark)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M160 42 L160 152" stroke="var(--soft-paper-edge)" strokeWidth="1.4" strokeDasharray="4 5" />
        {[
          [54, 142, "корень"],
          [160, 42, "фамилия"],
          [266, 142, "тема"],
          [160, 152, "род"],
        ].map(([x, y, label]) => (
          <g key={label}>
            <circle cx={x} cy={y} r="22" fill="var(--soft-paper-card)" stroke="var(--soft-terracotta-dark)" strokeWidth="1.5" />
            <text x={x} y={Number(y) + 4} textAnchor="middle" fontSize="10" fill="var(--soft-bordeaux)">{label}</text>
          </g>
        ))}
      </svg>
      <p>происхождение · география формы · мягкая родовая тема</p>
    </div>
  );
}

function FamilyPreview() {
  return (
    <div className="soft-product-shell-family" data-testid="product-family-preview" aria-label="Превью семейных вопросов">
      <svg viewBox="0 0 320 210" role="img" aria-label="Карта семейных повторов">
        <path d="M160 34 L90 94 L160 94 L230 94 L160 34 Z" fill="none" stroke="var(--soft-paper-edge)" strokeWidth="1.4" />
        <path d="M90 94 L68 164 M160 94 L160 164 M230 94 L252 164" stroke="var(--soft-paper-edge)" strokeWidth="1.4" />
        <path d="M70 164 C102 132, 130 132, 160 164 C190 132, 220 132, 252 164" fill="none" stroke="var(--soft-terracotta-dark)" strokeWidth="2.4" strokeLinecap="round" />
        {[
          [160, 34, "правило"],
          [90, 94, "роль"],
          [160, 94, "повтор"],
          [230, 94, "граница"],
          [68, 164, "вы"],
          [160, 164, "выбор"],
          [252, 164, "шаг"],
        ].map(([x, y, label]) => (
          <g key={label}>
            <circle cx={x} cy={y} r="18" fill="var(--soft-paper-card)" stroke="var(--soft-terracotta-dark)" strokeWidth="1.3" />
            <text x={x} y={Number(y) + 4} textAnchor="middle" fontSize="9" fill="var(--soft-bordeaux)">{label}</text>
          </g>
        ))}
      </svg>
      <p>что повторяется · что уже не ваше · где появляется выбор</p>
    </div>
  );
}

function PreviewGlyph({ product }: { product: V5Product }) {
  if (product.slug === "tarot") {
    return (
      <div className="soft-product-shell-tarot" data-testid="product-tarot-preview">
        <TarotSpreadCards cards={PROTOTYPE_TAROT_SPREAD} />
      </div>
    );
  }

  if (product.slug === "natal-chart") {
    return (
      <div className="soft-product-shell-chart" data-testid="product-natal-preview">
        <ZodiacWheel wheel={PROTOTYPE_NATAL_WHEEL} />
      </div>
    );
  }

  if (product.slug === "numerology") return <NumerologyPreview />;

  if (product.slug === "human-design") {
    return (
      <div className="soft-product-shell-hd" data-testid="product-human-design-preview">
        <HumanDesignBodygraph chart={PROTOTYPE_HD_CHART} />
      </div>
    );
  }

  if (product.slug === "surname-origin") return <SurnamePreview />;

  if (product.slug === "family-questions") return <FamilyPreview />;

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
          {/* B647: возврат по истории с восстановлением прокрутки, каталог —
              запасной вариант для захода прямой ссылкой. */}
          <ProductBackLink label="Назад к услугам" className="soft-product-shell-back" />

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

      <ProductDisclaimer className="soft-product-shell-legal mt-0 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]" />
    </section>
  );
}

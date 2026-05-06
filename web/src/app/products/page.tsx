import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { v5Products } from "@/lib/v5-products";

export const metadata = createPublicPageMetadata("/products");

export default function ProductsPage() {
  return (
    <main className="soft-clarity-page soft-products-page" data-testid="products-page">
      <PublicJsonLd route="/products" />

      <section className="soft-shell soft-public-section" style={{ paddingBlock: "clamp(3rem, 7vw, 6rem) clamp(2rem, 5vw, 4rem)" }}>
        <p className="soft-eyebrow">Продукты ETerapy</p>
        <h1 className="soft-display mt-3" style={{ maxWidth: "42rem" }}>
          Углубление после <span className="soft-italic">первичного ответа</span>
        </h1>
        <p className="soft-lede mt-5" style={{ maxWidth: "36rem" }}>
          Каждый продукт начинается от контекста вопроса: сначала диалог ясности, затем платная глубина, маршрут, совместимость, карта или специалист.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/checkin"
            className="soft-button soft-button-primary"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="products-dialogue-cta"
          >
            Задать вопрос
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/pricing" className="soft-button soft-button-ghost">
            Посмотреть цены
          </Link>
        </div>
      </section>

      <section className="soft-shell pb-20">
        <div className="mb-6">
          <p className="soft-eyebrow">Сценарии</p>
          <h2 className="soft-h2 mt-2">Все способы углубления</h2>
        </div>
        <div className="soft-products-grid">
          {v5Products.map((product) => (
            <Link
              key={product.slug}
              href={product.route}
              className="soft-card soft-product-tile"
              data-testid={`product-card-${product.slug}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="soft-eyebrow">{product.eyebrow}</p>
                <span className="soft-badge soft-badge-warm">{product.price}</span>
              </div>
              <h2 className="soft-h3 mt-5">{product.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.summary}</p>
              <p className="mt-5 text-sm font-semibold text-[var(--soft-terracotta-dark)]">Подробнее</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

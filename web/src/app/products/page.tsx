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

      <section className="soft-shell soft-products-hero">
        <div>
          <p className="soft-eyebrow">каталог форматов</p>
          <h1 className="soft-display mt-3" style={{ maxWidth: "42rem" }}>
            Углубление под <span className="soft-italic">ваш</span> вопрос
          </h1>
          <p className="soft-lede mt-5" style={{ maxWidth: "42rem", marginInline: "auto" }}>
            Цифровые разборы, форматы со специалистом и совместные сессии. Сначала диалог ясности,
            затем подходящая глубина по теме и состоянию.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="products-dialogue-cta"
            >
              Начать диалог
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="soft-button soft-button-ghost">
              Посмотреть тарифы
            </Link>
          </div>
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

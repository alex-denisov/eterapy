import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { ChevronLeft, Info, ShieldCheck } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { ProductHeroPrice } from "@/components/products/product-hero-price";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { PerspectivesActions } from "@/components/products/perspectives-actions";
import { SynastryActions } from "@/components/products/synastry-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { HumanDesignActions } from "@/components/products/human-design-actions";
import { SurnameStoryActions } from "@/components/products/surname-story-actions";
import { createPublicPageMetadata, type PublicSeoRoute } from "@/lib/public-page-seo";
import { getV5Product, v5Products, type V5Product } from "@/lib/v5-products";

export function generateStaticParams() {
  return v5Products.map((product) => ({ slug: product.slug }));
}

// M26/B367: unknown slugs (включая выпиленные услуги) должны отдавать
// настоящий HTTP 404 на уровне роутера. Без этого root loading.tsx начинает
// стримить ответ со статусом 200 раньше, чем сработает notFound().
export const dynamicParams = false;

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

// B395: продукт = инструмент, а не лендинг. Главная цель услуги должна быть на
// ПЕРВОМ экране (без скролла к CTA). Поэтому hero — это одна тесная строка:
// компактный заголовок + статус слева, цена аккуратно в углу справа. Без
// крупного soft-h1, без лида, без блока «что вы получите». Сам инструмент идёт
// сразу под шапкой и занимает первый экран. (UI-дизайнер + маркетолог, 2026-06-14.)
function ProductHero({
  product,
  action,
}: {
  product: V5Product;
  action: React.ReactNode;
}) {
  return (
    <section className="soft-shell" data-testid="product-hero" style={{ paddingTop: 20, paddingBottom: 24 }}>
      <div className="mx-auto w-full max-w-2xl">
        {/* iOS-style: round «back» arrow directly left of the title; price is a
            quiet highlighted tag in the corner (distinct from the title, like a
            real price chip) — legible but not competing with the tool. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              href="/"
              aria-label="Назад"
              data-testid="product-hero-back"
              className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
            <h1 className="soft-h2 truncate" style={{ margin: 0 }}>{product.name}</h1>
          </div>
          <ProductHeroPrice product={product} />
        </div>

        {/* Privacy — highlighted differently from the legal note: warm shield in
            terracotta, not the same muted lock. */}
        {product.tone !== "free" && (
          <p className="mt-2.5 inline-flex items-center gap-1.5 pl-7 text-xs font-medium text-[var(--soft-terracotta-dark)]">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {product.tone === "private" ? "Приватно — видно только вам" : "Новый формат"}
          </p>
        )}

        {/* Инструмент — сразу, на первом экране. */}
        <div className="mt-5" data-testid="product-service-start">
          {action}
        </div>

        {/* Compact legal note right under the tool — stays on the first screen,
            no big empty gap, muted, with a distinct (Info) icon. */}
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">
          <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
          <span>Результат носит информационно-рефлексивный характер и не заменяет консультацию специалиста.</span>
        </p>
      </div>
    </section>
  );
}

function ProductActionSurface({
  product,
  search,
}: {
  product: V5Product;
  search?: { dialogueId?: string; invite?: string };
}) {
  if (product.slug === "deep-report") return <DeepReportActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "perspectives") return <PerspectivesActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "chat-analysis") return <ChatAnalysisActions />;
  if (product.slug === "compatibility") return <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={search?.invite ?? null} />;
  if (product.slug === "tarot") {
    return <SymbolicProductActions productKey="tarot" title="Расклад Таро" promptLabel="Вопрос для расклада" placeholder="Например: стоит ли мне сейчас менять работу, если внутри много сомнений?" creditCost={2} />;
  }
  if (product.slug === "natal-chart") {
    return <SymbolicProductActions productKey="natal-chart" title="Натальная карта" promptLabel="Дата, время и место рождения" placeholder="12.04.1992, 14:35, Москва. Вопрос: что сейчас важно понять про работу?" creditCost={2} />;
  }
  if (product.slug === "synastry") return <SynastryActions />;
  if (product.slug === "numerology") {
    return <SymbolicProductActions productKey="numerology" title="Числовой портрет" promptLabel="Имя и дата рождения" placeholder="Анна, 12.04.1992. Хочу понять повторяющийся сценарий в отношениях." creditCost={2} />;
  }
  if (product.slug === "family-scenarios") {
    return <SymbolicProductActions productKey="family-scenarios" title="Семейные сценарии" promptLabel="Что повторяется в вашей семье и роду" placeholder="Например: в семье по женской линии все рано брали ответственность за других и не умели просить помощи. Я ловлю себя на том же." creditCost={4} />;
  }
  if (product.slug === "human-design") {
    return <HumanDesignActions creditCost={product.creditCost ?? 2} />;
  }
  if (product.slug === "surname-story") {
    return <SurnameStoryActions creditCost={product.creditCost ?? 2} />;
  }
  return null;
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ dialogueId?: string; invite?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const product = getV5Product(slug);
  if (!product) notFound();

  return (
    <main className="soft-clarity-page soft-product-detail-page" data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />
      <ProductHero
        product={product}
        action={<ProductActionSurface product={product} search={search} />}
      />
    </main>
  );
}

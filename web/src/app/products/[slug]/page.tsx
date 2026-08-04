import { notFound } from "next/navigation";
import type React from "react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { ProductDisclaimer, ProductPrivacyBadge } from "@/components/products/product-legal";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { ReframeActions } from "@/components/products/reframe-actions";
import { SynastryActions } from "@/components/products/compatibility-by-date-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { HumanDesignActions } from "@/components/products/human-design-actions";
import { SurnameStoryActions } from "@/components/products/surname-origin-actions";
import { NatalChartActions } from "@/components/products/natal-chart-actions";
import { NumerologyActions } from "@/components/products/numerology-actions";
import { FamilyScenariosActions } from "@/components/products/family-questions-actions";
import { HoraryActions, TarotNumerologyActions } from "@/components/products/new-symbolic-product-actions";
import { ProductHeroPrice } from "@/components/products/product-hero-price";
import { ProductPageShell } from "@/components/products/product-page-shell";
import { ProductBackLink } from "@/components/products/product-back-link";
import { createPublicPageMetadata, type PublicSeoRoute } from "@/lib/public-page-seo";
import { getV5Product, v5Products, type V5Product, type V5ProductSlug } from "@/lib/v5-products";
import { serviceGuideLibraryHref } from "@/lib/service-guides";
import { getSetting } from "@/lib/platform-settings";
import Link from "next/link";

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

// B395 / restored 2026-06-19: продукт = инструмент, а не лендинг. Главная цель
// услуги должна быть на ПЕРВОМ экране (без скролла к CTA). Hero — одна тесная
// строка: компактный заголовок + статус слева, цена аккуратно в углу справа,
// сам инструмент идёт сразу под шапкой. Это откат генерик-shell (B436), который
// регрессировал страницу «Разбор переписки». Откат идёт постранично.
function ProductHero({
  product,
  action,
}: {
  product: V5Product;
  action: React.ReactNode;
}) {
  const guideHref = serviceGuideLibraryHref(product.slug as V5ProductSlug);
  return (
    <section className="soft-shell" data-testid="product-hero" style={{ paddingTop: 20, paddingBottom: 24 }}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <ProductBackLink className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]" />
            <h1 className="soft-h2 truncate" style={{ margin: 0 }}>{product.name}</h1>
          </div>
          <ProductHeroPrice product={product} />
        </div>

        {product.tone !== "free" && <ProductPrivacyBadge />}

        <div className="mt-5" data-testid="product-service-start">
          {action}
        </div>

        <ProductDisclaimer />

        {/*
          B648 — ОДНА строка, а не блок. Описательный корпус B647 снял со
          страницы услуги; страница остаётся инструментом на один экран, и
          ссылка на разбор формата в библиотеке не имеет права превращаться
          обратно в текст здесь.

          ⚠ Врезка нужна В ОБОИХ героях: у `/products/[slug]` собственная
          компактная шапка, а не `ProductPageShell`. Первая версия B648 знала
          только про шапку шелла, и на живой странице услуги ссылки не было —
          поймано браузерной проверкой стенда, прогоны этого не видели.
        */}
        {guideHref && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            <Link href={guideHref} className="underline underline-offset-2" data-testid="product-guide-link">
              Как это работает и что входит в результат
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

function ProductActionSurface({
  product,
  search,
}: {
  product: V5Product;
  search?: { dialogueId?: string; invite?: string; resultId?: string };
}) {
  // B442: deep-report is now self-contained too (no dialogueId); it reopens a
  // saved разбор via ?resultId=. B441: reframe is fully self-contained.
  if (product.slug === "deep-report") return <DeepReportActions resultId={search?.resultId ?? null} />;
  if (product.slug === "reframe") return <ReframeActions resultId={search?.resultId ?? null} />;
  if (product.slug === "chat-analysis") return <ChatAnalysisActions />;
  if (product.slug === "tarot") {
    return <SymbolicProductActions productKey="tarot" title="Расклад Таро" promptLabel="Вопрос для расклада" placeholder="Например: стоит ли мне сейчас менять работу, если внутри много сомнений?" creditCost={2} />;
  }
  if (product.slug === "natal-chart") {
    return <NatalChartActions creditCost={product.creditCost ?? 2} />;
  }
  if (product.slug === "compatibility-by-date") return <SynastryActions creditCost={product.creditCost ?? 3} />;
  if (product.slug === "numerology") {
    return <NumerologyActions creditCost={product.creditCost ?? 3} />;
  }
  if (product.slug === "horoscope") return <HoraryActions creditCost={product.creditCost ?? 2} />;
  if (product.slug === "arcana") return <TarotNumerologyActions creditCost={product.creditCost ?? 3} />;
  if (product.slug === "family-questions") {
    return <FamilyScenariosActions creditCost={product.creditCost ?? 4} />;
  }
  if (product.slug === "human-design") {
    return <HumanDesignActions creditCost={product.creditCost ?? 2} />;
  }
  if (product.slug === "surname-origin") {
    return <SurnameStoryActions creditCost={product.creditCost ?? 2} />;
  }
  return null;
}

// Услуги, уже вернувшиеся на компактный tool-first hero (B395). Остальные пока
// остаются на ProductPageShell (B436), пока до них не дойдёт постраничная
// переработка. «Разбор переписки» — первая возвращённая страница.
// B441/B442 (M28): «Переосмысление» и «Подробный разбор» переработаны под этот же
// компактный hero (CTA + инструмент на первом экране, переиспользуют ценник/
// дисклеймер/приватность), как просил владелец — тот же метод, что у chat-analysis/tarot.
const COMPACT_HERO_SLUGS = new Set<string>(["chat-analysis", "tarot", "reframe", "deep-report", "natal-chart", "numerology", "human-design", "surname-origin", "family-questions", "compatibility-by-date", "horoscope", "arcana"]);

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ dialogueId?: string; invite?: string; resultId?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const baseProduct = getV5Product(slug);
  if (!baseProduct) notFound();
  const configuredRubles = Number(await getSetting(`product.${baseProduct.slug}.price`));
  const configuredCredits = Number(await getSetting(`product.${baseProduct.slug}.credits`));
  const product = {
    ...baseProduct,
    ...(Number.isInteger(configuredRubles) && configuredRubles > 0 ? { price: `${configuredRubles.toLocaleString("ru-RU")} ₽` } : {}),
    ...(Number.isInteger(configuredCredits) && configuredCredits > 0 ? { creditCost: configuredCredits, creditPrice: `или −${configuredCredits} балла` } : {}),
  };

  return (
    <main className="soft-clarity-page soft-product-detail-page" data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />
      {COMPACT_HERO_SLUGS.has(product.slug) ? (
        <ProductHero
          product={product}
          action={<ProductActionSurface product={product} search={search} />}
        />
      ) : (
        <ProductPageShell
          product={product}
          action={<ProductActionSurface product={product} search={search} />}
        />
      )}
      {/*
        B647 / владелец 2026-08-04: описательный SEO-блок (B578) отсюда снят.
        Страница услуги — инструмент на один экран, дописывать в неё текст
        нельзя; посадочной под поисковый спрос становится библиотека (B648).
        Вместе с текстом ушла и FAQPage-разметка: держать schema без видимого
        на странице ответа — прямое нарушение требований поисковика.
      */}
    </main>
  );
}

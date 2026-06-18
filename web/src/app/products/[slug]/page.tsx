import { notFound } from "next/navigation";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { PerspectivesActions } from "@/components/products/perspectives-actions";
import { SynastryActions } from "@/components/products/synastry-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { HumanDesignActions } from "@/components/products/human-design-actions";
import { SurnameStoryActions } from "@/components/products/surname-story-actions";
import { ProductPageShell } from "@/components/products/product-page-shell";
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
      <ProductPageShell
        product={product}
        action={<ProductActionSurface product={product} search={search} />}
      />
    </main>
  );
}

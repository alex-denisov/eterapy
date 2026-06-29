import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { TogetherActions } from "@/components/products/together-actions";
import { PairScenarioActions } from "@/components/products/pair-scenario-actions";
import { ProductHeroPrice } from "@/components/products/product-hero-price";
import { ProductPrivacyBadge } from "@/components/products/product-legal";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getV5Product } from "@/lib/v5-products";
import { resolvePairScenario, getPairRelationshipOption } from "@/lib/pair-hub";

export const metadata = createPublicPageMetadata("/products/pair");

type PairSearch = {
  invite?: string;
  dialogueId?: string;
  scenario?: string;
  via?: string;
  relType?: string;
};

// B463 (M28, walkthrough item 21): «Вместе» on the compact tool-first hero (the same
// "Tarot strategy" as the single-tool product pages). The tall display headline + three
// scenario cards + below-the-fold form are replaced by a compact hero and a two-scenario
// pill picker that swaps the intake inline on the first screen. The orphaned
// «Совместимость» card is folded into «Сверить взгляды» as the «Ваша связь» mode.
export default async function TogetherPage({
  searchParams,
}: {
  searchParams?: Promise<PairSearch>;
}) {
  const search = await searchParams;
  const invite = search?.invite ?? null;
  const isOutsideInvite = search?.via === "outside";

  // Invited-guest views skip the hub and render the relevant answer surface.
  if (invite) {
    return (
      <main className="soft-clarity-page soft-public-page" data-testid="together-page">
        <PublicJsonLd route="/products/pair" />
        <section className="soft-shell py-12 md:py-16">
          {isOutsideInvite ? (
            <TogetherActions inviteToken={invite} />
          ) : (
            <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={invite} productKey="pair" />
          )}
        </section>
      </main>
    );
  }

  const product = getV5Product("pair");
  const initialScenario = resolvePairScenario(search?.scenario);
  const relationshipType = getPairRelationshipOption(search?.relType ?? "")?.key ?? "romantic";

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="together-page">
      <PublicJsonLd route="/products/pair" />
      <section className="soft-shell" style={{ paddingTop: 20, paddingBottom: 28 }}>
        <div className="mx-auto w-full max-w-2xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href="/"
                aria-label="Назад"
                data-testid="pair-hero-back"
                className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Link>
              <h1 className="soft-h2 truncate" style={{ margin: 0 }}>Вместе</h1>
            </div>
            {product && <ProductHeroPrice product={product} />}
          </div>

          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Один вопрос — несколько взглядов.</p>

          <div className="mt-3">
            <ProductPrivacyBadge />
          </div>

          <div className="mt-6">
            <PairScenarioActions
              initialScenario={initialScenario}
              dialogueId={search?.dialogueId ?? null}
              relationshipType={relationshipType}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

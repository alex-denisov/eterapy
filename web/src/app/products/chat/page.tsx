// B417 (M27) — чат-компаньон «Решить вопрос в чате» как услуга каталога.
// Раньше жил в кабинете (/cabinet/chat); теперь это публичная продуктовая
// страница в одном дизайн-языке с остальными услугами (back-arrow + ценовая
// плашка + приватность), а сам инструмент — на первом экране. Платная
// синхронная услуга: бесплатного входа здесь НЕТ (бесплатен первичный разбор).

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { CompanionChatPanel } from "@/components/companion/companion-chat-panel";
import { ChatHeroPrice } from "@/components/companion/chat-hero-price";
import { ProductDisclaimer, ProductPrivacyBadge } from "@/components/products/product-legal";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getProductPriceLabel } from "@/lib/product-prices";
import { CHAT_SESSION_COST_CREDITS } from "@/lib/chat-session";

export const dynamic = "force-dynamic";
export const metadata = createPublicPageMetadata("/products/chat");

const PRICE_LABEL = getProductPriceLabel("chat-session") ?? "790 ₽";

export default async function ProductChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ dialogueId?: string; analysisId?: string; start?: string }>;
}) {
  const session = await auth();
  const authed = Boolean(session?.user?.id);
  const sp = await searchParams;
  const dialogueId = sp?.dialogueId ?? null;
  const analysisId = sp?.analysisId ?? null;
  // Issue #5/#7: «продолжить разговор в чате» arrives with ?start=1 to open the
  // paid session in one click. We preserve the session key (+ start) across the
  // guest → /login round-trip so the conversation resumes seeded and in context.
  const autoStart = sp?.start === "1";
  const loginNext = (() => {
    const params = new URLSearchParams();
    if (dialogueId) params.set("dialogueId", dialogueId);
    if (analysisId) params.set("analysisId", analysisId);
    if (autoStart) params.set("start", "1");
    const qs = params.toString();
    return qs ? `/products/chat?${qs}` : "/products/chat";
  })();

  return (
    <main className="soft-clarity-page soft-product-detail-page" data-testid="product-page-chat">
      <PublicJsonLd route="/products/chat" />
      <section className="soft-shell" data-testid="product-hero" style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div className="mx-auto w-full max-w-2xl">
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
              <h1 className="soft-h2 truncate" style={{ margin: 0 }}>Решить вопрос в чате</h1>
            </div>
            <ChatHeroPrice authed={authed} priceLabel={PRICE_LABEL} costCredits={CHAT_SESSION_COST_CREDITS} />
          </div>

          <ProductPrivacyBadge />

          <div className="mt-5" data-testid="product-service-start">
            <CompanionChatPanel dialogueId={dialogueId} analysisId={analysisId} autoStart={autoStart} loginNext={loginNext} />
          </div>

          <ProductDisclaimer />
        </div>
      </section>
    </main>
  );
}

// B417 (M27) — чат-компаньон «Решить вопрос в чате» как услуга каталога.
// Раньше жил в кабинете (/cabinet/chat); теперь это публичная продуктовая
// страница в одном дизайн-языке с остальными услугами (back-arrow + ценовая
// плашка + приватность), а сам инструмент — на первом экране. Платная
// синхронная услуга: бесплатного входа здесь НЕТ (бесплатен первичный разбор).

import Link from "next/link";
import { ChevronLeft, Info, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { CompanionChatPanel } from "@/components/companion/companion-chat-panel";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { formatPoints } from "@/lib/points";
import { getProductPriceLabel } from "@/lib/product-prices";
import { CHAT_SESSION_COST_CREDITS } from "@/lib/chat-session";

export const dynamic = "force-dynamic";
export const metadata = createPublicPageMetadata("/products/chat");

const PRICE_LABEL = getProductPriceLabel("chat-session") ?? "790 ₽";

// Ценовая плашка в одном стиле с ProductHeroPrice: авторизованному показываем
// крупно стоимость в баллах, гостю — цену в ₽ (он ещё не тратит баллы).
function ChatHeroPrice({ authed }: { authed: boolean }) {
  if (authed) {
    return (
      <span
        className="flex shrink-0 flex-col items-end rounded-2xl px-3.5 py-1.5 leading-none text-[var(--soft-bordeaux)]"
        style={{ background: "var(--soft-apricot)" }}
        data-testid="product-hero-price"
      >
        <span className="text-lg font-semibold">{formatPoints(CHAT_SESSION_COST_CREDITS)}</span>
        <span className="mt-0.5 text-[10.5px] font-medium opacity-65">или {PRICE_LABEL}</span>
      </span>
    );
  }
  return (
    <span
      className="shrink-0 rounded-full px-3.5 py-1.5 text-lg font-semibold leading-none text-[var(--soft-bordeaux)]"
      style={{ background: "var(--soft-apricot)" }}
      data-testid="product-hero-price"
    >
      {PRICE_LABEL}
    </span>
  );
}

export default async function ProductChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ dialogueId?: string }>;
}) {
  const session = await auth();
  const authed = Boolean(session?.user?.id);
  const sp = await searchParams;

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
            <ChatHeroPrice authed={authed} />
          </div>

          <p className="mt-2.5 inline-flex items-center gap-1.5 pl-7 text-xs font-medium text-[var(--soft-terracotta-dark)]">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            Приватно — видно только вам
          </p>

          <div className="mt-5" data-testid="product-service-start">
            <CompanionChatPanel dialogueId={sp?.dialogueId ?? null} loginNext={sp?.dialogueId ? `/products/chat?dialogueId=${sp.dialogueId}` : "/products/chat"} />
          </div>

          <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">
            <Info className="mt-px size-3 shrink-0" aria-hidden="true" />
            <span>Это поддержка для размышления, а не медицинская или экстренная помощь. Результат носит информационно-рефлексивный характер и не заменяет консультацию специалиста.</span>
          </p>
        </div>
      </section>
    </main>
  );
}

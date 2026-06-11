import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { CircleActions } from "@/components/products/circle-actions";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { getProductPriceLabel } from "@/lib/product-prices";

export const metadata = createPublicPageMetadata("/products/circle");

const steps = [
  "Создатель формулирует общий вопрос.",
  "2–5 участников отвечают отдельно и дают согласие.",
  "ETerapy собирает общий бережный итог без раскрытия приватных ответов.",
];

export default async function CirclePage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>;
}) {
  const search = await searchParams;

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="circle-page">
      <PublicJsonLd route="/products/circle" />
      <section className="soft-shell py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">круг</p>
            <h1 className="soft-display mt-4">
              Разобраться <span className="soft-italic">вместе</span>, не теряя границ
            </h1>
            <p className="soft-lede mt-6">
              Формат для семьи, команды или близкого круга: один общий вопрос,
              отдельные ответы и итог, который помогает начать разговор спокойно.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#circle-actions" className="soft-button soft-button-primary">
                Создать круг
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/pricing" className="soft-button soft-button-ghost">
                {getProductPriceLabel("circle")} за полный итог
              </Link>
            </div>
          </div>

          <aside className="soft-card p-6 md:p-8">
            <div className="flex items-center justify-between">
              <p className="soft-eyebrow">участники</p>
              <span className="soft-badge soft-badge-warm">2–5 человек</span>
            </div>
            <div className="mt-6 flex justify-center -space-x-3">
              {["Вы", "М", "А", "?"].map((item, index) => (
                <div
                  key={item + index}
                  className="grid size-16 place-items-center rounded-full border border-[var(--soft-paper-card)] bg-[var(--soft-paper-deep)] font-heading text-xl text-[var(--soft-bordeaux)] shadow-[var(--soft-shadow-sm)]"
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-7 space-y-3">
              {steps.map((step, index) => (
                <div key={step} className="flex gap-3 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-3 text-sm text-[var(--soft-ink-soft)]">
                  <span className="font-heading text-xl text-[var(--soft-bordeaux)]">0{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2 text-xs text-[var(--soft-ink-faint)]">
              <ShieldCheck className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span>Повторные устройства, массовые приглашения и подозрительные ответы уходят на антифрод-проверку.</span>
            </div>
          </aside>
        </div>
      </section>
      <section id="circle-actions" className="soft-shell pb-16">
        <CircleActions inviteToken={search?.invite ?? null} />
      </section>
    </main>
  );
}

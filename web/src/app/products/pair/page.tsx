import Link from "next/link";
import { ArrowRight, HeartHandshake, LockKeyhole } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { createPublicPageMetadata } from "@/lib/public-page-seo";

export const metadata = createPublicPageMetadata("/products/pair");

export default async function PairPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string; dialogueId?: string }>;
}) {
  const search = await searchParams;

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="pair-page">
      <PublicJsonLd route="/products/pair" />
      <section className="soft-shell py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">разобраться вдвоём</p>
            <h1 className="soft-display mt-4">
              Один вопрос. <span className="soft-italic">Два взгляда.</span>
            </h1>
            <p className="soft-lede mt-6">
              Каждый отвечает отдельно. Общий итог открывается только по согласию,
              чтобы не превращать разбор в контроль или спор.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/products/compatibility" className="soft-button soft-button-primary">
                Начать парный формат
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/checkin?entry=pair" className="soft-button soft-button-ghost">
                Сначала задать вопрос
              </Link>
            </div>
          </div>

          <div className="soft-card p-6 md:p-8">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              {["Ваш ответ", "Ответ партнёра"].map((title) => (
                <div key={title} className="rounded-[var(--soft-radius-lg)] bg-[var(--soft-paper-deep)] p-5 text-center">
                  <HeartHandshake className="mx-auto size-6 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <h2 className="soft-h3 mt-3">{title}</h2>
                  <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">приватно до завершения</p>
                </div>
              ))}
              <div className="hidden font-heading text-3xl italic text-[var(--soft-bordeaux)] sm:block">+</div>
            </div>
            <div className="mt-6 flex gap-2 rounded-[var(--soft-radius-md)] bg-[var(--soft-paper-deep)] p-4 text-sm text-[var(--soft-ink-soft)]">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span>Автор не видит приватные ответы партнёра до завершения и разрешённого результата.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="soft-shell pb-16">
        <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={search?.invite ?? null} productKey="pair" />
      </section>
    </main>
  );
}

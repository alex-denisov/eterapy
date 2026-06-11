import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type EsotericProduct = {
  title: string;
  description: string;
  price: string;
  icon: LucideIcon;
};

type EsotericServicePageProps = {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  quote: string;
  accent: string;
  paper: string;
  glyph: LucideIcon;
  products: EsotericProduct[];
};

export function EsotericServicePage({
  eyebrow,
  title,
  subtitle,
  quote,
  accent,
  paper,
  glyph: Glyph,
  products,
}: EsotericServicePageProps) {
  return (
    <main className="soft-clarity-page soft-public-page" data-testid="esoteric-service-page">
      <section className="soft-shell py-12 md:py-16">
        <Link href="/" className="soft-chip soft-chip-warm">
          На главную
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="soft-badge soft-badge-lilac">доступно сейчас</span>
              <span className="text-xs text-[var(--soft-ink-faint)]">цифровой формат и специалисты ETerapy</span>
            </div>
            <p className="soft-eyebrow mt-6" style={{ color: accent }}>
              {eyebrow}
            </p>
            <h1 className="soft-display mt-3" style={{ maxWidth: "48rem" }}>
              {title}
            </h1>
            <p className="soft-lede mt-5" style={{ maxWidth: "45rem" }}>
              {subtitle}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/checkin" className="soft-button soft-button-primary">
                Начать с вопроса
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/products" className="soft-button soft-button-ghost">
                Посмотреть все форматы
              </Link>
            </div>
          </div>

          <aside
            className="soft-card relative overflow-hidden p-9 text-center md:p-12"
            style={{ background: paper }}
            aria-label="Принцип направления"
          >
            <span
              className="absolute inset-x-12 top-10 h-20 rounded-full blur-3xl"
              style={{ backgroundColor: accent, opacity: 0.16 }}
              aria-hidden="true"
            />
            <Glyph className="relative mx-auto size-16" style={{ color: accent, opacity: 0.75 }} aria-hidden="true" />
            <p className="relative mt-6 text-2xl italic leading-snug" style={{ color: accent, fontFamily: "var(--font-heading)" }}>
              {quote}
            </p>
          </aside>
        </div>

        <section className="soft-card mt-12 bg-[var(--soft-paper-deep)] p-6 md:p-8">
          <p className="soft-eyebrow text-[var(--soft-bordeaux)]">принцип ETerapy</p>
          <h2 className="soft-h3 mt-3">Мы относимся к этому как к языку метафор, не как к предсказанию</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Эзотерические форматы помогают говорить о себе и важных решениях другим словарём. Мы не обещаем точных
            прогнозов, не заменяем психолога или врача и не используем страх как способ продажи.
          </p>
        </section>

        <section className="mt-12">
          <p className="soft-eyebrow mb-5">форматы внутри направления</p>
          <div className="soft-map-grid">
            {products.map((product) => {
              const Icon = product.icon;
              return (
                <article key={product.title} className="soft-card col-span-12 p-6 md:col-span-6 lg:col-span-4">
                  <div className="flex items-start justify-between gap-4">
                    <Icon className="size-6" style={{ color: accent }} aria-hidden="true" />
                    <span className="soft-badge soft-badge-warm">{product.price}</span>
                  </div>
                  <h3 className="soft-h3 mt-5">{product.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.description}</p>
                  <Link href="/checkin" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
                    Начать с вопроса
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="soft-card mt-8 p-6 md:p-8" style={{ background: "linear-gradient(140deg, #ded3ec, #f3e4ee)" }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="soft-eyebrow text-[#4a3e5e]">живое продолжение</p>
              <h2 className="soft-h3 mt-3 text-[#4a3e5e]">Поговорить со специалистом</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#4a3e5e]">
                Разбор может продолжить живой специалист — ищите в каталоге бейдж «психология + эзотерика».
              </p>
            </div>
            <Link href="/practitioners" className="soft-button soft-button-ghost shrink-0">
              Выбрать специалиста
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

export const EsotericSoonPage = EsotericServicePage;

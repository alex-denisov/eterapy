import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, Lock } from "lucide-react";
import { Disclaimer } from "@/components/ui/disclaimer";
import { canonicalUrl } from "@/lib/seo";
import { mainUrl } from "@/lib/subdomain";
import { approvedLibraryEntries, getApprovedLibraryEntry } from "@/data/anonymous-library";
import { resolveLibraryCta } from "@/lib/library-cta";
import { LibraryEntryCta } from "@/components/library/library-entry-cta";
import { ogImageUrl } from "@/lib/share";

export function generateStaticParams() {
  return approvedLibraryEntries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getApprovedLibraryEntry(slug);
  if (!entry) return {};

  const title = entry.seo?.metaTitle ?? `${entry.topic}: анонимный вопрос — ETerapy`;
  const description = entry.seo?.metaDescription ?? entry.summary;
  const url = canonicalUrl(`/library/${entry.slug}`);
  // B390: брендовая OG-картинка делает карточку красивой при шеринге; конкретный
  // текст вопроса идёт в og:title/description (соцсеть рисует его сама).
  const ogImage = canonicalUrl(ogImageUrl("library"));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "ETerapy",
      locale: "ru_RU",
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getApprovedLibraryEntry(slug);
  if (!entry) notFound();
  const relatedEntries = approvedLibraryEntries()
    .filter((item) => item.slug !== entry.slug && (item.topic === entry.topic || item.reactions >= entry.reactions - 10))
    .slice(0, 3);
  // v2 single-canvas content with graceful fallback to legacy perspectives[].
  const forkTitle =
    entry.mainFork?.title ??
    entry.perspectives[1] ??
    entry.perspectives[0] ??
    "Что в этой ситуации требует бережного уточнения?";
  const forkNote =
    entry.mainFork?.note ??
    "Публичная карточка показывает только безопасный контур. В личном разборе система уточнит факты, чувства, границы и ближайший шаг именно под ваш контекст.";
  const freeFragment = entry.freeFragment ?? entry.perspectives[0] ?? entry.summary;
  const hidden = entry.hidden ?? [
    "детали запроса автора и уточняющий диалог",
    "Полная картина: мысли, чувства, скрытый смысл, первый шаг",
    "безопасный следующий шаг",
  ];
  const similar = entry.similarCount ?? entry.reactions;
  const cta = resolveLibraryCta({ topic: entry.topic, ctaProduct: entry.ctaProduct, fromSlug: entry.slug });
  const ctaHref = mainUrl(cta.productPath);

  // B384: each card is a search target — enrich Article (about/section/teaser-gated)
  // and add a BreadcrumbList. One @graph keeps it in a single JSON-LD script.
  const articleUrl = canonicalUrl(`/library/${entry.slug}`);
  const orgUrl = canonicalUrl("/");
  const libraryJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: entry.seo?.metaTitle ?? `${entry.topic}: анонимный вопрос`,
        description: entry.seo?.metaDescription ?? entry.summary,
        about: { "@type": "Thing", name: entry.topic },
        articleSection: entry.topic,
        url: articleUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
        inLanguage: "ru-RU",
        isAccessibleForFree: false,
        author: { "@type": "Organization", name: "ETerapy", url: orgUrl },
        publisher: { "@type": "Organization", name: "ETerapy", url: orgUrl },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: orgUrl },
          { "@type": "ListItem", position: 2, name: "Библиотека", item: canonicalUrl("/library") },
          { "@type": "ListItem", position: 3, name: entry.topic, item: articleUrl },
        ],
      },
    ],
  };

  return (
    <main className="soft-clarity-page soft-public-page" data-testid={`library-entry-${entry.slug}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(libraryJsonLd) }}
      />

      <article className="soft-shell-narrow py-12 md:py-16">
        {/* B454/T17: minimal back-arrow (Tarot parity) instead of a bulky chip;
            the topic + similar-count meta moves under the title, not above it. */}
        <div className="flex items-center gap-1.5">
          <Link
            href="/library"
            aria-label="Назад в библиотеку"
            data-testid="library-entry-back"
            className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--soft-ink-soft)] transition-colors hover:bg-[var(--soft-paper-card)] hover:text-[var(--soft-bordeaux)]"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--soft-ink-faint)]">Библиотека</span>
        </div>

        <header className="mt-6">
          <h1 className="max-w-3xl text-3xl italic leading-snug text-[var(--soft-bordeaux)] md:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>
            «{entry.question}»
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="soft-chip">{entry.topic}</span>
            <span className="text-xs text-[var(--soft-ink-faint)]">
              анонимно · {similar.toLocaleString("ru-RU")} прошли похожий разбор
            </span>
          </div>
        </header>

        {/* Единое полотно: одна типографская колонка, секции разделены типографикой
            (eyebrow + интервалы + тонкие линии), а не цветными рамками. */}
        <div className="soft-library-canvas mt-10 max-w-3xl">
          <section>
            <p className="soft-eyebrow">что мы услышали</p>
            <p className="mt-3 text-xl leading-relaxed text-[var(--soft-ink)]" style={{ fontFamily: "var(--font-heading)" }}>
              {entry.summary}
            </p>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">главная развилка</p>
            <h2 className="soft-h3 mt-3">{forkTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{forkNote}</p>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">фрагмент разбора · открыт публично</p>
            <p className="mt-4 text-2xl italic leading-snug text-[var(--soft-bordeaux)]" style={{ fontFamily: "var(--font-heading)" }}>
              {freeFragment}
            </p>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <div className="flex items-center gap-3">
              <Lock className="size-4 text-[var(--soft-bordeaux)]" aria-hidden="true" />
              <p className="soft-eyebrow text-[var(--soft-bordeaux)]" style={{ marginBottom: 0 }}>
                что в полном разборе
              </p>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {hidden.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="text-[var(--soft-ink-faint)]">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {/* B454: drop the auto «Важно» heading (the redundant line) and force a
                readable ink colour over the component's faded `text-muted-foreground`. */}
            <Disclaimer title="" className="mt-6 border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]">
              <span className="text-[var(--soft-ink-soft)]">
                Мы публикуем только обезличенный вопрос и короткий фрагмент разбора с согласия автора. Всё остальное
                доступно только в личном разборе.
              </span>
            </Disclaimer>
          </section>
        </div>

        <LibraryEntryCta
          slug={entry.slug}
          baseline={similar}
          href={ctaHref}
          label={cta.label}
          teaserNote={cta.teaserNote}
          product={cta.product}
          headline={forkTitle}
        />

        {relatedEntries.length > 0 && (
          <section className="mt-12">
            <p className="soft-eyebrow mb-5">рядом в библиотеке</p>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedEntries.map((item) => (
                <Link
                  key={item.slug}
                  href={mainUrl(`/library/${item.slug}`)}
                  className="soft-card soft-library-card p-5"
                >
                  {/* B454: `block` previously overrode `.soft-library-card`'s flex
                      column, so `min-height` left dead space under the CTA. Grouping
                      chip+question lets space-between pin «читать разбор» to the
                      bottom edge. */}
                  <div>
                    <span className="soft-chip soft-chip-warm">{item.topic}</span>
                    <p className="soft-library-question mt-4">«{item.question}»</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--soft-terracotta-dark)]">
                    читать разбор
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}

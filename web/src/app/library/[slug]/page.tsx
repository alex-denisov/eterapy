import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft, CircleHelp, Compass, ShieldCheck } from "lucide-react";
import { Disclaimer } from "@/components/ui/disclaimer";
import { canonicalUrl } from "@/lib/seo";
import { mainUrl } from "@/lib/subdomain";
import { approvedLibraryEntries, getApprovedLibraryEntry, librarySection } from "@/data/anonymous-library";
import { resolveLibraryCta } from "@/lib/library-cta";
import { LibraryEntryCta } from "@/components/library/library-entry-cta";
import { ogImageUrl } from "@/lib/share";
import {
  LIBRARY_EDITORIAL_DATE,
  LIBRARY_EDITORIAL_DATE_RU,
  libraryChecks,
  libraryFaqs,
  libraryFirstStep,
  libraryHumanSupport,
  libraryMetaDescription,
  libraryMetaTitle,
} from "@/lib/library-editorial";
import { serviceGuideBySlug } from "@/lib/service-guides";
import { getV5Product } from "@/lib/v5-products";
import { ServiceGuideSections } from "@/components/library/service-guide-sections";

// The library corpus is editorial and fully known at build time. Keep the
// route contract closed as well as the proxy allowlist; the proxy performs the
// pre-stream 404 because the root loading boundary can commit HTTP 200 first.
export const dynamicParams = false;

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

  const title = libraryMetaTitle(entry);
  const description = libraryMetaDescription(entry);
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
  const section = librarySection(entry);
  const relatedEntries = approvedLibraryEntries()
    .filter((item) => librarySection(item) === section && item.slug !== entry.slug && (item.topic === entry.topic || item.reactions >= entry.reactions - 10))
    .slice(0, 4);
  // v2 single-canvas content with graceful fallback to legacy perspectives[].
  const forkTitle =
    entry.mainFork?.title ??
    entry.perspectives[1] ??
    entry.perspectives[0] ??
    "Что в этой ситуации требует бережного уточнения?";
  const forkNote =
    entry.mainFork?.note ??
    "Здесь важно не выбирать самое тревожное объяснение автоматически. Сначала стоит отделить наблюдаемые факты от версий и понять, какой ответ действительно поможет двигаться дальше.";
  const checks = libraryChecks(entry);
  const firstStep = libraryFirstStep(entry);
  const humanSupport = libraryHumanSupport(entry);
  const faqs = libraryFaqs(entry);
  const interestCount = entry.similarCount ?? entry.reactions;
  const cta = resolveLibraryCta({ topic: entry.topic, ctaProduct: entry.ctaProduct, fromSlug: entry.slug });
  const ctaHref = mainUrl(cta.productPath);
  const freeHref = mainUrl(`/checkin?from=library&slug=${encodeURIComponent(entry.slug)}`);
  const isSymbolic = section === "symbolic";
  // B648: у записи может быть корпус услуги — соответствие держится данными.
  const guide = serviceGuideBySlug(entry.slug);
  const libraryHref = isSymbolic ? "/library?section=symbolic" : "/library";

  // B384: each card is a search target — enrich Article (about/section/teaser-gated)
  // and add a BreadcrumbList. One @graph keeps it in a single JSON-LD script.
  const articleUrl = canonicalUrl(`/library/${entry.slug}`);
  const orgUrl = canonicalUrl("/");
  const libraryJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: libraryMetaTitle(entry),
        description: libraryMetaDescription(entry),
        about: { "@type": "Thing", name: entry.topic },
        articleSection: entry.topic,
        url: articleUrl,
        mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
        inLanguage: "ru-RU",
        isAccessibleForFree: true,
        datePublished: LIBRARY_EDITORIAL_DATE,
        dateModified: LIBRARY_EDITORIAL_DATE,
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
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
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
            href={libraryHref}
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
              {interestCount.toLocaleString("ru-RU")} откликов по теме · обновлено {LIBRARY_EDITORIAL_DATE_RU}
            </span>
          </div>
        </header>

        {/* Единое полотно: одна типографская колонка, секции разделены типографикой
            (eyebrow + интервалы + тонкие линии), а не цветными рамками. */}
        <div className="soft-library-canvas mt-10 max-w-3xl">
          <section>
            <p className="soft-eyebrow">короткий ответ</p>
            <p className="mt-3 text-xl leading-relaxed text-[var(--soft-ink)]" style={{ fontFamily: "var(--font-heading)" }}>
              {entry.summary}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Это не единственное объяснение. Полезнее рассматривать его как отправную точку и проверять по конкретным событиям, словам и собственным границам.
            </p>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">что здесь важно различить</p>
            <h2 className="soft-h3 mt-3">{forkTitle}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{forkNote}</p>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">что можно проверить</p>
            <ul className="mt-5 space-y-4">
              {checks.map((item, index) => (
                <li key={item} className="flex gap-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-xs font-semibold text-[var(--soft-bordeaux)]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <hr className="my-9 border-0 border-t border-[var(--soft-paper-edge)]" />

          <section>
            <div className="flex items-center gap-3">
              <Compass className="size-5 text-[var(--soft-bordeaux)]" aria-hidden="true" />
              <p className="soft-eyebrow text-[var(--soft-bordeaux)]" style={{ marginBottom: 0 }}>
                первый шаг
              </p>
            </div>
            <p className="mt-4 text-2xl italic leading-snug text-[var(--soft-bordeaux)]" style={{ fontFamily: "var(--font-heading)" }}>
              {firstStep}
            </p>
            <Disclaimer title="" className="mt-6 border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)]">
              <span className="text-[var(--soft-ink-soft)]">
                {humanSupport}
              </span>
            </Disclaimer>
          </section>
        </div>

        {/*
          B648 — корпус услуги. Блок появляется ТОЛЬКО у записей-разборов
          формата: у карточки-вопроса его нет и быть не должно.
          Стоит ПЕРЕД призывом к действию: человек сначала понимает, что это за
          формат, и только потом видит предложение его открыть.
        */}
        {guide && (
          <ServiceGuideSections
            guide={guide.guide}
            serviceHref={getV5Product(guide.service)?.route ?? null}
            serviceName={getV5Product(guide.service)?.name ?? null}
          />
        )}

        <LibraryEntryCta
          slug={entry.slug}
          baseline={interestCount}
          primaryHref={isSymbolic ? ctaHref : freeHref}
          primaryLabel={isSymbolic ? `Открыть: ${cta.product}` : "Разобрать свой вопрос бесплатно"}
          primaryProduct={isSymbolic ? cta.product : "free-reflection"}
          secondaryHref={isSymbolic ? freeHref : ctaHref}
          secondaryLabel={isSymbolic ? "Разобрать жизненный вопрос бесплатно" : `${cta.label}: ${cta.teaserNote}`}
          headline={forkTitle}
        />

        <section className="soft-library-canvas mt-12 max-w-3xl" aria-labelledby="library-method-title">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 id="library-method-title" className="soft-h3">Как подготовлен материал</h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Редакция ETerapy отделяет факты от предположений, не ставит диагнозов и не решает за читателя. Материал подготовлен по общей редакционной методике и обновляется организацией ETerapy.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href={mainUrl("/editorial-policy")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">Редакционная политика</Link>
            <Link href={mainUrl("/about")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">О платформе</Link>
            <Link href={mainUrl("/help")} className="font-medium text-[var(--soft-bordeaux)] underline underline-offset-4">Безопасность и помощь</Link>
          </div>
        </section>

        <section className="mt-12 max-w-3xl" aria-labelledby="library-faq-title">
          <div className="flex items-center gap-3">
            <CircleHelp className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 id="library-faq-title" className="soft-h3">Частые вопросы</h2>
          </div>
          <div className="mt-6 divide-y divide-[var(--soft-paper-edge)] border-y border-[var(--soft-paper-edge)]">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-base font-semibold text-[var(--soft-ink)] marker:hidden">
                  {faq.question}
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {relatedEntries.length > 0 && (
          <section className="mt-12">
            <p className="soft-eyebrow mb-5">рядом в библиотеке</p>
            <div className="grid gap-4 md:grid-cols-2">
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

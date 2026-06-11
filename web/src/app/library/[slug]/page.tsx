import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, X } from "lucide-react";
import { Disclaimer } from "@/components/ui/disclaimer";
import { canonicalUrl } from "@/lib/seo";
import { mainUrl } from "@/lib/subdomain";
import { approvedLibraryEntries, getApprovedLibraryEntry } from "@/data/anonymous-library";
import { LibraryEntryCta } from "@/components/library/library-entry-cta";

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

  const title = `${entry.topic}: анонимный вопрос — ETerapy`;
  const description = entry.summary;
  const url = canonicalUrl(`/library/${entry.slug}`);

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
    },
    twitter: {
      card: "summary",
      title,
      description,
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
  const centralFork = entry.perspectives[1] ?? entry.perspectives[0] ?? "Что в этой ситуации требует бережного уточнения?";
  const publicFragment = entry.perspectives[0] ?? entry.summary;

  return (
    <main className="soft-clarity-page soft-public-page" data-testid={`library-entry-${entry.slug}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `${entry.topic}: анонимный вопрос`,
            description: entry.summary,
            url: canonicalUrl(`/library/${entry.slug}`),
            inLanguage: "ru-RU",
          }),
        }}
      />

      <article className="soft-shell-narrow py-12 md:py-16">
        <Link href="/library" className="soft-chip soft-chip-warm">
          Назад в библиотеку
        </Link>

        <header className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="soft-chip">{entry.topic}</span>
            <span className="text-xs text-[var(--soft-ink-faint)]">
              анонимно · {entry.reactions.toLocaleString("ru-RU")} прошли похожий разбор
            </span>
          </div>
          <h1 className="mt-7 max-w-3xl text-3xl italic leading-snug text-[var(--soft-bordeaux)] md:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>
            «{entry.question}»
          </h1>
        </header>

        <section className="soft-card mt-8 p-6 md:p-8">
          <p className="soft-eyebrow">что мы услышали</p>
          <p className="mt-3 text-xl leading-relaxed text-[var(--soft-ink)]" style={{ fontFamily: "var(--font-heading)" }}>{entry.summary}</p>
        </section>

        <section className="soft-card mt-5 bg-[var(--soft-paper-deep)] p-6 md:p-8">
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">главная развилка</p>
          <h2 className="soft-h3 mt-3">{centralFork}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Публичная карточка показывает только безопасный контур. В личном разборе система уточнит факты, чувства,
            границы и ближайший шаг именно под ваш контекст.
          </p>
        </section>

        <section className="soft-card mt-5 p-6 md:p-8" style={{ background: "linear-gradient(140deg, #fffaf1, #f4d9c1)" }}>
          <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">фрагмент разбора · открыт публично</p>
          <p className="mt-4 text-2xl italic leading-snug text-[var(--soft-bordeaux)]" style={{ fontFamily: "var(--font-heading)" }}>{publicFragment}</p>
        </section>

        <section className="soft-card mt-5 border-dashed p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Lock className="size-4 text-[var(--soft-bordeaux)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--soft-bordeaux)]">Скрыто в публичной карточке</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              "детали запроса автора",
              "ответы в уточняющем диалоге",
              "Полная картина: мысли, чувства, скрытый смысл, первый шаг",
              "безопасный следующий шаг",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-[var(--soft-ink-soft)]">
                <X className="size-4 text-[var(--soft-ink-faint)]" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <Disclaimer className="mt-5 border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
            Мы публикуем только обезличенный вопрос и короткий фрагмент разбора с согласия автора. Всё остальное
            доступно только в личном разборе.
          </Disclaimer>
        </section>

        <LibraryEntryCta
          slug={entry.slug}
          baseline={entry.reactions}
          checkinHref={mainUrl(`/checkin?from=library&slug=${encodeURIComponent(entry.slug)}`)}
        />

        {relatedEntries.length > 0 && (
          <section className="mt-12">
            <p className="soft-eyebrow mb-5">рядом в библиотеке</p>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedEntries.map((item) => (
                <Link
                  key={item.slug}
                  href={mainUrl(`/library/${item.slug}`)}
                  className="soft-card soft-library-card block p-5"
                >
                  <span className="soft-chip soft-chip-warm">{item.topic}</span>
                  <p className="soft-library-question mt-4">«{item.question}»</p>
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Disclaimer } from "@/components/ui/disclaimer";
import { canonicalUrl } from "@/lib/seo";
import { approvedLibraryEntries, getApprovedLibraryEntry } from "@/data/anonymous-library";

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
        <Link href="/library" className="text-sm font-semibold text-[var(--soft-ink-faint)] hover:text-[var(--soft-bordeaux)]">
          Назад в библиотеку
        </Link>

        <header className="mt-8">
          <p className="soft-eyebrow">{entry.topic}</p>
          <h1 className="soft-h1 mt-4">{entry.question}</h1>
          <p className="soft-lede mt-5">{entry.summary}</p>
          <Disclaimer className="mt-6 border-[var(--soft-paper-edge)] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
            Вопрос обезличен и прошел модерацию. Открытых комментариев нет; персональный ответ создается только в вашем диалоге.
          </Disclaimer>
        </header>

        <section className="soft-public-section">
          <h2 className="soft-h2">Возможные ракурсы</h2>
          <ul className="mt-5 grid gap-3">
            {entry.perspectives.map((item, index) => (
              <li key={item} className="soft-card soft-timeline-item">
                <span className="soft-step-number">{index + 1}</span>
                <span className="leading-relaxed text-[var(--soft-ink-soft)]">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="soft-card soft-form-panel mt-6">
          <h2 className="soft-h3">Получить ответ для своей ситуации</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Публичный пример не заменяет ваш контекст. Начните личный диалог, чтобы система задала уточнения и собрала ответ под вашу ситуацию.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/checkin"
              className="soft-button soft-button-primary"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target="/checkin"
              data-testid="library-entry-dialogue-cta"
            >
              Получить персональный разбор
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/products" className="soft-button soft-button-ghost">
              Посмотреть продукты
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}

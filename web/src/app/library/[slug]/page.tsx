import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Disclaimer } from "@/components/ui/disclaimer";
import { buttonVariants } from "@/lib/button-variants";
import { canonicalUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";
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
    <main className="mx-auto max-w-3xl px-4 py-14 md:py-20" data-testid={`library-entry-${entry.slug}`}>
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

      <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
        Назад в библиотеку
      </Link>

      <article className="mt-8">
        <p className="text-sm font-semibold text-primary">{entry.topic}</p>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight md:text-5xl">
          {entry.question}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{entry.summary}</p>

        <Disclaimer className="mt-6">
          Вопрос обезличен и прошел модерацию. Открытых комментариев нет; персональный ответ создается только в вашем диалоге.
        </Disclaimer>

        <section className="mt-10">
          <h2 className="font-heading text-2xl font-semibold">Возможные ракурсы</h2>
          <ul className="mt-4 space-y-3">
            {entry.perspectives.map((item) => (
              <li key={item} className="rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-4 text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
            data-testid="library-entry-dialogue-cta"
          >
            Получить персональный разбор
          </Link>
          <Link href="/products" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
            Посмотреть продукты
          </Link>
        </div>
      </article>
    </main>
  );
}

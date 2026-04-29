import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PremiumCard, PremiumPage } from "@/components/v5/premium";
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
    <PremiumPage className="px-4 py-12 md:py-16" data-testid={`library-entry-${entry.slug}`}>
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

      <article className="premium-container max-w-3xl">
        <p className="premium-eyebrow">{entry.topic}</p>
        <h1 className="premium-title mt-3 text-3xl md:text-5xl">
          {entry.question}
        </h1>
        <p className="premium-lead mt-5">{entry.summary}</p>

        <Disclaimer className="mt-6">
          Вопрос обезличен и прошел модерацию. Открытых комментариев нет; персональный ответ создается только в вашем диалоге.
        </Disclaimer>

        <section className="py-10">
          <h2 className="font-heading text-3xl font-medium">Возможные ракурсы</h2>
          <ul className="mt-4 space-y-3">
            {entry.perspectives.map((item) => (
              <li key={item}>
                <PremiumCard className="p-4 text-muted-foreground">
                {item}
                </PremiumCard>
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
    </PremiumPage>
  );
}

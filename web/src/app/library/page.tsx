import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { buttonVariants } from "@/lib/button-variants";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { cn } from "@/lib/utils";
import { approvedLibraryEntries, libraryTopics } from "@/data/anonymous-library";

export const metadata = createPublicPageMetadata("/library");

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string }>;
}) {
  const params = await searchParams;
  const activeTopic = params?.topic;
  const topics = libraryTopics();
  const entries = approvedLibraryEntries().filter((entry) => !activeTopic || entry.topic === activeTopic);

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 md:py-20" data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />

      <section className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Анонимная библиотека</p>
        <h1 className="mt-3 font-heading text-4xl font-bold leading-tight md:text-6xl">
          Похожие вопросы без раскрытия личных данных
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Здесь публикуются только модерируемые и обезличенные вопросы. Комментариев нет:
          вместо обсуждения пользователь может открыть персональный диалог по похожей теме.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Комментарии отключены, реакции обезличены.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/all-modalities/checkin"
            className={cn(buttonVariants({ size: "lg" }), "min-h-12 text-base")}
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/all-modalities/checkin"
            data-testid="library-dialogue-cta"
          >
            У меня похожий вопрос
          </Link>
          <Link href="/how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-12 text-base")}>
            Как работает разбор
          </Link>
        </div>
      </section>

      <nav className="mt-10 flex flex-wrap gap-2" aria-label="Фильтр тем">
        <Link
          href="/library"
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition",
            !activeTopic ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground",
          )}
        >
          Все темы
        </Link>
        {topics.map((topic) => (
          <Link
            key={topic}
            href={`/library?topic=${encodeURIComponent(topic)}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              activeTopic === topic ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {topic}
          </Link>
        ))}
      </nav>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Link
            key={entry.slug}
            href={`/library/${entry.slug}`}
            className="group rounded-[var(--radius-card)] border border-border/30 bg-card/25 p-5 transition hover:border-primary/40 hover:bg-card/40"
            data-testid={`library-card-${entry.slug}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {entry.topic}
              </span>
              <span className="text-xs text-muted-foreground">{entry.reactions} откликов</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold leading-snug text-foreground">{entry.question}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
            <p className="mt-5 text-sm font-medium text-primary group-hover:text-brand-soft-gold">Читать разбор</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { PremiumCard, PremiumHero, PremiumPage, PremiumSection } from "@/components/v5/premium";
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
    <PremiumPage data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />

      <PremiumHero
        eyebrow="Библиотека анонимных вопросов"
        title={<>Похожие вопросы без раскрытия <span className="text-brand-soft-gold">личных данных</span></>}
        lead="Здесь публикуются только модерируемые и обезличенные вопросы. Комментариев нет: вместо обсуждения пользователь может открыть персональный диалог по похожей теме."
        centered
      >
        <p className="text-sm text-muted-foreground">
          Комментарии отключены, реакции обезличены.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
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
      </PremiumHero>

      <PremiumSection>
      <nav className="flex flex-wrap gap-2" aria-label="Фильтр тем">
        <Link
          href="/library"
          className={cn(
            "premium-chip",
            !activeTopic ? "premium-chip-gold" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Все темы
        </Link>
        {topics.map((topic) => (
          <Link
            key={topic}
            href={`/library?topic=${encodeURIComponent(topic)}`}
            className={cn(
              "premium-chip",
              activeTopic === topic ? "premium-chip-gold" : "text-muted-foreground hover:text-foreground",
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
            className="group block"
            data-testid={`library-card-${entry.slug}`}
          >
            <PremiumCard className="h-full transition-transform group-hover:-translate-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="premium-chip premium-chip-gold">
                {entry.topic}
              </span>
              <span className="text-xs text-muted-foreground">{entry.reactions} откликов</span>
            </div>
            <h2 className="mt-4 font-heading text-xl font-medium leading-snug text-foreground">{entry.question}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
            <p className="mt-5 text-sm font-medium text-primary group-hover:text-brand-soft-gold">Читать разбор</p>
            </PremiumCard>
          </Link>
        ))}
      </section>
      </PremiumSection>
    </PremiumPage>
  );
}

import Link from "next/link";
import { Search } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
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
    <main className="soft-clarity-page soft-public-page" data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />

      <section className="soft-shell soft-public-hero-centered">
        <p className="soft-eyebrow">Библиотека анонимных вопросов</p>
        <h1 className="soft-h1 mt-4">Кто-то <span className="soft-italic">уже спросил</span> то же, что и вы</h1>
        <p className="soft-lede mt-5">
          Все вопросы публикуются только после обезличивания и модерации. Без комментариев и драмы.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/checkin"
            className="soft-button soft-button-primary"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="library-dialogue-cta"
          >
            У меня похожий вопрос
          </Link>
          <Link href="/how-it-works" className="soft-button soft-button-ghost">
            Как работает разбор
          </Link>
        </div>
      </section>

      <section className="soft-shell soft-public-section">
        <nav className="soft-library-filter-row" aria-label="Фильтр тем">
          <Link href="/library" className={`soft-chip ${!activeTopic ? "soft-chip-warm" : ""}`}>
            Все
          </Link>
          {topics.map((topic) => (
            <Link
              key={topic}
              href={`/library?topic=${encodeURIComponent(topic)}`}
              className={`soft-chip ${activeTopic === topic ? "soft-chip-warm" : ""}`}
            >
              {topic}
            </Link>
          ))}
          <span className="ml-auto hidden min-h-8 items-center gap-2 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 text-sm text-[var(--soft-ink-faint)] lg:inline-flex">
            <Search className="size-4" aria-hidden="true" />
            {entries.length} вопросов
          </span>
        </nav>

        <div className="soft-public-grid mt-6">
          {entries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/library/${entry.slug}`}
              className="soft-card soft-library-card block"
              data-testid={`library-card-${entry.slug}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="soft-chip soft-chip-warm">{entry.topic}</span>
                <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>анонимно</span>
              </div>
              <p className="soft-library-question mt-4">
                «{entry.question}»
              </p>
              <div
                className="mt-4 py-4"
                style={{
                  borderTop: "1px solid var(--soft-paper-edge)",
                  borderBottom: "1px solid var(--soft-paper-edge)",
                }}
              >
                <p className="soft-eyebrow">фрагмент разбора</p>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--soft-ink-soft)", fontStyle: "italic" }}
                >
                  {entry.summary}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                  {entry.reactions.toLocaleString("ru-RU")} прошли разбор
                </span>
                <span
                  className="soft-button"
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.35rem 0.85rem",
                    borderRadius: "999px",
                    border: "1px solid var(--soft-paper-edge)",
                    background: "var(--soft-paper-card)",
                    color: "var(--soft-terracotta-dark)",
                    textDecoration: "none",
                  }}
                >
                  Похожий разбор →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

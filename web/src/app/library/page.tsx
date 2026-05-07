import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { approvedLibraryEntries, libraryTopics } from "@/data/anonymous-library";
import { LibrarySearch } from "@/components/library/library-search";

export const metadata = createPublicPageMetadata("/library");

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string }>;
}) {
  const params = await searchParams;
  const activeTopic = params?.topic;
  const topics = libraryTopics();
  const entries = approvedLibraryEntries();

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
        <LibrarySearch entries={entries} topics={topics} activeTopic={activeTopic} />
      </section>
    </main>
  );
}

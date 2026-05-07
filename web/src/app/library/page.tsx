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

      {/* Hero — between layout matching v4 */}
      <section className="soft-shell" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="soft-eyebrow">библиотека анонимных вопросов</p>
            <h1 className="soft-h1 mt-2">
              Кто-то <span className="soft-italic">уже спросил</span> то же, что и вы
            </h1>
            <p className="soft-lede mt-3" style={{ maxWidth: 600 }}>
              Все вопросы публикуются только после обезличивания и модерации. Без комментариев и драмы.
            </p>
          </div>
          <Link
            href="/checkin"
            className="soft-button soft-button-primary shrink-0"
            data-analytics-event="dialogue_cta_clicked"
            data-analytics-target="/checkin"
            data-testid="library-dialogue-cta"
          >
            У меня похожий вопрос
          </Link>
        </div>
      </section>

      <section className="soft-shell" style={{ paddingBottom: 80 }}>
        <LibrarySearch entries={entries} topics={topics} activeTopic={activeTopic} />
      </section>
    </main>
  );
}

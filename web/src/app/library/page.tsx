import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { approvedLibraryEntries, libraryTopics } from "@/data/anonymous-library";
import { LibrarySearch } from "@/components/library/library-search";

export const metadata = createPublicPageMetadata("/library");

export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string; section?: string }>;
}) {
  const params = await searchParams;
  const activeTopic = params?.topic;
  const section = params?.section === "symbolic" ? "symbolic" : "life";
  const topics = libraryTopics(section);
  const entries = approvedLibraryEntries(section);
  const isSymbolic = section === "symbolic";

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />

      {/* Hero — between layout matching v4 */}
      <section className="soft-shell" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="soft-eyebrow">библиотека жизненных вопросов</p>
            <h1 className="soft-h1 mt-2">
              Возможно, <span className="soft-italic">ваш вопрос</span> уже здесь
            </h1>
            <p className="soft-lede mt-3" style={{ maxWidth: 600 }}>
              {isSymbolic
                ? "Вопросы о снах, Таро, Матрице судьбы, натальной карте и совместимости — без фатальных прогнозов, с опорой на личный контекст."
                : "Узнаваемые жизненные ситуации, короткий разбор и первый шаг. Без комментариев, диагнозов и готовых решений за вас."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={isSymbolic ? "/products" : "/checkin"}
              className="soft-button soft-button-primary shrink-0"
              data-analytics-event="dialogue_cta_clicked"
              data-analytics-target={isSymbolic ? "/products" : "/checkin"}
              data-testid="library-dialogue-cta"
            >
              {isSymbolic ? "Выбрать расчёт или расклад" : "У меня похожий вопрос"}
            </Link>
          </div>
        </div>
      </section>

      <section className="soft-shell" style={{ paddingBottom: 80 }}>
        <nav className="soft-card mb-6 grid gap-2 p-2 sm:grid-cols-2" aria-label="Направление библиотеки">
          <Link
            href="/library"
            aria-current={!isSymbolic ? "page" : undefined}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${!isSymbolic ? "bg-[var(--soft-sage)] text-[var(--soft-ink)]" : "text-[var(--soft-ink-soft)] hover:bg-[var(--soft-surface)]"}`}
          >
            Жизненные ситуации
            <span className="ml-2 font-normal opacity-70">120</span>
          </Link>
          <Link
            href="/library?section=symbolic"
            aria-current={isSymbolic ? "page" : undefined}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${isSymbolic ? "bg-[var(--soft-sage)] text-[var(--soft-ink)]" : "text-[var(--soft-ink-soft)] hover:bg-[var(--soft-surface)]"}`}
          >
            Символические практики
            <span className="ml-2 font-normal opacity-70">30</span>
          </Link>
        </nav>
        <LibrarySearch
          entries={entries}
          topics={topics}
          activeTopic={activeTopic}
          section={section}
          cardLabel={isSymbolic ? "символический вопрос" : "жизненная ситуация"}
        />
      </section>
    </main>
  );
}

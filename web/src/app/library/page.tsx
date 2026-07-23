import Link from "next/link";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { createPublicPageMetadata } from "@/lib/public-page-seo";
import { approvedLibraryEntries, libraryTopics } from "@/data/anonymous-library";
import { LibrarySearch } from "@/components/library/library-search";

export const metadata = createPublicPageMetadata("/library");

const SYMBOLIC_FAQS = [
  {
    question: "Что такое арканы Таро?",
    answer: "Арканы — карты Таро с устойчивыми образами и сюжетами. 22 Старших аркана описывают крупные символические темы, а 56 Младших — более повседневные ситуации. В ETerapy их используют как язык размышления, а не как доказательство будущего.",
  },
  {
    question: "Чем отличаются расклады Таро?",
    answer: "Расклады отличаются количеством и задачей позиций. Для выбора полезны варианты и последствия, для отношений — точки зрения и динамика, для одного следующего шага часто достаточно трёх карт. Хороший расклад соответствует вопросу, а не обещает универсальный ответ.",
  },
  {
    question: "Что показывает натальная карта?",
    answer: "Натальная карта показывает положение небесных тел на момент рождения и используется в астрологии как символическая схема тем и способов реагировать. Она не является научной диагностикой и не предсказывает обязательные события.",
  },
  {
    question: "Что такое Матрица судьбы?",
    answer: "Это современная эзотерическая система, которая преобразует дату рождения в позиции, связанные с 22 символическими энергиями. У разных школ бывают разные формулы, поэтому полезно видеть метод расчёта и не принимать трактовку за приговор.",
  },
  {
    question: "Почему символическая практика не даёт точного предсказания?",
    answer: "Карты, числа и астрологические схемы не доказывают событие и не заменяют факты. Их практическая ценность — помочь назвать вопрос, заметить внутреннее противоречие и выбрать действие, которое можно проверить в реальности.",
  },
] as const;

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
  const symbolicFaqJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SYMBOLIC_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  }).replace(/</g, "\\u003c");

  return (
    <main className="soft-clarity-page soft-public-page" data-testid="anonymous-library-page">
      <PublicJsonLd route="/library" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: symbolicFaqJsonLd }} />

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
        <section className="mx-auto mt-12 max-w-4xl" aria-labelledby="symbolic-library-faq-title">
            <p className="soft-eyebrow">для первого знакомства</p>
            <h2 id="symbolic-library-faq-title" className="soft-h2 mt-2">Как устроены символические практики</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--soft-ink-soft)]">Короткие ответы на вопросы, которые обычно появляются до первого расклада или расчёта.</p>
            <div className="mt-5 divide-y divide-[var(--soft-paper-edge)] rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5">
              {SYMBOLIC_FAQS.map((faq) => (
                <details key={faq.question} className="py-5">
                  <summary className="cursor-pointer list-none font-semibold text-[var(--soft-ink)] marker:content-none">{faq.question}</summary>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--soft-ink-soft)]">{faq.answer}</p>
                </details>
              ))}
            </div>
        </section>
      </section>
    </main>
  );
}
